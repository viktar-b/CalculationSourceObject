import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const projects = [
  'packages/cso-core',
  'packages/cso-react',
  'packages/cso-python',
  'apps/cso-cli',
  'apps/demo',
];
const ignored = new Set([
  'node_modules',
  'dist',
  '.next',
  '__pycache__',
  'build',
  '.ruff_cache',
  '.venv',
]);
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name) || entry.name.endsWith('.egg-info')) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
test('projects do not import workspace source or fixture files', () => {
  const violations: string[] = [];
  for (const project of projects) {
    const root = resolve(repository, project);
    for (const path of files(root)) {
      if (!['.ts', '.tsx', '.mjs', '.py'].includes(extname(path))) continue;
      const source = readFileSync(path, 'utf8');
      for (const [, imported] of source.matchAll(
        /(?:from\s+|import\s*\(|require\s*\()\s*['"](\.[^'"]+)['"]/g,
      )) {
        const target = resolve(dirname(path), imported);
        if (relative(root, target).startsWith('..'))
          violations.push(`${relative(repository, path)} -> ${imported}`);
      }
      if (
        /(?:examples\/two-panel|tests\/fixtures\/contract-cases)/.test(
          source,
        )
      ) {
        violations.push(
          `${relative(repository, path)} hardcodes workspace data`,
        );
      }
    }
    if (project !== 'packages/cso-python') {
      const config = JSON.parse(
        readFileSync(resolve(root, 'tsconfig.json'), 'utf8'),
      );
      expect(
        config.extends,
        `${project} compiler configuration`,
      ).toBeUndefined();
      const manifest = readFileSync(resolve(root, 'package.json'), 'utf8');
      expect(manifest, `${project} scripts`).not.toContain('--workspace');
    }
  }
  expect(violations).toEqual([]);
});
