import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const python = join(
  project,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: project, stdio: 'inherit' });
  if (result.error || result.status !== 0)
    throw new Error(
      result.error?.message ?? `${command} failed with exit ${result.status}.`,
    );
}
function supportedPython(command: string) {
  return (
    spawnSync(
      command,
      [
        '-I',
        '-c',
        'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)',
      ],
      { timeout: 10_000, stdio: 'ignore' },
    ).status === 0
  );
}
try {
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('Node.js 24 or newer is required.');
  if (!existsSync(python)) {
    const candidates = process.env.PYTHON
      ? [process.env.PYTHON]
      : ['python3', 'python'];
    const base = candidates.find(supportedPython);
    if (!base)
      throw new Error(
        'Python 3.11 or newer is required. Install it or set PYTHON to its executable.',
      );
    run(base, ['-m', 'venv', join(project, '.venv')]);
  }
  if (!supportedPython(python))
    throw new Error(
      'The project .venv needs Python 3.11 or newer. Recreate .venv with a supported interpreter.',
    );
  run(python, [
    '-m',
    'pip',
    'install',
    '-r',
    join(project, 'requirements.txt'),
  ]);
  const require = createRequire(import.meta.url);
  const cliRequire = createRequire(
    require.resolve('@cs-object/cli/package.json'),
  );
  const playwright = dirname(cliRequire.resolve('playwright/package.json'));
  run(process.execPath, [
    join(playwright, 'cli.js'),
    'install',
    'chromium',
  ]);
  process.stdout.write('Setup complete. Run npm run dev.\n');
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\nFix the error, then run npm run setup again. Your project files are preserved.\n`,
  );
  process.exitCode = 1;
}
