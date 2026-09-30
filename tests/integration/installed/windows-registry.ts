import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { writeJson } from './_initializer-evidence.ts';
import type { CommandRecord, CommandRunner } from './_initializer-processes.ts';
import {
  closeRegistry,
  registryPackage,
  startRegistry,
} from './_initializer-registry.ts';

const ConfigSchema = z.strictObject({
  archives: z.string().min(1),
  readyPath: z.string().min(1),
  stopPath: z.string().min(1),
  evidenceRoot: z.string().min(1),
});

const configPath = z.string().min(1).parse(process.env.CSO_WINDOWS_CONFIG);
const config = ConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
const commands: CommandRecord[] = [];

const run: CommandRunner = async ({ cwd, command, args, env, timeoutMs }) => {
  const record: CommandRecord = { cwd, command, args, status: null };
  const commandNumber = commands.push(record);
  return await new Promise<string>((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env: env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    let spawnError: Error | undefined;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs ?? 60_000);
    child.once('error', (error) => {
      spawnError = error;
    });
    child.once('close', (status) => {
      clearTimeout(timer);
      record.status = status;
      const output = Buffer.concat(stdout).toString('utf8');
      const errorOutput = Buffer.concat(stderr).toString('utf8');
      writeFileSync(
        join(config.evidenceRoot, `registry-command-${commandNumber}.log`),
        `${output}${errorOutput}`,
      );
      if (spawnError) rejectRun(spawnError);
      else if (timedOut) rejectRun(new Error(`${command} timed out`));
      else if (status !== 0)
        rejectRun(
          new Error(
            `${command} ${args.join(' ')} exited ${status}\n${errorOutput}`,
          ),
        );
      else resolveRun(output);
    });
  });
};

let registry: Awaited<ReturnType<typeof startRegistry>> | undefined;
try {
  const archivePaths = readdirSync(config.archives)
    .filter((name) => name.endsWith('.tgz'))
    .sort()
    .map((name) => join(config.archives, name));
  const packages = await Promise.all(
    archivePaths.map((archive) =>
      registryPackage({ archive, root: config.evidenceRoot, run }),
    ),
  );
  registry = await startRegistry(packages);
  writeJson(config.readyPath, {
    origin: registry.origin,
    packages: packages.map(({ archive, manifest, integrity, shasum }) => ({
      archive,
      name: manifest.name,
      version: manifest.version,
      integrity,
      shasum,
    })),
  });
  await new Promise<void>((resolveStop) => {
    const timer = setInterval(() => {
      if (!existsSync(config.stopPath)) return;
      clearInterval(timer);
      resolveStop();
    }, 250);
  });
  await closeRegistry(registry.server);
  registry = undefined;
  writeJson(join(config.evidenceRoot, 'registry-commands.json'), commands);
} catch (error: unknown) {
  if (registry) await closeRegistry(registry.server);
  writeJson(join(config.evidenceRoot, 'registry-failure.json'), {
    message: error instanceof Error ? error.message : String(error),
    commands,
  });
  throw error;
}
