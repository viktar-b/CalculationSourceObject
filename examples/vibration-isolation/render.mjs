import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  ExecutionResponseSchema,
  ExternalOutputReferenceCaseSchema,
  externalReferenceBindingFrom,
  verifyExecution,
} from '@cs-object/core';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(
  process.argv[2] ?? resolve(root, 'output/vibration-isolation'),
);
mkdirSync(output, { recursive: true });
const python = process.env.PYTHON;
if (!python)
  throw new Error(
    'Set PYTHON to the installed cs-object interpreter as described in docs/development.md.',
  );
const cli = resolve(root, 'packages/cso-cli/dist/cli.js');
const project = resolve(root, 'examples/vibration-isolation');
const source = resolve(project, 'showcase.cso.py');
function run(command, args) {
  const r = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PYTHON: python },
    maxBuffer: 32000000,
  });
  if (r.status !== 0) throw new Error(r.stdout + '\n' + r.stderr);
  return r.stdout;
}
run(python, ['-I', '-m', 'cso_python', 'bindings', project]);
for (const fn of ['compare', 'sweep']) {
  const response = ExecutionResponseSchema.parse(
    JSON.parse(
      run(python, [
        '-I',
        '-m',
        'cso_python',
        'execute',
        source,
        '--function',
        fn,
        '--supported-execution-protocol',
        '4',
      ]),
    ),
  );
  if (!response.ok) throw Error(JSON.stringify(response));
  const execution = response.execution;
  const expected = fn === 'compare' ? [0.01, 0.01, 0.008] : [0.01];
  if (execution.externalCalls.length !== expected.length)
    throw Error('Unexpected call count');
  const reference = ExternalOutputReferenceCaseSchema.parse({
    kind: 'externalOutputs',
    id: fn + '-analytic-equilibrium',
    revision: '1',
    basis: {
      method: 'Exact polynomial substitution',
      derivation:
        'F=400 N. Linear:40000×0.01=400. Balanced:20000×0.01+200000000×0.01³=200+200=400. Hardening:10000×0.008+625000000×0.008³=80+320=400. Positive derivative establishes uniqueness.',
      sourceDescription:
        'Independently specified exact roots of the authored cubic equation; not copied from numerical solver results.',
    },
    binding: externalReferenceBindingFrom(execution),
    expected: execution.externalCalls.map((c, i) => ({
      externalCallId: c.id,
      outputName: 'displacement',
      value: expected[i],
      numericKind: 'float',
      unit: 'm',
    })),
  });
  const report = verifyExecution({ execution, referenceCases: [reference] });
  if (!report.ok) throw Error(JSON.stringify(report));
  writeFileSync(
    resolve(output, `${fn}-execution.json`),
    JSON.stringify(response, null, 2),
  );
  writeFileSync(
    resolve(output, `${fn}-verification.json`),
    JSON.stringify(report, null, 2),
  );
  const refs = resolve(output, `${fn}-reference.json`);
  writeFileSync(
    refs,
    JSON.stringify({ referenceVersion: '2', cases: [reference] }, null, 2),
  );
  console.log(
    fn,
    JSON.stringify({
      externalCalls: execution.externalCalls.length,
      formula: report.checks.formulaConsistency,
      reference: report.externalReferenceCoverage,
    }),
  );
  for (const format of ['html', 'pdf']) {
    const args = [
      cli,
      format,
      source,
      '--function',
      fn,
      '--reference',
      refs,
      '--out',
      resolve(output, `${fn}.${format}`),
    ];
    if (format === 'html') args.push('--check-layout');
    const out = run(process.execPath, args);
    writeFileSync(resolve(output, `${fn}-${format}-report.json`), out);
    console.log(fn, format, 'passed');
  }
}
