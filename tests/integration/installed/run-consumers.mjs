// Workspace-owned composition checks against a supplied, freshly installed consumer.
import { cpSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const [consumer, python] = process.argv.slice(2);
if (!consumer || !python)
  throw new Error(
    'Usage: node run-consumers.mjs <consumer> <installed-python>',
  );
for (const directory of [
  'examples/two-panel',
]) {
  cpSync(join(repository, directory), join(consumer, directory), {
    recursive: true,
    filter: (path) =>
      !path.split('/').some((part) =>
        ['pdfs', '__pycache__', '_cso_bindings'].includes(part),
      ),
  });
}
const fixtures = join(repository, 'tests/integration/installed/fixtures');
for (const name of readdirSync(fixtures))
  cpSync(join(fixtures, name), join(consumer, name));
cpSync(
  join(fixtures, 'signed-zero.cso.py.txt'),
  join(consumer, 'signed-zero.cso.py'),
);
for (const name of [
  'verify-consumer.mjs',
  'signed-zero-consumer.mjs',
  'pdf-consumer.mjs',
]) {
  cpSync(
    join(repository, 'tests/integration/installed', name),
    join(consumer, name),
  );
  const environment = { ...process.env, PYTHON: python };
  for (const key of ['NODE_PATH', 'PYTHONPATH', 'PYTHONHOME'])
    delete environment[key];
  const result = spawnSync(process.execPath, [name], {
    cwd: consumer,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0)
    throw new Error(`${name} failed: ${result.error ?? result.status}`);
}
for (const file of [
  'stage-a-results.json',
  'signed-zero-results.json',
  'pdf-results.json',
]) {
  const report = JSON.parse(readFileSync(join(consumer, file), 'utf8'));
  if (!report.ok) throw new Error(`${file} failed`);
}
