import { spawn } from 'node:child_process';
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
try {
  if (!existsSync(python))
    throw new Error(
      'Run npm run setup to prepare the project Python environment.',
    );
  const require = createRequire(import.meta.url);
  const cli = join(
    dirname(require.resolve('@cs-object/cli/package.json')),
    'dist/cli.js',
  );
  const child = spawn(
    process.execPath,
    [
      cli,
      'dev',
      'calculations/report.cso.py',
      '--function',
      'calculate',
      ...process.argv.slice(2),
    ],
    {
      cwd: project,
      env: { ...process.env, PYTHON: python },
      stdio: 'inherit',
    },
  );
  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  child.once('error', (error) => {
    process.stderr.write(`${error.message}\n`);
  });
  child.once('close', (code, signal) => {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
    process.exitCode =
      code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
  });
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
