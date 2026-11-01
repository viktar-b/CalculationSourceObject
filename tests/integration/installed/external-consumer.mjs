// Run inside a fresh consumer installed from actual npm archives and a Python wheel.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import {
  BoundPreparedDocumentSchema,
  CommandReportSchema,
  ExecutionResponseSchema,
  ExternalOutputReferenceCaseSchema,
  externalReferenceBindingFrom,
  createSheetFromCalculationSourceObject,
  verifyExecution,
} from '@cs-object/core';
import {
  PreparedFormulaSheet,
  prepareExecutionDocument,
} from '@cs-object/react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const python = process.env.PYTHON;
assert(python);
const cli = resolve('node_modules/@cs-object/cli/dist/cli.js');
mkdirSync('external-output', { recursive: true });
const results = [];
const execute = (command, args, expected = 0) => {
  const response = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(response.status, expected, response.stdout + response.stderr);
  return response;
};
const pythonCommand = (args) =>
  execute(python, ['-I', '-m', 'cso_python', ...args]);
const source = (project) => join(project, 'calculate.cso.py');
function capture(project) {
  const response = ExecutionResponseSchema.parse(
    JSON.parse(
      pythonCommand([
        'execute',
        source(project),
        '--function',
        'calculate',
        '--supported-execution-protocol',
        '4',
      ]).stdout,
    ),
  );
  assert(response.ok, JSON.stringify(response));
  return response.execution;
}
function reference(execution, expected, derivation) {
  const call = execution.externalCalls[0];
  assert(call);
  return ExternalOutputReferenceCaseSchema.parse({
    kind: 'externalOutputs',
    id: 'independent-value',
    revision: '1',
    basis: {
      method: 'Worked arithmetic or antiderivative',
      derivation,
      sourceDescription:
        'Expected value established separately from the adapter execution.',
    },
    binding: externalReferenceBindingFrom(execution),
    expected: [
      {
        externalCallId: call.id,
        outputName: 'value',
        value: expected,
        numericKind: 'float',
        unit: '',
      },
    ],
  });
}
function checkProject(name, expected, doubled, derivation) {
  const project = resolve(`examples/external-functions/${name}`);
  const execution = capture(project);
  const independent = reference(execution, expected, derivation);
  const report = verifyExecution({ execution, referenceCases: [independent] });
  assert(report.ok, JSON.stringify(report));
  assert.equal(report.checks.formulaConsistency.counts.checked, 1);
  assert.equal(report.externalCoverage.calls, 1);
  assert.equal(report.externalCoverage.results, 2);
  assert.equal(report.checks.independentReferenceAgreement.status, 'passed');
  assert.equal(report.externalReferenceCoverage.status, 'partial');
  assert.equal(report.externalReferenceCoverage.checked[0].outputName, 'value');
  assert.equal(report.externalReferenceCoverage.uncovered.length, 1);
  const output = execution.authoring.outputs.find(
    (output) => output.invocationId === 'root' && output.name === 'doubled',
  );
  assert(Math.abs(output.value - doubled) <= 1e-9);
  const document = prepareExecutionDocument({
    execution,
    assets: [],
    verificationReport: report,
  });
  BoundPreparedDocumentSchema.parse({ execution, document });
  const html = renderToStaticMarkup(
    createElement(PreparedFormulaSheet, { document }),
  );
  assert(html.includes('cso-symbol-row'));
  assert(
    html.includes('External algorithm excluded from CSO formula verification.'),
  );
  assert.throws(
    () =>
      createSheetFromCalculationSourceObject(execution.cso, {
        id: 'lossy',
        label: 'Lossy',
      }),
    /External-call evidence/u,
  );
  const referencePath = resolve(`external-output/${name}-reference.json`);
  writeFileSync(
    referencePath,
    JSON.stringify({ referenceVersion: '2', cases: [independent] }),
  );
  for (const command of ['html', 'pdf']) {
    const out = resolve(`external-output/${name}.${command}`);
    const args = [
      cli,
      command,
      source(project),
      '--function',
      'calculate',
      '--reference',
      referencePath,
      '--out',
      out,
    ];
    if (command === 'html') args.push('--check-layout');
    const published = execute(process.execPath, args);
    const commandReport = CommandReportSchema.parse(
      JSON.parse(published.stdout),
    );
    assert(commandReport.ok);
    assert.equal(commandReport.checks.rendering.status, 'passed');
    assert.equal(commandReport.externalReferenceCoverage.status, 'partial');
    const locatorLine = published.stderr
      .split('\n')
      .find((line) => line.startsWith('CSO evidence '));
    assert(locatorLine);
    const locator = JSON.parse(locatorLine.slice('CSO evidence '.length));
    const retained = ExecutionResponseSchema.parse(
      JSON.parse(
        readFileSync(join(dirname(locator.path), 'execution.json'), 'utf8'),
      ),
    );
    assert(retained.ok);
    assert.equal(retained.execution.externalCalls.length, 1);
    assert.equal(retained.execution.externalCalls[0].outputs.length, 2);
    assert.equal(
      createHash('sha256').update(readFileSync(out)).digest('hex'),
      commandReport.output.sha256,
    );
    results.push({
      name,
      command,
      output: commandReport.output,
      checks: commandReport.checks,
      externalReferenceCoverage: commandReport.externalReferenceCoverage,
      inspection: 'pending',
    });
  }
  const adapter = join(
    project,
    'helpers',
    name === 'loop' ? 'midpoint.py' : 'integration.py',
  );
  const original = readFileSync(adapter, 'utf8');
  try {
    writeFileSync(
      adapter,
      'raise RuntimeError("saved reports must not execute this adapter")\n',
    );
    const saved = prepareExecutionDocument({
      execution,
      assets: [],
      verificationReport: report,
    });
    assert.equal(
      renderToStaticMarkup(
        createElement(PreparedFormulaSheet, { document: saved }),
      ),
      html,
    );
  } finally {
    writeFileSync(adapter, original);
  }
  return { project, adapter, execution };
}

const scientific = resolve('examples/external-functions/scientific');
const loop = resolve('examples/external-functions/loop');
const before = execute(python, [
  '-I',
  '-c',
  'import importlib.util; print(importlib.util.find_spec("scipy") is None)',
]).stdout.trim();
assert.equal(
  before,
  'True',
  'The base installed consumer must not require SciPy',
);
for (const project of [loop, scientific]) {
  const generated = JSON.parse(pythonCommand(['bindings', project]).stdout);
  assert(generated.ok);
  assert(
    JSON.parse(
      pythonCommand(['describe', source(project), '--function', 'calculate'])
        .stdout,
    ).ok,
  );
}
checkProject('loop', 21.0, 42.0, '(0.5² + 1.5² + 2.5² + 3.5²) × 1 = 21');
execute(python, [
  '-m',
  'pip',
  'install',
  '-r',
  join(scientific, 'requirements.txt'),
]);
const science = checkProject(
  'scientific',
  64 / 3,
  128 / 3,
  'Integral of x² on [0,4] = [x³/3]₀⁴ = 64/3',
);
const adapterCode = readFileSync(science.adapter, 'utf8');
try {
  writeFileSync(
    science.adapter,
    `from numpy import float64\n${adapterCode}`.replace(
      '"value": float(value)',
      '"value": float64(value)',
    ),
  );
  const invalid = execute(
    python,
    [
      '-I',
      '-m',
      'cso_python',
      'execute',
      source(science.project),
      '--function',
      'calculate',
      '--supported-execution-protocol',
      '4',
    ],
    1,
  );
  const response = ExecutionResponseSchema.parse(JSON.parse(invalid.stdout));
  assert.equal(
    response.ok,
    false,
    'An unadapted NumPy scalar must not cross the native numeric boundary',
  );
} finally {
  writeFileSync(science.adapter, adapterCode);
}
writeFileSync(
  'external-results.json',
  JSON.stringify({ ok: true, baseWithoutScipy: true, cases: results }, null, 2),
);
process.stdout.write(
  'PASS installed external loop, optional SciPy, scoped references and retained HTML/PDF. PDF visual inspection remains separate.\n',
);
