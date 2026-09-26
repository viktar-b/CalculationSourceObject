import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./check-pr-title.ts', import.meta.url));

for (const title of [
  'feat(formulas): expand verified Python function support',
  'fix(demo): show original Python',
  'build(deps-dev): bump @biomejs/biome to 2.5.14',
  'docs(contributing): document scoped PR titles',
  'custom(cso-python): support a repository-specific type',
  'fix(core): x',
  'docs(authoring): explain α and β',
  'fix(core): preserve literal $(command) and `code` in a title',
]) {
  test(`accepts ${title}`, () => {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, PR_TITLE: title },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /matches the contribution format/);
  });
}

for (const title of [
  '',
  'Extend verified Python formulas with math functions and compound predicates',
  'Remove deprecated Zod finite and passthrough calls',
  'feat: expand function support',
  'feat(): expand function support',
  '(formulas): expand function support',
  'feat(formulas) expand function support',
  'feat(formulas):expand function support',
  'feat(formulas): ',
  'feat(formulas):  expand function support',
  ' feat(formulas): expand function support',
  'feat(formulas): expand function support ',
  'feat(formulas): expand\nfunction support',
  'feat(formulas): expand function support\n',
]) {
  test(`rejects ${JSON.stringify(title)}`, () => {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, PR_TITLE: title },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /CONTRIBUTING\.md/);
  });
}
