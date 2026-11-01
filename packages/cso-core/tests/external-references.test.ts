import { describe, expect, test } from 'vitest';
import { sourceClosureHash } from '../src/contracts/common.ts';
import {
  type ExecutionPayload,
  ExecutionPayloadSchema,
} from '../src/contracts/execution.ts';
import { ExternalCallSchema } from '../src/contracts/external.ts';
import {
  BoundReferenceCaseSchema,
  ExternalOutputReferenceCaseSchema,
  externalReferenceBindingFrom,
  ReferenceCasesSchema,
  ReferenceFileSchema,
  referenceBindingKey,
  referenceMatchesExecution,
  referenceSourceBindingFrom,
} from '../src/contracts/reference.ts';
import { verifyExecution } from '../src/verification/verify.ts';
import chainCaptures from './fixtures/external-chain-executions.json';
import fixture from './fixtures/external-execution.json';
import helperChainCaptures from './fixtures/external-helper-chain-executions.json';

const capture = (): ExecutionPayload =>
  ExecutionPayloadSchema.parse(structuredClone(fixture));
test('captured external native integers cannot have a negative-zero sign', () => {
  const call = capture().externalCalls?.[0];
  if (!call) throw new Error('Missing external fixture');
  call.outputs[0].value = -0;
  call.outputs[0].numericKind = 'int';
  expect(ExternalCallSchema.safeParse(call).success).toBe(false);
  call.outputs[0].numericKind = 'float';
  expect(ExternalCallSchema.safeParse(call).success).toBe(true);
});
const basis = {
  method: 'Analytic square',
  derivation: '3 × 3 = 9',
  sourceDescription: 'Independently authored arithmetic expectation',
};
const scoped = (execution: ExecutionPayload, outputName = 'area', value = 9) =>
  ExternalOutputReferenceCaseSchema.parse({
    kind: 'externalOutputs',
    id: `analytic-${outputName}`,
    revision: '1',
    basis,
    binding: externalReferenceBindingFrom(execution),
    expected: [
      {
        externalCallId: execution.externalCalls?.[0]?.id,
        outputName,
        value,
        unit: outputName === 'area' ? 'm^2' : '',
      },
    ],
  });
const changedCount = (execution: ExecutionPayload, value: number) => {
  const clone = structuredClone(execution);
  const output = clone.externalCalls?.[0]?.outputs.find(
    (item) => item.name === 'count',
  );
  if (!output) throw new Error('Missing count');
  output.value = value;
  for (const section of clone.cso.sections)
    for (const item of section.items) {
      if (item.kind !== 'symbol' || item.symbol.id !== output.symbolId)
        continue;
      item.symbol.valueTree.result = {
        kind: 'number',
        value,
        numericKind: 'int',
      };
      const root = item.symbol.valueTree.nodes[0];
      if (root?.mode !== 'LITERAL') throw new Error('Missing result literal');
      root.literal = { kind: 'number', value, numericKind: 'int' };
    }
  for (const item of clone.observations)
    if (item.symbolId === output.symbolId) item.value = value;
  for (const item of clone.authoring?.outputs ?? [])
    if (item.symbolId === output.symbolId) item.value = value;
  return ExecutionPayloadSchema.parse(clone);
};

describe('scoped independent external output references', () => {
  test('checks selected captured outputs and explicitly lists uncovered diagnostics', () => {
    const execution = capture();
    const reference = scoped(execution);
    expect(ReferenceCasesSchema.safeParse([reference]).success).toBe(true);
    expect(
      BoundReferenceCaseSchema.safeParse({
        execution,
        referenceCase: reference,
      }).success,
    ).toBe(true);
    const report = verifyExecution({ execution, referenceCases: [reference] });
    expect(report.ok, JSON.stringify(report)).toBe(true);
    expect(report.checks.independentReferenceAgreement).toMatchObject({
      status: 'passed',
      counts: { checked: 1, passed: 1, failed: 0 },
    });
    expect(report.externalReferenceCoverage).toMatchObject({
      status: 'partial',
      checked: [{ outputName: 'area' }],
      uncovered: [{ outputName: 'count' }],
    });
  });
  test('missing reference coverage stays pending without blocking a consistent capture', () => {
    const report = verifyExecution({ execution: capture() });
    expect(report.ok).toBe(true);
    expect(report.checks.independentReferenceAgreement.status).toBe(
      'not_applicable',
    );
    expect(report.externalReferenceCoverage).toMatchObject({
      status: 'pending',
      checked: [],
      uncovered: [{ outputName: 'area' }, { outputName: 'count' }],
    });
  });
  test('matching failed expectations block success while retaining checked coverage', () => {
    const execution = capture();
    const report = verifyExecution({
      execution,
      referenceCases: [scoped(execution, 'area', 8)],
    });
    expect(report.ok).toBe(false);
    expect(report.checks.sourceToDocumentConsistency.status).toBe('passed');
    expect(report.checks.independentReferenceAgreement.status).toBe('failed');
    expect(report.externalReferenceCoverage?.checked).toMatchObject([
      { outputName: 'area' },
    ]);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'REFERENCE_EXTERNAL_MISMATCH' }),
      ]),
    );
  });
  test('an external-only calculation can have independent agreement with zero formula checks', () => {
    const execution = capture();
    const root = execution.invocations[0];
    const call = execution.externalCalls?.[0];
    const area = call?.outputs.find((output) => output.name === 'area');
    const formula = root?.symbols.find((symbol) => symbol.kind === 'formula');
    if (!root || !call || !area || !formula || !execution.authoring)
      throw new Error('Fixture incomplete');
    root.symbols = root.symbols.filter(
      (symbol) => symbol.symbolId !== formula.symbolId,
    );
    execution.observations = execution.observations.filter(
      (symbol) => symbol.symbolId !== formula.symbolId,
    );
    for (const section of execution.cso.sections)
      section.items = section.items.filter(
        (item) => item.kind !== 'symbol' || item.symbol.id !== formula.symbolId,
      );
    for (const output of [
      ...execution.authoring.outputs,
      ...execution.authoring.outputDeclarations,
    ]) {
      if (output.invocationId !== 'root') continue;
      output.symbolId = area.symbolId;
      output.source = {
        kind: 'output',
        invocationId: call.id,
        outputName: area.name,
      };
      if ('value' in output) output.value = 9;
    }
    const valid = ExecutionPayloadSchema.parse(execution);
    const report = verifyExecution({
      execution: valid,
      referenceCases: [scoped(valid)],
    });
    expect(report.ok, JSON.stringify(report)).toBe(true);
    expect(report.checks.formulaConsistency).toMatchObject({
      status: 'not_applicable',
      counts: { checked: 0 },
    });
    expect(report.checks.independentReferenceAgreement).toMatchObject({
      status: 'passed',
      counts: { checked: 1 },
    });
  });
  test('binding never uses run IDs or observed answers', () => {
    const first = capture();
    const second = changedCount(first, 2);
    second.runId = '68d4b5da-30aa-4e8f-a968-b469c457af50';
    expect(referenceBindingKey(externalReferenceBindingFrom(first))).toBe(
      referenceBindingKey(externalReferenceBindingFrom(second)),
    );
    const report = verifyExecution({
      execution: second,
      referenceCases: [scoped(first, 'count', 1)],
    });
    expect(report.checks.sourceToDocumentConsistency.status).toBe('passed');
    expect(report.checks.independentReferenceAgreement).toMatchObject({
      status: 'failed',
      counts: { checked: 1 },
    });
    expect(report.ok).toBe(false);
    const reference = scoped(first);
    expect(
      ExternalOutputReferenceCaseSchema.safeParse({
        ...reference,
        binding: { ...reference.binding, runId: first.runId },
      }).success,
    ).toBe(false);
  });
  test.each([
    {
      path: 'direct argument',
      captures: chainCaptures,
      expectedValues: [3, 3],
      changedValues: [4, 5],
    },
    {
      path: 'formula and helper argument',
      captures: helperChainCaptures,
      expectedValues: [3, 4],
      changedValues: [4, 6],
    },
  ])(
    'upstream external answers through $path never invalidate scoped expectations',
    ({ captures, expectedValues, changedValues }) => {
      const [first, changed] = captures.map((capture) =>
        ExecutionPayloadSchema.parse(capture),
      );
      if (!first || !changed || !first.externalCalls || !changed.externalCalls)
        throw new Error('Missing external chain captures');
      // Source, entry inputs and argument origins stay fixed while external state
      // changes an upstream answer used directly or through a formula and helper.
      expect(first.externalCalls.map((call) => call.outputs[0]?.value)).toEqual(
        expectedValues,
      );
      expect(
        changed.externalCalls.map((call) => call.outputs[0]?.value),
      ).toEqual(changedValues);
      expect(referenceBindingKey(externalReferenceBindingFrom(first))).toBe(
        referenceBindingKey(externalReferenceBindingFrom(changed)),
      );
      for (const [index, call] of first.externalCalls.entries()) {
        const reference = ExternalOutputReferenceCaseSchema.parse({
          kind: 'externalOutputs',
          id: `independent-${call.id}`,
          revision: '1',
          basis: {
            method: 'Independent chain arithmetic',
            derivation:
              'With zero adapter increment, the first value is 3; the next value is 3 directly or 3 + 1 through the helper.',
            sourceDescription:
              'Synthetic adapter adds an external-state increment.',
          },
          binding: externalReferenceBindingFrom(first),
          expected: [
            {
              externalCallId: call.id,
              outputName: 'value',
              value: expectedValues[index],
              numericKind: 'float',
              unit: '',
            },
          ],
        });
        expect(referenceMatchesExecution(reference, changed)).toBe(true);
        const report = verifyExecution({
          execution: changed,
          referenceCases: [reference],
        });
        expect(report.ok).toBe(false);
        expect(report.checks.sourceToDocumentConsistency.status).toBe('passed');
        expect(report.checks.independentReferenceAgreement).toMatchObject({
          status: 'failed',
          counts: { checked: 1, failed: 1 },
        });
        expect(report.externalReferenceCoverage?.checked).toMatchObject([
          { externalCallId: call.id, outputName: 'value' },
        ]);
      }
    },
  );
  test('source, adapter and interpreter/distribution changes conservatively invalidate references', () => {
    const execution = capture();
    const reference = scoped(execution);
    const changedDistribution = capture();
    if (!changedDistribution.environment)
      throw new Error('Missing environment');
    changedDistribution.environment.distributions = [
      ['synthetic-adapter', '2.0'],
    ];
    const changedInterpreter = capture();
    changedInterpreter.versions.pythonInterpreter = 'another-python';
    const changedAdapter = capture();
    const call = changedAdapter.externalCalls?.[0];
    if (!call) throw new Error('Missing call');
    call.adapter.sha256 = 'c'.repeat(64);
    const source = changedAdapter.sourceManifest.find(
      (item) => item.moduleId === call.adapter.moduleId,
    );
    if (!source) throw new Error('Missing source');
    source.sha256 = call.adapter.sha256;
    changedAdapter.sourceClosureHash = sourceClosureHash(
      changedAdapter.sourceManifest,
    );
    for (const changed of [
      changedDistribution,
      changedInterpreter,
      changedAdapter,
    ]) {
      const report = verifyExecution({
        execution: changed,
        referenceCases: [reference],
      });
      expect(report.ok, JSON.stringify(report)).toBe(true);
      expect(report.checks.independentReferenceAgreement.status).toBe(
        'not_applicable',
      );
      expect(report.externalReferenceCoverage?.status).toBe('pending');
    }
  });
  test('binding preserves entry numeric kinds and zero signs', () => {
    const binding = externalReferenceBindingFrom(capture());
    const floatZero = {
      ...binding,
      resolvedInputs: { length: -0 },
    };
    const positiveZero = {
      ...floatZero,
      resolvedInputs: { length: 0 },
    };
    expect(referenceBindingKey(floatZero)).not.toBe(
      referenceBindingKey(positiveZero),
    );
    const integer = {
      ...binding,
      resolvedInputKinds: { length: 'int' },
    } satisfies typeof binding;
    expect(referenceBindingKey(integer)).not.toBe(referenceBindingKey(binding));
  });
  test('different scoped cases can cover disjoint outputs but overlapping slots are rejected', () => {
    const execution = capture();
    const references = [scoped(execution), scoped(execution, 'count', 1)];
    const report = verifyExecution({ execution, referenceCases: references });
    expect(report.ok).toBe(true);
    expect(report.checks.independentReferenceAgreement.counts?.checked).toBe(2);
    expect(report.externalReferenceCoverage).toMatchObject({
      status: 'complete',
      uncovered: [],
    });
    expect(
      ReferenceCasesSchema.safeParse([
        ...references,
        { ...references[0], id: 'another-source' },
      ]).success,
    ).toBe(false);
  });
  test('invalid selections and unit mismatches fail instead of claiming partial agreement', () => {
    const execution = capture();
    const reference = scoped(execution);
    for (const expected of [
      [{ ...reference.expected[0], outputName: 'missing' }],
      [{ ...reference.expected[0], externalCallId: 'root/missing' }],
      [{ ...reference.expected[0], unit: 'kg' }],
    ]) {
      const report = verifyExecution({
        execution,
        referenceCases: [{ ...reference, expected }],
      });
      expect(report.ok).toBe(false);
      expect(report.checks.independentReferenceAgreement.status).toBe('failed');
    }
  });
  test('legacy full references retain complete formula coverage and version-one meaning', () => {
    const execution = capture();
    const definition = execution.invocations[0]?.symbols.find(
      (item) => item.kind === 'formula',
    );
    if (!definition) throw new Error('Missing downstream formula');
    const legacy = {
      id: 'legacy-full',
      revision: '1',
      basis,
      binding: referenceSourceBindingFrom(execution),
      expected: [{ symbolId: definition.symbolId, value: 18, unit: 'm^2' }],
    };
    const report = verifyExecution({ execution, referenceCases: [legacy] });
    expect(report.ok).toBe(true);
    expect(report.externalReferenceCoverage?.status).toBe('pending');
    expect(
      verifyExecution({
        execution,
        referenceCases: [{ ...legacy, expected: [] }],
      }).ok,
    ).toBe(false);
    expect(
      ReferenceFileSchema.safeParse({
        referenceVersion: '1',
        cases: [scoped(execution)],
      }).success,
    ).toBe(false);
    expect(
      ReferenceFileSchema.safeParse({
        referenceVersion: '2',
        cases: [legacy, scoped(execution)],
      }).success,
    ).toBe(true);
    expect(
      ReferenceFileSchema.safeParse({
        referenceVersion: '1',
        cases: [
          { ...legacy, expected: [...legacy.expected, ...legacy.expected] },
        ],
      }).success,
    ).toBe(false);
  });
  test('legacy malformed expectations retain their numeric boundary diagnostic', () => {
    const execution = capture();
    const definition = execution.invocations[0]?.symbols.find(
      (item) => item.kind === 'formula',
    );
    if (!definition) throw new Error('Missing formula');
    const reference = {
      id: 'legacy-unsafe',
      revision: '1',
      basis,
      binding: referenceSourceBindingFrom(execution),
      expected: [{ symbolId: definition.symbolId, value: 1e25, unit: 'm^2' }],
    };
    const report = verifyExecution({ execution, referenceCases: [reference] });
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNSUPPORTED_NUMERIC_RANGE',
          symbolId: definition.symbolId,
        }),
      ]),
    );
  });
  test('malformed scoped expectations identify the captured output in diagnostics', () => {
    const execution = capture();
    const reference = scoped(execution);
    const report = verifyExecution({
      execution,
      referenceCases: [
        {
          ...reference,
          expected: reference.expected.map((expected) => ({
            ...expected,
            value: 1e25,
          })),
        },
      ],
    });
    const output = execution.externalCalls?.[0]?.outputs.find(
      (item) => item.name === 'area',
    );
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'UNSUPPORTED_NUMERIC_RANGE',
          symbolId: output?.symbolId,
          invocationId: execution.externalCalls?.[0]?.id,
        }),
      ]),
    );
  });
});
