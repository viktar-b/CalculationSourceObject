// Runs only against the supplied consumer's installed archives and wheel.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { CommandReportSchema } from '@cs-object/core';

const cli = resolve('node_modules/@cs-object/cli/dist/cli.js');
const output = resolve('html-output/panels.html');
mkdirSync('html-output', { recursive: true });
const results = [];
function run(name, command, args, expected, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  for (const key of ['NODE_PATH', 'PYTHONPATH', 'PYTHONHOME']) delete env[key];
  const response = spawnSync(
    process.execPath,
    [cli, command, ...args, '--format', 'json'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env,
    },
  );
  assert.equal(response.status, expected, response.stdout + response.stderr);
  const report = CommandReportSchema.parse(JSON.parse(response.stdout));
  writeFileSync(`html-output/${name}.json`, response.stdout);
  writeFileSync(`html-output/${name}.stderr`, response.stderr);
  results.push({ name, exitCode: response.status, checks: report.checks });
  return { report, stderr: response.stderr };
}
const panel = [
  'examples/two-panel/estimate.cso.py',
  '--function',
  'estimate',
  '--input',
  'width=2',
  '--out',
  output,
];
const exported = run('without-browser', 'html', panel, 0, {
  PLAYWRIGHT_BROWSERS_PATH: resolve('absent-browser'),
});
assert.equal(exported.report.command, 'html');
assert.equal(exported.report.checks.documentContent.status, 'passed');
assert.equal(exported.report.checks.rendering.status, 'not_applicable');
const html = readFileSync(output);
assert.equal(
  createHash('sha256').update(html).digest('hex'),
  exported.report.output.sha256,
);
assert(html.includes(Buffer.from('<math')));
assert(html.includes(Buffer.from('data:image/svg+xml;base64,')));
assert(html.includes(Buffer.from('190mm')));
const locatorLine = exported.stderr
  .split('\n')
  .find((line) => line.startsWith('CSO evidence '));
assert(locatorLine);
const locator = JSON.parse(locatorLine.slice('CSO evidence '.length));
const manifest = JSON.parse(readFileSync(locator.path, 'utf8'));
assert.deepEqual(manifest.html, exported.report.output);
assert.equal(
  manifest.outcomes.engineeringPresentation.automatic,
  'not_applicable',
);
const checked = run('checked', 'html', [...panel, '--check-layout'], 0);
assert.equal(checked.report.checks.rendering.status, 'passed');
const onlyOutput = resolve('html-output/only.html');
run(
  'without-evidence',
  'html',
  [...panel.slice(0, -1), onlyOutput, '--no-evidence'],
  0,
);
assert(!existsSync(`${onlyOutput}.evidence`));
writeFileSync(output, 'preserved HTML');
const unavailable = run(
  'browser-unavailable',
  'html',
  [...panel, '--check-layout'],
  1,
  {
    PLAYWRIGHT_BROWSERS_PATH: resolve('absent-browser'),
  },
);
assert.equal(readFileSync(output, 'utf8'), 'preserved HTML');
assert.equal(unavailable.report.checks.rendering.status, 'failed');
assert(
  unavailable.report.diagnostics.some((item) => item.stage === 'rendering'),
);

// A missing packaged stylesheet fails HTML preparation before browser work.
const stylesheet = createRequire(import.meta.url).resolve(
  '@cs-object/react/style.css',
);
renameSync(stylesheet, `${stylesheet}.test-backup`);
try {
  const failed = run('html-build-failed', 'html', panel, 1);
  assert.equal(failed.report.checks.documentContent.status, 'failed');
  assert.equal(failed.report.checks.rendering.status, 'not_applicable');
  assert(
    failed.report.diagnostics.some(
      (item) => item.code === 'DOCUMENT_PREPARATION_FAILED',
    ),
  );
  assert.equal(readFileSync(output, 'utf8'), 'preserved HTML');
} finally {
  renameSync(`${stylesheet}.test-backup`, stylesheet);
}

writeFileSync('overflow.cso.py', readFileSync('overflow.cso.py.txt'));
for (const command of ['html', 'pdf']) {
  const path = resolve(`html-output/overflow.${command}`);
  writeFileSync(path, 'previous artifact');
  const { report } = run(
    `overflow-${command}`,
    command,
    [
      'overflow.cso.py',
      '--function',
      'polynomial',
      '--out',
      path,
      ...(command === 'html' ? ['--check-layout'] : []),
    ],
    1,
  );
  assert.equal(readFileSync(path, 'utf8'), 'previous artifact');
  assert.equal(report.checks.rendering.status, 'failed');
  assert(
    report.diagnostics.some(
      (item) =>
        item.code === 'DOCUMENT_LAYOUT_OVERFLOW' &&
        item.layout?.overflowPx > 2 &&
        item.layout.sourcePlacementId,
    ),
  );
}
writeFileSync(
  'html-results.json',
  JSON.stringify({ ok: true, results }, null, 2),
);
