import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExecutionResponseSchema } from '@viktar-b/cso-core';
const root = fileURLToPath(new URL('..', import.meta.url));
const gallery = mkdtempSync(join(tmpdir(), 'cso-demo-gallery-'));
const response = ExecutionResponseSchema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../tests/fixtures/contract-cases/two-panel-success.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);
if (!response.ok)
  throw new Error('Expected a successful synthetic protocol fixture');
writeFileSync(
  join(gallery, 'synthetic-contract-case.json'),
  JSON.stringify(response.execution.cso),
);
try {
  const result = spawnSync(
    'npm',
    ['run', process.argv[2] ?? 'dev', '--workspace', '@viktar-b/cso-demo'],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        CSO_GALLERY_DIRECTORY: process.env.CSO_GALLERY_DIRECTORY ?? gallery,
        CSO_PREPARED_DIRECTORY:
          process.env.CSO_PREPARED_DIRECTORY ??
          fileURLToPath(
            new URL(
              '../tests/integration/fixtures/demo-preservation',
              import.meta.url,
            ),
          ),
      },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(gallery, { recursive: true, force: true });
}
