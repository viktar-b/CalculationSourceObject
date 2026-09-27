import { type ChildProcess, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type CommandRecord = {
  readonly cwd: string;
  readonly command: string;
  readonly args: readonly string[];
  status: number | null;
};

export type CommandRunner = (options: {
  readonly cwd: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}) => Promise<string>;

export function createCommandRunner(
  logs: string,
  defaultEnvironment: NodeJS.ProcessEnv,
) {
  const commands: CommandRecord[] = [];
  const run: CommandRunner = async (options) => {
    const record: CommandRecord = {
      cwd: options.cwd,
      command: options.command,
      args: options.args,
      status: null,
    };
    const commandIndex = commands.push(record);
    return await new Promise((resolveRun, rejectRun) => {
      const child = spawn(options.command, options.args, {
        cwd: options.cwd,
        env: options.env ?? defaultEnvironment,
        detached: process.platform !== 'win32',
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      let stdout = '';
      let stderr = '';
      let spawnError: Error | undefined;
      let timedOut = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', (error) => {
        spawnError = error;
      });
      const timer = setTimeout(
        () => {
          timedOut = true;
          signalTree(child, 'SIGTERM');
          killTimer = setTimeout(() => signalTree(child, 'SIGKILL'), 5_000);
        },
        options.timeoutMs ?? 10 * 60_000,
      );
      child.once('close', (status) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        record.status = status;
        const log = join(logs, `command-${commandIndex}.log`);
        writeFileSync(log, `${stdout}\n${stderr}`);
        if (spawnError) return rejectRun(spawnError);
        if (timedOut)
          return rejectRun(
            new Error(`${options.command} timed out; see ${log}`),
          );
        if (status !== 0)
          return rejectRun(
            new Error(
              `${options.command} ${options.args.join(' ')} exited ${status}; see ${log}\n${stderr}`,
            ),
          );
        resolveRun(stdout);
      });
    });
  };
  return { commands, run };
}

export type DevServer = {
  readonly origin: string;
  stop(): Promise<void>;
};

function signalTree(
  child: Pick<ChildProcess, 'kill' | 'pid'>,
  signal: NodeJS.Signals,
) {
  if (child.pid === undefined) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH'))
      throw error;
  }
}

type ProcessExit = {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
};

async function stopProcess(options: {
  readonly child: Pick<ChildProcess, 'kill' | 'pid'>;
  readonly exited: Promise<ProcessExit>;
  readonly signal: NodeJS.Signals;
  readonly log: string;
  isRunning(): boolean;
  output(): string;
}): Promise<boolean> {
  if (options.isRunning()) signalTree(options.child, options.signal);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const graceful = await Promise.race([
    options.exited.then((result) => ({ kind: 'exited', result })),
    new Promise<{ readonly kind: 'timeout' }>((resolveTimeout) => {
      timeout = setTimeout(() => resolveTimeout({ kind: 'timeout' }), 10_000);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  if (graceful.kind === 'timeout') {
    if (options.isRunning()) signalTree(options.child, 'SIGKILL');
    await options.exited;
  }
  writeFileSync(options.log, options.output());
  return graceful.kind === 'timeout';
}

export async function startDev(options: {
  readonly project: string;
  readonly name: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly logs: string;
}): Promise<DevServer> {
  const child = spawn('npm', ['run', 'dev', '--', '--port', '0'], {
    cwd: options.project,
    env: options.environment,
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  let running = true;
  const exited = new Promise<ProcessExit>((resolveExit) => {
    child.once('close', (status, signal) => {
      running = false;
      resolveExit({ status, signal });
    });
  });
  const log = join(options.logs, `${options.name}.log`);
  let origin: string;
  try {
    origin = await new Promise<string>((resolveOrigin, rejectOrigin) => {
      const timer = setTimeout(() => {
        rejectOrigin(
          new Error(`Dev server did not start\n${stdout}\n${stderr}`),
        );
      }, 60_000);
      const inspect = () => {
        const match = /CSO dev (http:\/\/127\.0\.0\.1:\d+)/.exec(stdout);
        if (!match?.[1]) return;
        clearTimeout(timer);
        resolveOrigin(match[1]);
      };
      child.stdout.on('data', inspect);
      child.once('error', (error) => {
        clearTimeout(timer);
        rejectOrigin(error);
      });
      child.once('close', (status, signal) => {
        clearTimeout(timer);
        rejectOrigin(
          new Error(
            `Dev server exited before listening (${status ?? signal})\n${stdout}\n${stderr}`,
          ),
        );
      });
    });
  } catch (error) {
    await stopProcess({
      child,
      exited,
      signal: 'SIGTERM',
      log,
      isRunning: () => running,
      output: () => `${stdout}\n${stderr}`,
    });
    throw error;
  }
  let stopPromise: Promise<void> | undefined;
  return {
    origin,
    async stop() {
      stopPromise ??= (async () => {
        const forced = await stopProcess({
          child,
          exited,
          signal: 'SIGINT',
          log,
          isRunning: () => running,
          output: () => `${stdout}\n${stderr}`,
        });
        if (forced)
          throw new Error(`${options.name} required SIGKILL during shutdown`);
      })();
      await stopPromise;
    },
  };
}
