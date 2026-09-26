import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse, stringify } from 'yaml';
import { z } from 'zod';

// Run the workflow's literal script so the regression cases exercise CI's validator.
const workflow = readFileSync(
  new URL('../.github/workflows/pr-title.yml', import.meta.url),
  'utf8',
);
const workflowSchema = z.object({
  jobs: z.object({
    'pr-title': z.object({
      steps: z.array(z.object({ name: z.string().optional(), run: z.string().optional() })),
    }),
  }),
});

function readValidator(source: string): string {
  const { jobs } = workflowSchema.parse(parse(source));
  const steps = jobs['pr-title'].steps.filter(
    (step) => step.name === 'Validate contribution format',
  );
  assert.equal(steps.length, 1, 'Expected exactly one Validate contribution format step');
  const script = steps[0]?.run;
  assert.ok(typeof script === 'string', 'Expected the validation step to contain a run script');
  assert.match(script, /const scopedTitle = /u, 'Missing title validator marker');
  return script;
}

const script = readValidator(workflow);

test('selects the validator when an earlier step has a run block', () => {
  const withEarlierStep = workflow.replace(
    '      - name: Validate contribution format',
    '      - name: Earlier step\n        run: |\n          console.log("earlier");\n      - name: Validate contribution format',
  );
  assert.equal(readValidator(withEarlierStep), script);
});

test('reads the same validator after YAML reformatting', () => {
  assert.equal(readValidator(stringify(parse(workflow), { indent: 4 })), script);
});

test('fails loudly when the named validation step is missing', () => {
  assert.throws(
    () => readValidator(workflow.replace('Validate contribution format', 'Renamed step')),
    /Expected exactly one Validate contribution format step/u,
  );
});

test('fails loudly when the validator marker is missing', () => {
  assert.throws(
    () => readValidator(workflow.replace('const scopedTitle = ', 'const other = ')),
    /Missing title validator marker/u,
  );
});

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
    const result = spawnSync(process.execPath, ['--eval', script], {
      env: { ...process.env, PR_TITLE: title },
      encoding: 'utf8',
    });
    assert.ifError(result.error);
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
  'feat(formulas): expand\rfunction support',
  'feat(formulas): expand\u2028function support',
  'feat(formulas): expand\u2029function support',
]) {
  test(`rejects ${JSON.stringify(title)}`, () => {
    const result = spawnSync(process.execPath, ['--eval', script], {
      env: { ...process.env, PR_TITLE: title },
      encoding: 'utf8',
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /CONTRIBUTING\.md/);
  });
}
