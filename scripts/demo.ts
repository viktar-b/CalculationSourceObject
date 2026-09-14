import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const mode = process.argv[2] ?? 'dev';
let temporary: string | undefined;

try {
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
    'npm',
    [
      'run',
      mode,
      '--workspace',
      '@viktar-b/cso-demo',
      '--',
      ...process.argv.slice(3),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...environment,
        CSO_PREPARED_DIRECTORY:
          environment.CSO_PREPARED_DIRECTORY ??
          fileURLToPath(
            new URL(
              '../tests/integration/fixtures/demo-preservation',
              import.meta.url,
            ),
          ),
      },
    },
  );
  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
} finally {
  if (temporary) {
    rmSync(temporary, { recursive: true, force: true });
  }
}
