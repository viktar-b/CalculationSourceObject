import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';
import { z } from 'zod';

const job = z.object({ needs: z.literal('changes'), if: z.string() });
const workflow = z.object({
  on: z.record(z.string(), z.unknown()),
  jobs: z.object({
    changes: z.object({
      outputs: z.record(z.string(), z.string()),
      steps: z.array(z.object({ id: z.string().optional(), run: z.string().optional() })),
    }),
    quality: job,
    isolation: job,
    'installed-packages': job,
  }),
}).parse(parse(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')));
const script = z.string().min(1).parse(workflow.jobs.changes.steps.find((step) => step.id === 'classify')?.run);

type Change =
  | { kind: 'write'; paths: string[] }
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'delete'; path: string }
  | { kind: 'empty' };

type Policy = { quality: boolean; isolation: boolean; 'installed-packages': boolean };
const full: Policy = { quality: true, isolation: true, 'installed-packages': true };
const projects: Policy = { quality: true, isolation: true, 'installed-packages': false };
const quality: Policy = { quality: true, isolation: false, 'installed-packages': false };
const skip: Policy = { quality: false, isolation: false, 'installed-packages': false };
const jobNames = ['quality', 'isolation', 'installed-packages'] satisfies (keyof Policy)[];

function expression(source: string, context: object): unknown {
  assert.ok(source.startsWith('${{') && source.endsWith('}}'));
  return runInNewContext(source.slice(3, -2), context, { timeout: 1000 });
}

function policy({ outputs, result = 'success', cancelled = false }: {
  outputs: Record<string, string>;
  result?: string;
  cancelled?: boolean;
}): Policy {
  const context = { needs: { changes: { result, outputs } }, cancelled: () => cancelled };
  return {
    quality: z.boolean().parse(expression(workflow.jobs.quality.if, context)),
    isolation: z.boolean().parse(expression(workflow.jobs.isolation.if, context)),
    'installed-packages': z.boolean().parse(expression(workflow.jobs['installed-packages'].if, context)),
  };
}

function classify({ change, event = 'pull_request', missingBase = false, missingHead = false }: {
  change: Change;
  event?: string;
  missingBase?: boolean;
  missingHead?: boolean;
}): Record<string, string> {
  const directory = mkdtempSync(join(tmpdir(), 'cso-ci-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
  };
  try {
    git('init', '--quiet');
    git('config', 'user.email', 'ci@example.invalid');
    git('config', 'user.name', 'CI test');
    write('README.md', 'original\n');
    if (change.kind === 'rename') write(change.from, 'original\n');
    if (change.kind === 'delete') write(change.path, 'original\n');
    git('add', '.');
    git('commit', '--quiet', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    switch (change.kind) {
      case 'write':
        for (const path of change.paths) write(path, 'changed\n');
        break;
      case 'rename':
        mkdirSync(dirname(join(directory, change.to)), { recursive: true });
        git('mv', change.from, change.to);
        break;
      case 'delete':
        git('rm', change.path);
        break;
      case 'empty':
        break;
      default: {
        const exhaustive: never = change;
        throw new Error(`Unknown change: ${exhaustive}`);
      }
    }
    git('add', '.');
    git('commit', '--quiet', '--allow-empty', '-m', 'change');
    const output = join(directory, 'output');
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: event,
        BASE_SHA: missingBase ? 'missing' : base,
        HEAD_SHA: missingHead ? 'missing' : git('rev-parse', 'HEAD'),
        GITHUB_OUTPUT: output,
        RUNNER_TEMP: directory,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const outputs = z.record(z.string(), z.enum(['true', 'false'])).parse(Object.fromEntries(
      readFileSync(output, 'utf8').trim().split('\n').map((line) => line.split('=')),
    ));
    return z.record(z.string(), z.string()).parse(Object.fromEntries(
      Object.entries(workflow.jobs.changes.outputs).map(([name, source]) => [
        name, expression(source, { steps: { classify: { outputs } } }),
      ]),
    ));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const [name, change, expected] of [
  ['Markdown only', { kind: 'write', paths: ['README.md', 'guide with spaces.md', 'line\nbreak.md'] }, skip],
  ['package source', { kind: 'write', paths: ['packages/cso-core/src/index.ts'] }, projects],
  ['demo source', { kind: 'write', paths: ['apps/demo/app/page.tsx'] }, projects],
  ['Python package', { kind: 'write', paths: ['packages/cso-python/src/cso_python/cli.py'] }, projects],
  ['initializer template', { kind: 'write', paths: ['packages/create-cs-object/template/reports.json'] }, projects],
  ['mixed Markdown and code', { kind: 'write', paths: ['README.md', 'packages/cso-core/src/index.ts'] }, projects],
  ['example only', { kind: 'write', paths: ['examples/two-panel/reference.json'] }, quality],
  ['integration test only', { kind: 'write', paths: ['tests/integration/html-report.test.ts'] }, quality],
  ['integration and package code', { kind: 'write', paths: ['tests/integration/html-report.test.ts', 'packages/cso-cli/src/index.ts'] }, projects],
  ['workflow changes', { kind: 'write', paths: ['.github/workflows/ci.yml'] }, full],
  ['CI tooling changes', { kind: 'write', paths: ['scripts/check-ci.test.ts'] }, full],
  ['unknown path', { kind: 'write', paths: ['new-project/code.py'] }, full],
  ['non-Markdown docs', { kind: 'write', paths: ['docs/diagram.svg'] }, full],
  ['package code renamed to Markdown', { kind: 'rename', from: 'packages/cso-core/src/code.ts', to: 'docs/code.md' }, projects],
  ['package code moved to integration', { kind: 'rename', from: 'packages/cso-core/src/code.ts', to: 'tests/integration/code.ts' }, projects],
  ['deleted package code', { kind: 'delete', path: 'packages/cso-core/src/code.ts' }, projects],
  ['deleted example', { kind: 'delete', path: 'examples/two-panel/reference.json' }, quality],
  ['empty diff', { kind: 'empty' }, full],
] satisfies [string, Change, Policy][]) {
  test(name, () => assert.deepEqual(policy({ outputs: classify({ change }) }), expected));
}

for (const path of ['package.json', 'package-lock.json', '.nvmrc', '.npmrc', 'tsconfig.base.json', 'biome.json', 'vitest.config.ts', 'vercel.json']) {
  test(`${path} runs quality and isolation`, () => {
    assert.deepEqual(policy({ outputs: classify({ change: { kind: 'write', paths: [path] } }) }), projects);
  });
}

for (const event of ['push', 'workflow_dispatch', 'workflow_call']) {
  test(`${event} runs all checks even for Markdown`, () => {
    assert.deepEqual(policy({ outputs: classify({ change: { kind: 'write', paths: ['README.md'] }, event }) }), full);
  });
}

for (const reference of ['base', 'head']) {
  test(`missing ${reference} runs all checks`, () => {
    assert.deepEqual(policy({ outputs: classify({
      change: { kind: 'write', paths: ['README.md'] },
      missingBase: reference === 'base',
      missingHead: reference === 'head',
    }) }), full);
  });
}

test('failed detector and missing outputs run all checks', () => {
  assert.deepEqual(policy({ outputs: { run_quality: 'false', run_isolation: 'false', run_packages: 'false' }, result: 'failure' }), full);
  assert.deepEqual(policy({ outputs: {} }), full);
});

test('missing job output runs the affected check', () => {
  assert.deepEqual(policy({ outputs: { run_quality: 'false', run_packages: 'false' } }), {
    ...skip, isolation: true,
  });
});

test('cancellation prevents fallback jobs', () => {
  assert.deepEqual(policy({ outputs: {}, result: 'failure', cancelled: true }), skip);
});

test('required jobs remain reported without workflow path filters', () => {
  assert.equal(workflow.on.pull_request, null);
  for (const name of jobNames) assert.equal(workflow.jobs[name].needs, 'changes');
});

test('release runs full reusable CI before both registries publish', () => {
  const release = z.object({ jobs: z.object({
    checks: z.object({ uses: z.string(), if: z.string() }),
    npm: z.object({ needs: z.string() }),
    python: z.object({ needs: z.string() }),
  }) }).parse(parse(readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')));
  assert.ok('workflow_call' in workflow.on);
  assert.ok('workflow_dispatch' in workflow.on);
  assert.equal(release.jobs.checks.uses, './.github/workflows/ci.yml');
  assert.equal(release.jobs.checks.if, "github.ref == 'refs/heads/main'");
  assert.equal(release.jobs.npm.needs, 'checks');
  assert.equal(release.jobs.python.needs, 'checks');
});
