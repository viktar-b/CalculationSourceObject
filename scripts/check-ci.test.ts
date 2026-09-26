import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { z } from 'zod';

const workflow = z.object({
  jobs: z.object({
    changes: z.object({ steps: z.array(z.object({ id: z.string().optional(), run: z.string().optional() })) }),
  }),
}).parse(parse(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')));
const script = workflow.jobs.changes.steps.find((step) => step.id === 'classify')?.run;
assert.ok(script, 'CI must classify documentation-only changes before expensive jobs');

for (const scenario of [
  { name: 'Markdown only', files: ['README.md', 'guide with spaces.md', 'line\nbreak.md'], expected: false },
  { name: 'mixed changes', files: ['README.md', 'code.py'], expected: true },
  { name: 'workflow changes', files: ['ci.yml'], expected: true },
  { name: 'non-Markdown docs', files: ['diagram.svg'], expected: true },
  { name: 'code renamed to Markdown', files: ['code.md'], rename: true, expected: true },
  { name: 'deleted code', files: [], remove: true, expected: true },
  { name: 'empty diff', files: [], expected: true },
  { name: 'missing base', files: ['README.md'], invalidBase: true, expected: true },
  { name: 'push', files: ['README.md'], event: 'push', expected: true },
  { name: 'manual run', files: ['README.md'], event: 'workflow_dispatch', expected: true },
]) {
  test(scenario.name, () => {
    const directory = mkdtempSync(join(tmpdir(), 'cso-ci-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
    try {
      git('init', '--quiet');
      git('config', 'user.email', 'ci@example.invalid');
      git('config', 'user.name', 'CI test');
      writeFileSync(join(directory, 'code.py'), 'original\n');
      git('add', '.');
      git('commit', '--quiet', '-m', 'base');
      const base = git('rev-parse', 'HEAD');
      if (scenario.rename) git('mv', 'code.py', 'code.md');
      if (scenario.remove) git('rm', 'code.py');
      for (const file of scenario.files) writeFileSync(join(directory, file), 'changed\n');
      git('add', '.');
      git('commit', '--quiet', '--allow-empty', '-m', 'change');
      const output = join(directory, 'output');
      const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: scenario.event ?? 'pull_request',
          BASE_SHA: scenario.invalidBase ? 'missing' : base,
          HEAD_SHA: git('rev-parse', 'HEAD'),
          GITHUB_OUTPUT: output,
          RUNNER_TEMP: directory,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(output, 'utf8').trim(), `run_full=${scenario.expected}`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
