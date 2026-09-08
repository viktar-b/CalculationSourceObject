// Copied into the isolated consumer before execution, so all imports resolve there.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  readdirSync,
  renameSync,
} from 'node:fs';
import { resolve } from 'node:path';
import {
  CommandReportSchema,
  ExecutionResponseSchema,
} from '@viktar-b/cso-core';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const twoPanelReference = 'examples/two-panel/reference.json';
const write = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2));
const cli = resolve('node_modules/@viktar-b/cso-cli/dist/cli.js');
const realPython = process.env.PYTHON;
assert(realPython);
// Recreate ignored editor/runtime bindings from the copied canonical sources.
rmSync('examples/two-panel/_cso_bindings', { recursive: true, force: true });
for (const extraArgs of [[], ['--check']]) {
  const generated = spawnSync(
    process.execPath,
    [cli, 'bindings', 'examples/two-panel', ...extraArgs],
    { encoding: 'utf8' },
  );
  assert.equal(generated.status, 0, generated.stdout + generated.stderr);
  assert.equal(JSON.parse(generated.stdout).ok, true);
}
const wrapper = resolve('python-observer.mjs');
writeFileSync(
  wrapper,
  `#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {appendFileSync, writeFileSync, readFileSync} from 'node:fs';
appendFileSync('invocations.jsonl', JSON.stringify(process.argv.slice(2))+'\\n');
process.stderr.write('observer operational stderr\\n');
const r=spawnSync(${JSON.stringify(realPython)}, process.argv.slice(2), {encoding:'utf8', maxBuffer:64*1024*1024});
writeFileSync('captured-execution.json', r.stdout);
if(process.env.CSO_TEST_RESPONSE) process.stdout.write(readFileSync(process.env.CSO_TEST_RESPONSE));
else process.stdout.write(r.stdout);
process.stderr.write(r.stderr);
process.exitCode = r.status ?? 1;
`,
  { mode: 0o755 },
);
const results = [];
function run(name, args, expected = 0, executions = 1, extraEnv = {}) {
  rmSync('invocations.jsonl', { force: true });
  rmSync('captured-execution.json', { force: true });
  const environment = { ...process.env, PYTHON: wrapper, ...extraEnv };
  for (const key of ['NODE_PATH', 'PYTHONPATH', 'PYTHONHOME'])
    delete environment[key];
  const result = spawnSync(process.execPath, [cli, ...args], {
    env: environment,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(`${name}.stdout`, result.stdout);
  writeFileSync(`${name}.stderr`, result.stderr);
  assert.equal(
    result.status,
    expected,
    `${name}: ${result.stdout}\n${result.stderr}`,
  );
  const report = CommandReportSchema.parse(JSON.parse(result.stdout));
  assert.equal(result.stdout.trim().split('\n').length, 1);
  const calls = executions
    ? readFileSync('invocations.jsonl', 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse)
    : [];
  assert.equal(calls.length, executions);
  if (!executions) assert(!readdirSync('.').includes('invocations.jsonl'));
  for (const call of calls)
    assert.deepEqual(call.slice(0, 4), ['-I', '-m', 'cso_python', 'execute']);
  if (executions && !extraEnv.PYTHON)
    assert.match(result.stderr, /observer operational stderr/);
  assert.equal(report.checks.documentContent.status, 'not_applicable');
  assert.equal(report.checks.rendering.status, 'not_applicable');
  assert.equal(report.checks.visualInspection.status, 'not_applicable');
  if (readdirSync('.').includes('captured-execution.json'))
    cpSync('captured-execution.json', `${name}.execution.json`);
  results.push({
    name,
    status: result.status,
    executions,
    reportHash: hash(result.stdout),
    checks: report.checks,
    diagnostics: report.diagnostics,
  });
  return report;
}
const base = [
  'verify',
  'examples/two-panel/estimate.cso.py',
  '--function',
  'estimate',
];
const reference = [
  '--reference',
  twoPanelReference,
  '--format',
  'json',
];
for (const width of [2, 1]) {
  const report = run(`panel-${width}`, [
    ...base,
    '--input',
    `width=${width}`,
    ...reference,
  ]);
  assert.equal(report.checks.inputConsistency.counts.checked, 5);
  assert.equal(report.checks.formulaConsistency.counts.checked, 7);
  assert.equal(report.checks.independentReferenceAgreement.counts.checked, 7);
  assert.equal(
    report.provenance.reference.sha256,
    hash(readFileSync(twoPanelReference)),
  );
  const execution = ExecutionResponseSchema.parse(
    read(`panel-${width}.execution.json`),
  ).execution;
  assert.equal(execution.invocations.length, 4);
  const expected = read(twoPanelReference).cases.find(
    (item) => item.binding.resolvedInputs.width === width,
  );
  for (const item of expected.expected)
    assert(
      Math.abs(
        execution.observations.find(
          (observation) => observation.symbolId === item.symbolId,
        ).value - item.value,
      ) < 1e-9,
    );
  assert.deepEqual(report.provenance.resolvedInputs, {
    width,
    first_panel_height: 3,
    second_panel_height: 4,
    thickness: 0.1,
    density: 500,
  });
  assert.equal(report.provenance.sourceManifest.length, 7);
}
const panel = read('panel-2.stdout');
const defaults = run('resolved-defaults', [...base, ...reference]);
assert.equal(
  defaults.provenance.sourceClosureHash,
  panel.provenance.sourceClosureHash,
);
assert.equal(defaults.checks.independentReferenceAgreement.status, 'passed');
assert.equal(
  run('no-reference', base).checks.independentReferenceAgreement.status,
  'not_applicable',
);
assert.equal(
  run('changed-input', [...base, '--input', 'width=3', ...reference]).checks
    .independentReferenceAgreement.status,
  'not_applicable',
);
for (const [name, mutation] of [
  [
    'bad-value',
    (data) => {
      data.cases[0].expected.find(
        (item) => item.symbolId === '["symbol","root/material_quantities","mass"]',
      ).value = 701;
    },
  ],
  [
    'missing-symbol',
    (data) => {
      data.cases[0].expected.pop();
    },
  ],
  [
    'unknown-symbol',
    (data) => {
      data.cases[0].expected.push({ symbolId: 'unknown', value: 1, unit: 'm' });
    },
  ],
  [
    'wrong-unit',
    (data) => {
      data.cases[0].expected[0].unit = 'kg';
    },
  ],
  [
    'duplicate-binding',
    (data) => {
      data.cases.push(data.cases[0]);
    },
  ],
]) {
  const data = read(twoPanelReference);
  mutation(data);
  write(`${name}.json`, data);
  const report = run(
    name,
    [...base, '--reference', `${name}.json`, '--format', 'json'],
    1,
  );
  assert.equal(report.checks.sourceToDocumentConsistency.status, 'passed');
  assert.equal(
    report.checks.independentReferenceAgreement.status,
    name === 'duplicate-binding' ? 'not_applicable' : 'failed',
  );
  if (name === 'bad-value')
    assert(
      report.diagnostics.some(
        (item) =>
          item.comparison &&
          Math.abs(item.comparison.actual - 700) < 1e-9 &&
          item.comparison.expected === 701 &&
          Math.abs(item.comparison.formulaValue - 700) < 1e-9,
      ),
    );
}
for (const [name, content] of [
  ['duplicate-key', '{"cases":[],"\\u0063ases":[],"referenceVersion":"1"}'],
  ['invalid-json', '{'],
  ['bad-schema', '{}'],
]) {
  writeFileSync(`${name}.json`, content);
  run(name, [...base, '--reference', `${name}.json`, '--format', 'json'], 1);
}
run(
  'missing-reference',
  [...base, '--reference', 'missing.json', '--format', 'json'],
  1,
);
for (const [name, args, executions] of [
  ['duplicate-input', ['--input', 'width=2', '--input', 'width=1'], 0],
  ['unknown-input', ['--input', 'widht=2'], 1],
  ['duplicate-option', ['--reference', 'a', '--reference', 'b'], 0],
  ['missing-value', ['--reference'], 0],
  ['bad-number', ['--input', 'width=Infinity'], 0],
  ['unsafe-number', ['--input', 'width=9007199254740993'], 0],
  ['extra-source', ['other.cso.py'], 0],
])
  run(name, [...base, ...args, '--format', 'json'], 2, executions);
run(
  'missing-source',
  ['verify', 'missing.cso.py', '--function', 'estimate', '--format', 'json'],
  1,
);
const geometry = 'examples/two-panel/geometry.cso.py';
const originalGeometry = readFileSync(geometry, 'utf8');
for (const [name, source] of [
  ['equivalent-comment', `${originalGeometry}\n# Equivalent source edit\n`],
  ['equivalent-formula', originalGeometry.replace('width * height', 'height * width')],
]) {
  writeFileSync(geometry, source);
  const report = run(name, [...base, ...reference]);
  assert.equal(
    report.checks.independentReferenceAgreement.status,
    'not_applicable',
  );
  assert.notEqual(
    report.provenance.sourceClosureHash,
    panel.provenance.sourceClosureHash,
  );
}
writeFileSync(
  geometry,
  originalGeometry.replace('"area": area', '"area": 999'),
);
const invalidReturn = run('invalid-public-return', [...base, ...reference], 1);
assert.equal(invalidReturn.checks.executionValidity.status, 'failed');
assert(invalidReturn.diagnostics.some(item => item.code === 'MISSING_OUTPUT'));
writeFileSync(geometry, originalGeometry);
// Tamper only the public output observation; assignment/formula evidence stays intact.
const wrongOutput = read('panel-2.execution.json');
wrongOutput.execution.authoring.outputs.find(output => output.invocationId === 'root/first_panel' && output.name === 'area').value = 999;
write('wrong-output.json', wrongOutput);
const wrong = run('wrong-runtime', [...base, ...reference], 1, 1, { CSO_TEST_RESPONSE: resolve('wrong-output.json') });
assert.equal(wrong.checks.formulaConsistency.status, 'passed');
assert.equal(wrong.checks.outputConsistency.status, 'failed');
assert(
  wrong.diagnostics.some(
    (item) =>
      item.comparison?.actual === 999 &&
      item.comparison.expected === 6 &&
      item.comparison.absoluteError === 993 &&
      item.location &&
      item.symbolId,
  ),
);
writeFileSync(
  geometry,
  originalGeometry.replace(
    '    return ',
    '    print("must never run")\n    return ',
  ),
);
const unsupported = run('unsupported-syntax', [...base, ...reference], 1);
assert.equal(unsupported.checks.executionValidity.status, 'failed');
writeFileSync(geometry, originalGeometry);
run(
  'missing-required-input',
  [
    'verify',
    geometry,
    '--function',
    'rectangle',
    '--input',
    'width=2',
    '--format',
    'json',
  ],
  2,
);
const entry = 'examples/two-panel/estimate.cso.py';
const originalEntry = readFileSync(entry, 'utf8');
writeFileSync(
  entry,
  originalEntry.replace(
    'from _cso_bindings.geometry import rectangle',
    'from _cso_bindings.estimate import estimate as rectangle',
  ),
);
const cycle = run('cycle', [...base, ...reference], 1);
assert(
  cycle.diagnostics.some((item) => /cycle/i.test(item.code + item.message)),
);
writeFileSync(entry, originalEntry);
function refreshBindings() {
  const generated = spawnSync(realPython, ['-I', '-m', 'cso_python', 'bindings', 'examples/two-panel'], {encoding:'utf8'});
  assert.equal(generated.status, 0, generated.stdout + generated.stderr);
}
// The same numeric child argument must retain its actual binding provenance.
writeFileSync(
  geometry,
  originalGeometry.replace('height: PanelHeight)', 'height: PanelHeight = 3)'),
);
for (const [name, argument, kind] of [
  ['child-default', 'width=width', 'parsedDefault'],
  ['child-literal', 'width=width, height=3', 'callerLiteral'],
]) {
  writeFileSync(
    entry,
    originalEntry.replace('width=width, height=first_panel_height', argument),
  );
  refreshBindings();
  run(name, base);
  const child = read(`${name}.execution.json`).execution.invocations.find(
    (item) => item.id === 'root/first_panel',
  );
  assert.equal(child.resolvedInputs.height, 3);
  assert(
    child.inputBindings.some(
      (item) => item.parameterName === 'height' && item.kind === kind,
    ),
  );
}
writeFileSync(geometry, originalGeometry);
writeFileSync(entry, originalEntry);
refreshBindings();
cpSync('examples/two-panel', 'relocated with spaces', { recursive: true });
const relocated = run('relocated', [
  'verify',
  'relocated with spaces/estimate.cso.py',
  '--function',
  'estimate',
  ...reference,
]);
assert.equal(
  relocated.provenance.sourceClosureHash,
  panel.provenance.sourceClosureHash,
);
assert.equal(relocated.checks.independentReferenceAgreement.status, 'passed');
for (const command of ['verify', 'pdf']) {
  rmSync('invocations.jsonl', { force: true });
  const result = spawnSync(process.execPath, [cli, command, '--help'], {
    encoding: 'utf8',
    env: { ...process.env, PYTHON: wrapper },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, new RegExp(`Usage: cso ${command}`));
  assert(!readdirSync('.').includes('invocations.jsonl'));
}
writeFileSync('existing.pdf', 'sentinel retained on invalid usage');
run(
  'pdf-unknown-input',
  [
    'pdf',
    'examples/two-panel/estimate.cso.py',
    '--function',
    'estimate',
    '--input',
    'unknown=2',
    '--out',
    'existing.pdf',
    '--format',
    'json',
  ],
  2,
  1,
);
assert.equal(
  readFileSync('existing.pdf', 'utf8'),
  'sentinel retained on invalid usage',
);
run('process-missing', base, 1, 0, { PYTHON: resolve('missing-interpreter') });
for (const [name, content] of [
  ['malformed-process-json', '{}'],
  ['duplicate-process-key', '{"ok":true,"ok":false}'],
  ['multiple-process-values', '{}\n{}'],
]) {
  writeFileSync(`${name}.json`, content);
  const report = run(name, base, 1, 1, {
    CSO_TEST_RESPONSE: resolve(`${name}.json`),
  });
  assert.equal(report.checks.executionValidity.status, 'failed');
}
// Removing render-only packages proves the built verify entry does not import them.
const renderPackages = [
  '@viktar-b/cso-react',
  'react',
  'react-dom',
  'playwright',
];
try {
  for (const name of renderPackages)
    renameSync(`node_modules/${name}`, `node_modules/${name}.stage-a-hidden`);
  run('verify-without-render-packages', base);
} finally {
  for (const name of renderPackages)
    renameSync(`node_modules/${name}.stage-a-hidden`, `node_modules/${name}`);
}
write('stage-a-results.json', {
  ok: true,
  cases: results,
  limits: [
    'Stage A only. No PDF integration, rendering, visual inspection or final acceptance.',
  ],
  realPython,
});
process.stdout.write(
  `${results.length} installed Stage A command cases passed\n`,
);
