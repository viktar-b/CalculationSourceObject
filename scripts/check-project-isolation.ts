import { z } from 'zod';
/** Build/test disposable copies with no workspace ancestors or example data. */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const repository = fileURLToPath(new URL('..', import.meta.url));
const output = mkdtempSync(join(tmpdir(), 'cso-isolated-projects-'));
const archives = join(output, 'archives');
mkdirSync(archives);
const commands: {
  project: string;
  command: string;
  args: string[];
  status: number | null;
  log: string;
}[] = [];
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
for (const key of ['NODE_PATH', 'PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV'])
  Reflect.deleteProperty(environment, key);
function run(project: string, cwd: string, command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const log = join(output, `${commands.length + 1}-${project}.log`);
  writeFileSync(log, (result.stdout ?? '') + (result.stderr ?? ''));
  commands.push({ project, command, args, status: result.status, log });
  writeFileSync(
    join(output, 'progress.json'),
    JSON.stringify({ output, commands }, null, 2),
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `${project}: ${command} ${args.join(' ')} failed; see ${log}\n${result.error ?? result.stderr}`,
    );
  return result.stdout;
}
const omit = new Set([
  'node_modules',
  'dist',
  '.next',
  '__pycache__',
  '.venv',
  '.ruff_cache',
  'build',
  'coverage',
]);
function copyProject(relative: string, name: string) {
  const destination = join(output, name, 'project');
  cpSync(join(repository, relative), destination, {
    recursive: true,
    filter: (path) =>
      !path
        .split('/')
        .some(
          (part) =>
            omit.has(part) ||
            part.endsWith('.egg-info') ||
            part.endsWith('.tsbuildinfo'),
        ),
  });
  return destination;
}
console.log(`Isolation artifacts: ${output}`);
const dependencies = new Map<string, string>();
for (const [name, relative] of [
  ['core', 'packages/cso-core'],
  ['react', 'packages/cso-react'],
  ['cli', 'apps/cso-cli'],
  ['demo', 'apps/demo'],
]) {
  const directory = copyProject(relative, name);
  const manifest = z
    .object({
      name: z.string(),
      dependencies: z.record(z.string(), z.string()).optional(),
    })
    .passthrough()
    .parse(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')));
  for (const [dependency, archive] of dependencies) {
    if (manifest.dependencies?.[dependency])
      manifest.dependencies[dependency] = `file:${archive}`;
  }
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify(manifest, null, 2),
  );
  run(name, directory, 'npm', ['install', '--no-audit', '--no-fund']);
  run(name, directory, 'npm', ['run', 'build']);
  run(name, directory, 'npm', ['run', 'typecheck']);
  run(name, directory, 'npm', ['test']);
  if (name !== 'demo') {
    const packed = run(name, directory, 'npm', [
      'pack',
      '--ignore-scripts',
      '--pack-destination',
      archives,
      '--json',
    ]);
    const [{ filename }] = z
      .array(z.object({ filename: z.string() }))
      .nonempty()
      .parse(JSON.parse(packed));
    dependencies.set(manifest.name, join(archives, filename));
  }
  console.log(`${name}: isolated build, typecheck and tests passed`);
}
const directory = copyProject('packages/cso-python', 'python');
const python = process.env.PYTHON ?? 'python3';
const venv = join(output, 'python', 'environment');
run('python', directory, python, ['-m', 'venv', venv]);
const installedPython = join(
  venv,
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
run('python', directory, installedPython, [
  '-m',
  'pip',
  'wheel',
  '--no-deps',
  '--wheel-dir',
  archives,
  '.',
]);
const wheel = readdirSync(archives).find((name) => name.endsWith('.whl'));
if (!wheel) throw new Error('Missing built Python wheel');
run('python', directory, installedPython, [
  '-m',
  'pip',
  'install',
  '--no-index',
  '--no-deps',
  join(archives, wheel),
]);
run('python', directory, installedPython, ['-I', 'tests/run.py']);
const identity = run('python', directory, installedPython, [
  '-I',
  '-c',
  'import cso_python; print(cso_python.__file__)',
]).trim();
if (!identity.startsWith(venv))
  throw new Error(`Unexpected Python import: ${identity}`);
const artifacts = readdirSync(archives).map((name) => ({
  path: join(archives, name),
  sha256: createHash('sha256')
    .update(readFileSync(join(archives, name)))
    .digest('hex'),
}));
writeFileSync(
  join(output, 'qualification.json'),
  JSON.stringify(
    {
      ok: true,
      output,
      commands,
      artifacts,
      python: installedPython,
      packages: Object.fromEntries(dependencies),
      isolation:
        'Each source copy contains only project-owned files; dependencies are installed from package manifests, with declared local packages resolved to the archives built here.',
    },
    null,
    2,
  ),
);
console.log(
  `All five isolated projects passed: ${join(output, 'qualification.json')}`,
);
