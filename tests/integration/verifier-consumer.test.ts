import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('runs copied verifier fixtures through built ESM and CJS exports', () => {
  const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
  const temporaryDirectory = mkdtempSync(
    join(repositoryRoot, 'node_modules', '.verifier-consumer-'),
  );
  try {
    for (const directory of ['contract-cases', 'verifier-cases']) {
      cpSync(
        join(repositoryRoot, 'tests', 'fixtures', directory),
        join(temporaryDirectory, directory),
        { recursive: true },
      );
    }
    const output = execFileSync(
      process.execPath,
      [join(temporaryDirectory, 'verifier-cases', 'check.mjs')],
      { encoding: 'utf8' },
    );
    expect(output).toContain('PASS verifier ESM/CJS');
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
