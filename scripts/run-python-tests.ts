import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(
  process.env.PYTHON ?? 'python3',
  [fileURLToPath(new URL('../packages/cso-python/tests/run.py', import.meta.url))],
  { stdio: 'inherit' },
);

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
}
process.exitCode = result.status ?? 1;
