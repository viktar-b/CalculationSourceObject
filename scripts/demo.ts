import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const mode = process.argv[2] ?? 'dev';
let temporary: string | undefined;

try {
  const npmEntry = process.env.npm_execpath;
  if (
    !npmEntry ||
    !isAbsolute(npmEntry) ||
    !statSync(npmEntry, { throwIfNoEntry: false })?.isFile()
  ) {
    throw new Error(
      'The demo launcher requires the npm entry supplied by npm. Run "npm run dev" or "npm run build:demo" from the repository root.',
    );
  }
  const environment = { ...process.env };
  if (
    environment.CSO_GALLERY_DIRECTORY === undefined &&
    environment.CSO_EXAMPLES_DIRECTORY === undefined
  ) {
    temporary = mkdtempSync(join(tmpdir(), 'cso-demo-examples-'));
    environment.CSO_EXAMPLES_DIRECTORY = (
      await import('./prepare-demo-examples.ts')
    ).prepareDemoExamples({ directory: temporary });
  }
  const result = spawnSync(
    process.execPath,
    [
      npmEntry,
      'run',
      mode,
      '--workspace',
      '@cs-object/demo',
      '--',
      ...process.argv.slice(3),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: environment,
      shell: false,
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(`Demo npm process terminated by ${result.signal}`);
  }
  process.exitCode = result.status ?? 1;
} finally {
  if (temporary) {
    rmSync(temporary, { recursive: true, force: true });
  }
}
