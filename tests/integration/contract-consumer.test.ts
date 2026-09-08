import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('runs the copied contract examples through built ESM and CJS exports', () => {
  const output = execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../fixtures/contract-cases/check.mjs', import.meta.url),
      ),
    ],
    { encoding: 'utf8' },
  );
  expect(output).toContain('PASS contract ESM/CJS');
});
