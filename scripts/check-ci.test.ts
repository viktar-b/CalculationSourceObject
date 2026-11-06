import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';
import { z } from 'zod';

const step = z.object({
  name: z.string().optional(),
  if: z.string().optional(),
  shell: z.string().optional(),
  run: z.string().optional(),
  uses: z.string().optional(),
  with: z.record(z.string(), z.unknown()).optional(),
});
const job = z.object({
  needs: z.unknown().optional(),
  if: z.string().optional(),
  steps: z.array(step),
});
const workflow = z
  .object({
    on: z.record(z.string(), z.unknown()),
    jobs: z.object({
      quality: job,
      isolation: job,
      'installed-packages': job,
      'windows-installed': job.extend({
        name: z.string(),
        'runs-on': z.literal('windows-2025'),
        strategy: z.object({
          'fail-fast': z.literal(false),
          matrix: z.object({
            include: z.array(
              z.object({
                id: z.string(),
                edition: z.string(),
                major: z.string(),
              }),
            ),
          }),
        }),
      }),
    }),
  })
  .parse(
    parse(
      readFileSync(
        new URL('../.github/workflows/ci.yml', import.meta.url),
        'utf8',
      ),
    ),
  );

const githubExpression = (value: string) =>
  `${String.fromCodePoint(36)}{{ ${value} }}`;

test('every PR runs all verification jobs without routing or path filters', () => {
  assert.equal(workflow.on.pull_request, null);
  for (const check of Object.values(workflow.jobs)) {
    assert.equal(check.needs, undefined);
    assert.equal(check.if, undefined);
  }
});

test('Windows installed-user cases use explicit native PowerShell hosts', () => {
  assert.equal(
    workflow.jobs['windows-installed'].name,
    `windows-installed (${githubExpression('matrix.id')})`,
  );
  assert.deepEqual(workflow.jobs['windows-installed'].strategy.matrix.include, [
    { id: 'powershell-5.1', edition: 'Desktop', major: '5' },
    { id: 'pwsh-7', edition: 'Core', major: '7' },
  ]);
  const workflowSteps = workflow.jobs['windows-installed'].steps.filter(
    (step) => step.run,
  );
  assert.deepEqual(workflowSteps, [
    {
      name: 'Run the installed-user workflow in PowerShell 5.1',
      if: githubExpression("matrix.id == 'powershell-5.1'"),
      shell: 'powershell',
      run: '& .\\tests\\integration\\installed\\windows-user-workflow.ps1',
    },
    {
      name: 'Run the installed-user workflow in PowerShell 7',
      if: githubExpression("matrix.id == 'pwsh-7'"),
      shell: 'pwsh',
      run: '& .\\tests\\integration\\installed\\windows-user-workflow.ps1',
    },
  ]);
  const node = workflow.jobs['windows-installed'].steps.find((step) =>
    step.uses?.startsWith('actions/setup-node@'),
  );
  const python = workflow.jobs['windows-installed'].steps.find((step) =>
    step.uses?.startsWith('actions/setup-python@'),
  );
  assert.equal(node?.with?.['node-version'], '24');
  assert.equal(python?.with?.['python-version'], '3.11');
});

test('Windows PowerShell reads the Unicode workflow as UTF-8', () => {
  const bytes = readFileSync(
    new URL(
      '../tests/integration/installed/windows-user-workflow.ps1',
      import.meta.url,
    ),
  );
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert(bytes.includes(Buffer.from('é', 'utf8')));
});

test('release runs full reusable CI before both registries publish', () => {
  const release = z
    .object({
      jobs: z.object({
        checks: z.object({ uses: z.string(), if: z.string() }),
        npm: z.object({ needs: z.string() }),
        python: z.object({ needs: z.string() }),
      }),
    })
    .parse(
      parse(
        readFileSync(
          new URL('../.github/workflows/release.yml', import.meta.url),
          'utf8',
        ),
      ),
    );
  assert.ok('workflow_call' in workflow.on);
  assert.ok('workflow_dispatch' in workflow.on);
  assert.equal(release.jobs.checks.uses, './.github/workflows/ci.yml');
  assert.equal(release.jobs.checks.if, "github.ref == 'refs/heads/main'");
  assert.equal(release.jobs.npm.needs, 'checks');
  assert.equal(release.jobs.python.needs, 'checks');
});
