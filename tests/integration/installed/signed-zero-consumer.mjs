import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cli =
  process.env.CSO_TEST_CLI ??
  resolve('node_modules/@viktar-b/cso-cli/dist/cli.js');
const python = process.env.PYTHON;
assert(python);
const wrapper = resolve('signed-zero-python-observer.mjs');
writeFileSync(
  wrapper,
  `#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
writeFileSync('signed-zero-arguments.json',JSON.stringify(process.argv.slice(2)));
const result=spawnSync(${JSON.stringify(python)},process.argv.slice(2),{encoding:'utf8'});
writeFileSync('signed-zero-python.json',result.stdout);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
`,
  { mode: 0o755 },
);
const rows = [];
for (const spelling of ['-0.0', '-0', '0.0']) {
  const negative = spelling.startsWith('-');
  for (const command of ['verify', 'dev-export']) {
    const args =
      command === 'verify'
        ? [
            'verify',
            'signed-zero.cso.py',
            '--function',
            'signed_zero',
            '--input',
            `x=${spelling}`,
            '--format',
            'json',
          ]
        : [
            'dev-export',
            '--source',
            'signed-zero.cso.py',
            '--function',
            'signed_zero',
            '--inputs-json',
            `{"x":${spelling}}`,
            '--out',
            'signed-zero-export.json',
          ];
    const environment = { ...process.env, PYTHON: wrapper };
    for (const key of ['NODE_PATH', 'PYTHONPATH', 'PYTHONHOME'])
      delete environment[key];
    const result = spawnSync(process.execPath, [cli, ...args], {
      env: environment,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const forwarded = JSON.parse(
      readFileSync('signed-zero-arguments.json', 'utf8'),
    );
    const inputJson = forwarded[forwarded.indexOf('--inputs-json') + 1];
    const actual = JSON.parse(readFileSync('signed-zero-python.json', 'utf8'));
    writeFileSync(
      `signed-zero-${command}-${spelling}.python.json`,
      readFileSync('signed-zero-python.json'),
    );
    writeFileSync(`signed-zero-${command}-${spelling}.stdout`, result.stdout);
    const cso = command === 'verify' ? actual.execution.cso : actual;
    const symbols = cso.sections.flatMap((section) =>
      section.items
        .filter((item) => item.kind === 'symbol')
        .map((item) => item.symbol),
    );
    assert.equal(symbols.length, 3);
    for (const symbol of symbols)
      assert.equal(
        Object.is(symbol.valueTree.result.value, -0),
        negative,
        `${command} ${spelling} Python ${symbol.glyph} sign`,
      );
    if (command === 'verify') {
      assert.equal(
        Object.is(actual.execution.entry.resolvedInputs.x, -0),
        negative,
        'Python received requested sign',
      );
      for (const observation of actual.execution.observations)
        assert.equal(
          Object.is(observation.value, -0),
          negative,
          'actual Python returned sign',
        );
      const report = JSON.parse(result.stdout);
      assert.equal(report.ok, true);
      assert.equal(
        Object.is(report.provenance.resolvedInputs.x, -0),
        negative,
        'report retains resolved input sign',
      );
    } else {
      const output = JSON.parse(
        readFileSync('signed-zero-export.json', 'utf8'),
      );
      const values = output.sections.flatMap((section) =>
        section.items
          .filter((item) => item.kind === 'symbol')
          .map((item) => item.symbol.valueTree.result.value),
      );
      assert(
        values.every((value) => Object.is(value, -0) === negative),
        'development output retains Python zero signs',
      );
    }
    assert.equal(
      Object.is(JSON.parse(inputJson).x, -0),
      negative,
      'forwarded JSON retains sign',
    );
    if (negative)
      assert.match(inputJson, /-0\.0/, 'Python needs a floating JSON token');
    rows.push({
      command,
      spelling,
      inputJson,
      pythonSign: negative ? 'negative' : 'positive',
      runtimeSymbolsChecked: 3,
    });
  }
}
// These fixed fixture bytes bind a fixed source hash. Never regenerate or
// rebind their hashes from the current execution, and never stringify away -0.0.
const referenceRows = [];
const referenceFailures = [];
for (const [name, spelling, file, status, revision] of [
  [
    'negative-same-sign',
    '-0.0',
    'negative-zero-reference.json',
    'passed',
    'hand-derived-negative-zero-v1',
  ],
  [
    'positive-same-sign',
    '0.0',
    'positive-zero-reference.json',
    'passed',
    'hand-derived-positive-zero-v1',
  ],
  [
    'negative-opposite-sign',
    '-0.0',
    'positive-zero-reference.json',
    'not_applicable',
    undefined,
  ],
  [
    'positive-opposite-sign',
    '0.0',
    'negative-zero-reference.json',
    'not_applicable',
    undefined,
  ],
  [
    'negative-both-signs',
    '-0.0',
    'signed-zero-reference-cases.json',
    'passed',
    'hand-derived-negative-zero-v1',
  ],
  [
    'positive-both-signs',
    '0.0',
    'signed-zero-reference-cases.json',
    'passed',
    'hand-derived-positive-zero-v1',
  ],
]) {
  const environment = { ...process.env, PYTHON: wrapper };
  for (const key of ['NODE_PATH', 'PYTHONPATH', 'PYTHONHOME'])
    delete environment[key];
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'verify',
      'signed-zero.cso.py',
      '--function',
      'signed_zero',
      '--input',
      `x=${spelling}`,
      '--reference',
      file,
      '--format',
      'json',
    ],
    { env: environment, encoding: 'utf8' },
  );
  writeFileSync(`reference-${name}.stdout`, result.stdout);
  writeFileSync(`reference-${name}.stderr`, result.stderr);
  writeFileSync(
    `reference-${name}.python.json`,
    readFileSync('signed-zero-python.json'),
  );
  const report = JSON.parse(result.stdout);
  const actual = JSON.parse(readFileSync('signed-zero-python.json', 'utf8'));
  const row = {
    name,
    spelling,
    file,
    expectedStatus: status,
    actualStatus: report.checks.independentReferenceAgreement.status,
    exitCode: result.status,
    expectedRevision: revision,
    actualRevisions: report.provenance.reference?.revisions,
    diagnostics: report.diagnostics,
  };
  referenceRows.push(row);
  try {
    assert.equal(
      Object.is(actual.execution.entry.resolvedInputs.x, -0),
      spelling.startsWith('-'),
      `${name}: actual Python receives input sign`,
    );
    assert.equal(result.status, 0, `${name}: reference file must be accepted`);
    assert.equal(report.ok, true, `${name}: consistent verification succeeds`);
    assert.equal(report.checks.sourceToDocumentConsistency.status, 'passed');
    assert.equal(report.checks.formulaConsistency.counts.checked, 2);
    assert.equal(
      report.checks.independentReferenceAgreement.status,
      status,
      name,
    );
    assert.deepEqual(
      report.provenance.reference.revisions,
      revision ? [revision] : [],
      `${name}: only the same-sign revision may match`,
    );
    if (status === 'passed')
      assert.equal(
        report.checks.independentReferenceAgreement.counts.checked,
        2,
      );
  } catch (error) {
    referenceFailures.push(
      error instanceof Error ? error.message : String(error),
    );
  }
}
writeFileSync(
  'signed-zero-reference-results.json',
  JSON.stringify(
    {
      ok: referenceFailures.length === 0,
      rows: referenceRows,
      failures: referenceFailures,
    },
    null,
    2,
  ),
);
assert.deepEqual(
  referenceFailures,
  [],
  'Signed-zero reference identity must pass every installed case',
);
writeFileSync(
  'signed-zero-results.json',
  JSON.stringify({ ok: true, rows, referenceRows }, null, 2),
);
process.stdout.write(
  'Six installed signed-zero transport and six reference-binding cases passed\n',
);
