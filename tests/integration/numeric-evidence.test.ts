import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ExecutionResponseSchema,
  PreparedDocumentSchema,
  ReferenceCaseSchema,
  executionBindingFrom,
  verifyExecution,
} from '@cs-object/core';
import { prepareExecutionDocument } from '@cs-object/react';
import { afterEach, expect, it } from 'vitest';
import { executeAndVerify } from '../../apps/cso-cli/src/verification.ts';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function capture(defaultValue: string, expression: string) {
  const directory = mkdtempSync(join(tmpdir(), 'cso-numeric-evidence-'));
  directories.push(directory);
  const sourcePath = join(directory, 'quantity.cso.py');
  writeFileSync(
    sourcePath,
    `from typing import Annotated
from cso_python import calculation, section, symbol
@calculation(id="quantity", title="Quantity")
@section(id="main", title="Main", root=True)
def calculate(quantity: Annotated[float, symbol(glyph="Q_{in}", description="Input", unit="")] = ${defaultValue}):
    product: Annotated[float, symbol(glyph="P_{out}", description="Product", unit="")] = ${expression}
    return {"product": product}
`,
  );
  const response = ExecutionResponseSchema.parse(
    JSON.parse(
      execFileSync(
        process.env.PYTHON ?? 'python3',
        [
          '-I',
          '-m',
          'cso_python',
          'execute',
          sourcePath,
          '--function',
          'calculate',
        ],
        { encoding: 'utf8' },
      ),
    ),
  );
  if (!response.ok) throw new Error(JSON.stringify(response.diagnostics));
  return { directory, sourcePath, execution: response.execution };
}

function referenceFor(
  execution: ReturnType<typeof capture>['execution'],
  expected: number,
) {
  const output = execution.authoring?.outputs[0];
  if (!output) throw new Error('Missing synthetic product');
  return ReferenceCaseSchema.parse({
    id: 'product',
    revision: '1',
    basis: {
      method: 'Arithmetic',
      derivation:
        'The source multiplies powers of ten or divides equal quantities.',
      sourceDescription: 'Synthetic arithmetic identity',
    },
    binding: executionBindingFrom(execution),
    expected: [
      {
        symbolId: output.symbolId,
        value: expected,
        numericKind: 'float',
        unit: '',
      },
    ],
  });
}

it('carries large float evidence from Python through references, documents and CLI reports', () => {
  const { execution, directory, sourcePath } = capture(
    '1e20',
    'quantity * 100000.0',
  );
  expect(execution.entry.resolvedInputKinds).toEqual({ quantity: 'float' });
  expect(execution.invocations[0].resolvedInputKinds).toEqual({
    quantity: 'float',
  });
  const reference = referenceFor(execution, 1e25);
  const report = verifyExecution({ execution, referenceCases: [reference] });
  expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
  expect(report.checks.independentReferenceAgreement.status).toBe('passed');
  const document = prepareExecutionDocument({ execution, assets: [] });
  expect(document.source).toMatchObject({
    resolvedInputKinds: { quantity: 'float' },
  });
  expect(
    PreparedDocumentSchema.safeParse(JSON.parse(JSON.stringify(document)))
      .success,
  ).toBe(true);
  if (document.source.kind !== 'execution')
    throw new Error('Expected current document');
  delete document.source.resolvedInputKinds;
  expect(PreparedDocumentSchema.safeParse(document).success).toBe(false);

  const referencePath = join(directory, 'reference.json');
  writeFileSync(
    referencePath,
    JSON.stringify({ referenceVersion: '1', cases: [reference] }),
  );
  const result = executeAndVerify({
    command: 'verify',
    sourcePath,
    functionName: 'calculate',
    inputs: {},
    referencePath,
  });
  expect(result.kind, JSON.stringify(result)).toBe('verified');
  if (result.kind !== 'verified') return;
  expect(result.report.provenance.resolvedInputKinds).toEqual({
    quantity: 'float',
  });
  expect(result.report.checks.independentReferenceAgreement.status).toBe(
    'passed',
  );
});

it('rejects a rounded untyped reference through both core and CLI', () => {
  const { execution, sourcePath, directory } = capture(
    '9007199254740992.0',
    'quantity / 9007199254740992.0',
  );
  const reference = referenceFor(execution, 1);
  delete reference.binding.resolvedInputKinds;
  const text = JSON.stringify({
    referenceVersion: '1',
    cases: [reference],
  }).replace('"quantity":9007199254740992', '"quantity":9007199254740993');
  const parsed = JSON.parse(text);
  expect(parsed.cases[0].binding.resolvedInputs.quantity).toBe(
    execution.entry.resolvedInputs.quantity,
  );
  const report = verifyExecution({ execution, referenceCases: parsed.cases });
  expect(report.ok).toBe(false);
  expect(
    report.diagnostics.some((d) => d.code === 'UNSUPPORTED_NUMERIC_RANGE'),
  ).toBe(true);
  const referencePath = join(directory, 'rounded-reference.json');
  writeFileSync(referencePath, text);
  const result = executeAndVerify({
    command: 'verify',
    sourcePath,
    functionName: 'calculate',
    inputs: {},
    referencePath,
  });
  expect(result.kind).toBe('failed');
  if (result.kind !== 'failed') return;
  expect(
    result.outcome.report.diagnostics.some(
      (d) => d.code === 'UNSUPPORTED_NUMERIC_RANGE',
    ),
  ).toBe(true);
});

it('checks captured input kinds against authoritative bindings without changing reference identity', () => {
  const { execution } = capture('2.0', 'quantity * 100000.0');
  const legacy = referenceFor(execution, 200000);
  delete legacy.binding.resolvedInputKinds;
  const integer = referenceFor(execution, 200000);
  integer.binding.resolvedInputKinds = { quantity: 'int' };
  for (const reference of [legacy, integer]) {
    expect(
      verifyExecution({ execution, referenceCases: [reference] }).checks
        .independentReferenceAgreement.status,
    ).toBe('passed');
  }
  for (const [entryEvidence, invocationEvidence] of [
    [true, true],
    [true, false],
    [false, true],
  ]) {
    const forged = structuredClone(execution);
    delete forged.entry.resolvedInputKinds;
    delete forged.invocations[0].resolvedInputKinds;
    if (entryEvidence) forged.entry.resolvedInputKinds = { quantity: 'int' };
    if (invocationEvidence)
      forged.invocations[0].resolvedInputKinds = { quantity: 'int' };
    const report = verifyExecution({ execution: forged });
    expect(report.ok).toBe(false);
    expect(
      report.diagnostics.some((d) => d.code === 'INPUT_NUMERIC_KIND_MISMATCH'),
    ).toBe(true);
  }
});
