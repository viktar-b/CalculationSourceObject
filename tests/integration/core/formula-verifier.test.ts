import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { CalculationSourceSymbol } from '@cs-object/core';
import type { CalculationSourceObject } from '@cs-object/core';
const collectCsoSymbols = (cso: CalculationSourceObject) => cso.sections.flatMap(section => section.items.flatMap(item => item.kind === 'symbol' ? [item.symbol] : []));
import {
  type ExecutionPayload,
  ExecutionPayloadSchema,
  ExecutionResponseSchema,
  type Invocation,
  type SymbolDefinition,
  type SymbolObservation,
} from '@cs-object/core';
import {
  BoundReferenceCaseSchema,
  ReferenceCaseSchema,
  ReferenceFileSchema,
} from '@cs-object/core';
import { VerificationReportSchema } from '@cs-object/core';
import { verifyExecution } from '@cs-object/core';

const fixtureUrl = (name: string): URL =>
  new URL(
    `../../fixtures/contract-cases/${name}.json`,
    import.meta.url,
  );

const fixtureExecution = (name = 'single-success'): ExecutionPayload => {
  const source: unknown = JSON.parse(readFileSync(fixtureUrl(name), 'utf8'));
  const response = ExecutionResponseSchema.parse(source);
  if (!response.ok) {
    throw new Error(`Fixture '${name}' is not a successful execution.`);
  }
  return response.execution;
};

const required = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
};

const invocationFor = (
  execution: ExecutionPayload,
  invocationId = 'root',
): Invocation =>
  required(
    execution.invocations.find((invocation) => invocation.id === invocationId),
    `Missing invocation '${invocationId}'.`,
  );

const definitionFor = (
  execution: ExecutionPayload,
  localId: string,
  invocationId = 'root',
): SymbolDefinition =>
  required(
    invocationFor(execution, invocationId).symbols.find(
      (definition) => definition.localId === localId,
    ),
    `Missing definition '${invocationId}/${localId}'.`,
  );

const symbolFor = (
  execution: ExecutionPayload,
  localId: string,
  invocationId = 'root',
): CalculationSourceSymbol => {
  const definition = definitionFor(execution, localId, invocationId);
  return required(
    collectCsoSymbols(execution.cso).find(
      (symbol) => symbol.id === definition.symbolId,
    ),
    `Missing CSO symbol '${definition.symbolId}'.`,
  );
};

const observationFor = (
  execution: ExecutionPayload,
  localId: string,
  invocationId = 'root',
): SymbolObservation => {
  const definition = definitionFor(execution, localId, invocationId);
  return required(
    execution.observations.find(
      (observation) => observation.symbolId === definition.symbolId,
    ),
    `Missing observation '${definition.symbolId}'.`,
  );
};

const sharedInputExecution = (): ExecutionPayload => {
  const execution = structuredClone(fixtureExecution());
  const root = invocationFor(execution);
  const width = definitionFor(execution, 'width');
  const area = definitionFor(execution, 'area');
  root.symbols = root.symbols.map((definition) =>
    definition.symbolId === area.symbolId
      ? {
          ...width,
          symbolId: area.symbolId,
          localId: area.localId,
          variableName: area.variableName,
          definitionLocation: area.definitionLocation,
        }
      : definition,
  );
  symbolFor(execution, 'area').valueTree = structuredClone(
    symbolFor(execution, 'width').valueTree,
  );
  observationFor(execution, 'area').kind = 'input';
  observationFor(execution, 'area').value = 2;
  return execution;
};

const diagnosticCodes = (
  report: ReturnType<typeof verifyExecution>,
): string[] => report.diagnostics.map((diagnostic) => diagnostic.code);

const verifyUnknown = (input: unknown) =>
  VerificationReportSchema.parse(
    Reflect.apply(verifyExecution, undefined, [input]),
  );

const singleReference = (
  execution: ExecutionPayload,
  value: number,
  unit = 'm^2',
) => {
  const area = definitionFor(execution, 'area');
  return ReferenceCaseSchema.parse({
    id: 'single-area',
    revision: 'hand-v1',
    basis: {
      method: 'Hand arithmetic',
      derivation: 'Two times four equals eight.',
      sourceDescription: 'Independent test case.',
    },
    binding: {
      entryModuleId: execution.entry.moduleId,
      entrySourceHash: execution.entry.sourceHash,
      sourceClosureHash: execution.sourceClosureHash,
      function: execution.entry.function,
      resolvedInputs: execution.entry.resolvedInputs,
    },
    expected: [{ symbolId: area.symbolId, value, unit }],
  });
};

const objectAt = (value: unknown, path: readonly PropertyKey[]): object => {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object') {
      throw new Error(
        `Fixture path '${path.map(String).join('.')}' is missing.`,
      );
    }
    current = Reflect.get(current, key);
  }
  if (current === null || typeof current !== 'object') {
    throw new Error(
      `Fixture path '${path.map(String).join('.')}' is not an object.`,
    );
  }
  return current;
};

describe('verifyExecution', () => {
  test.each([0, -0])(
    'matches reference input zero signs exactly for %s',
    (value) => {
      const execution = fixtureExecution();
      execution.entry.resolvedInputs.width = value;
      const root = invocationFor(execution);
      if ('parentInvocationId' in root) {
        throw new Error('Expected the root invocation.');
      }
      root.resolvedInputs.width = value;
      root.inputBindings = root.inputBindings.map((binding) => ({
        ...binding,
        value,
      }));
      for (const localId of ['width', 'area']) {
        const tree = symbolFor(execution, localId).valueTree;
        tree.result = { kind: 'number', value };
        for (const node of tree.nodes) {
          if (node.result) node.result = { kind: 'number', value };
          if (localId === 'width' && node.mode === 'LITERAL') {
            node.literal = { kind: 'number', value };
          }
        }
        observationFor(execution, localId).value = value;
      }
      const parsed = ExecutionPayloadSchema.parse(execution);
      expect(Object.is(parsed.entry.resolvedInputs.width, value)).toBe(true);
      // An opposite-sign result still agrees numerically. Input identity is exact.
      const matching = singleReference(parsed, -value);
      const opposite = structuredClone(matching);
      opposite.id = 'opposite-sign';
      opposite.binding.resolvedInputs.width = -value;
      expect(
        BoundReferenceCaseSchema.safeParse({
          execution: parsed,
          referenceCase: matching,
        }).success,
      ).toBe(true);
      const unbound = BoundReferenceCaseSchema.safeParse({
        execution: parsed,
        referenceCase: opposite,
      });
      expect(unbound.success).toBe(false);
      if (!unbound.success) {
        expect(unbound.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              params: { diagnosticCode: 'REFERENCE_BINDING_MISMATCH' },
            }),
          ]),
        );
      }
      for (const referenceCases of [
        [matching],
        [opposite, matching],
        [matching, opposite],
      ]) {
        const report = VerificationReportSchema.parse(
          verifyExecution({ execution: parsed, referenceCases }),
        );
        expect(report.ok).toBe(true);
        expect(report.checks.independentReferenceAgreement).toEqual({
          status: 'passed',
          counts: { checked: 1, passed: 1, failed: 0 },
        });
      }
      const report = VerificationReportSchema.parse(
        verifyExecution({ execution: parsed, referenceCases: [opposite] }),
      );
      expect(report.ok).toBe(true);
      expect(report.checks.sourceToDocumentConsistency.status).toBe('passed');
      expect(report.checks.independentReferenceAgreement).toEqual({
        status: 'not_applicable',
        counts: { checked: 0, passed: 0, failed: 0 },
      });
      const duplicate = structuredClone(matching);
      duplicate.id = 'same-sign-duplicate';
      const invalid = verifyExecution({
        execution: parsed,
        referenceCases: [matching, duplicate],
      });
      expect(invalid.checks.independentReferenceAgreement.status).toBe(
        'failed',
      );
      expect(diagnosticCodes(invalid)).toContain('DUPLICATE_REFERENCE_BINDING');
    },
  );

  test('checks distinct documented definitions and stored results separately', () => {
    const report = verifyExecution({ execution: fixtureExecution() });

    expect(VerificationReportSchema.parse(report).ok).toBe(true);
    expect(report.checks.inputConsistency).toEqual({
      status: 'passed',
      counts: { checked: 1, passed: 1, failed: 0 },
      cacheCounts: { checked: 2, passed: 2, failed: 0 },
    });
    expect(report.checks.formulaConsistency).toEqual({
      status: 'passed',
      counts: { checked: 1, passed: 1, failed: 0 },
      cacheCounts: { checked: 2, passed: 2, failed: 0 },
    });
  });

  test('rejects runtime and cache tampering with qualified comparisons', () => {
    const runtime = verifyExecution({
      execution: fixtureExecution('wrong-runtime'),
    });
    const cache = verifyExecution({
      execution: fixtureExecution('wrong-cache'),
    });

    const runtimeDiagnostic = required(
      runtime.diagnostics.find(
        (diagnostic) => diagnostic.code === 'FORMULA_MISMATCH',
      ),
      'Missing formula mismatch.',
    );
    expect(runtimeDiagnostic.comparison).toMatchObject({
      actual: 999,
      expected: 8,
      absoluteError: 991,
      absoluteTolerance: 1e-9,
      relativeTolerance: 1e-12,
    });
    const cacheDiagnostic = required(
      cache.diagnostics.find(
        (diagnostic) => diagnostic.code === 'CACHE_MISMATCH',
      ),
      'Missing cache mismatch.',
    );
    expect(cacheDiagnostic.symbolId).toBe(
      definitionFor(
        cache.ok ? fixtureExecution() : fixtureExecution('wrong-cache'),
        'area',
      ).symbolId,
    );
    expect(cacheDiagnostic.nodeKey).toBe('n3');
    expect(cache.checks.formulaConsistency).toMatchObject({
      status: 'failed',
      counts: { checked: 1, passed: 1, failed: 0 },
      cacheCounts: { checked: 2, passed: 1, failed: 1 },
    });
  });

  test('uses parsed input authority when a lowered graph literal is tampered', () => {
    const execution = structuredClone(fixtureExecution());
    const width = symbolFor(execution, 'width');
    const node = required(
      width.valueTree.nodes.find((candidate) => candidate.key === 'n1'),
      'Missing width node.',
    );
    node.literal = { kind: 'number', value: 999 };
    node.result = { kind: 'number', value: 999 };
    width.valueTree.result = { kind: 'number', value: 999 };

    const report = verifyExecution({
      execution: ExecutionPayloadSchema.parse(execution),
    });

    expect(report.checks.inputConsistency.status).toBe('failed');
    expect(diagnosticCodes(report)).toContain('INPUT_MISMATCH');
    expect(diagnosticCodes(report)).not.toContain('FORMULA_MISMATCH');
    expect(report.checks.formulaConsistency.status).toBe('passed');
  });

  test('classifies source constants separately and evaluates formula aliases', () => {
    const execution = structuredClone(fixtureExecution());
    const root = invocationFor(execution);
    const input = definitionFor(execution, 'width');
    const inputIndex = root.symbols.findIndex(
      (definition) => definition.symbolId === input.symbolId,
    );
    root.symbols[inputIndex] = {
      symbolId: input.symbolId,
      localId: input.localId,
      variableName: input.variableName,
      definitionLocation: input.definitionLocation,
      kind: 'constant',
      literal: { value: 2, location: input.definitionLocation },
    };
    observationFor(execution, 'width').kind = 'constant';
    const area = symbolFor(execution, 'area');
    area.valueTree.nodes = [
      {
        key: 'n3',
        mode: 'SYMBOL',
        symbol: { id: input.symbolId },
        result: { kind: 'number', value: 2 },
      },
    ];
    area.valueTree.result = { kind: 'number', value: 2 };
    observationFor(execution, 'area').value = 2;

    const report = verifyExecution({
      execution: ExecutionPayloadSchema.parse(execution),
    });

    expect(report.ok).toBe(true);
    expect(report.checks.inputConsistency).toEqual({
      status: 'not_applicable',
      counts: { checked: 0, passed: 0, failed: 0 },
    });
    expect(report.checks.constantConsistency.counts).toEqual({
      checked: 1,
      passed: 1,
      failed: 0,
    });
    expect(report.checks.formulaConsistency.counts).toEqual({
      checked: 1,
      passed: 1,
      failed: 0,
    });
  });

  test('does not cascade a tampered caller input graph into child formulas', () => {
    const execution = structuredClone(fixtureExecution('two-panel-success'));
    const width = symbolFor(execution, 'width');
    for (const node of width.valueTree.nodes) {
      if (node.literal?.kind === 'number') {
        node.literal.value = 999;
      }
      if (node.result?.kind === 'number') {
        node.result.value = 999;
      }
    }
    if (width.valueTree.result?.kind !== 'number') {
      throw new Error('Width tree has no numeric result.');
    }
    width.valueTree.result.value = 999;

    const report = verifyExecution({
      execution: ExecutionPayloadSchema.parse(execution),
    });

    expect(report.checks.inputConsistency.counts).toEqual({
      checked: 12,
      passed: 11,
      failed: 1,
    });
    expect(report.checks.formulaConsistency).toMatchObject({
      status: 'passed',
      counts: { checked: 9, passed: 9, failed: 0 },
      cacheCounts: { checked: 20, passed: 20, failed: 0 },
    });
  });

  test('rejects an omitted formula, cycles, bad arity and unsafe intermediates', () => {
    const omitted = structuredClone(fixtureExecution());
    const omittedArea = symbolFor(omitted, 'area');
    omittedArea.valueTree.nodes = [
      {
        key: 'n3',
        mode: 'LITERAL',
        literal: { kind: 'number', value: 8 },
        result: { kind: 'number', value: 8 },
      },
    ];

    const cyclic = structuredClone(fixtureExecution());
    const cyclicArea = symbolFor(cyclic, 'area');
    const cyclicReference = required(
      cyclicArea.valueTree.nodes.find((node) => node.key === 'n1'),
      'Missing area reference.',
    );
    cyclicReference.symbol = { id: cyclicArea.id };

    const badArity = structuredClone(fixtureExecution());
    const badArityRoot = required(
      symbolFor(badArity, 'area').valueTree.nodes.find(
        (node) => node.key === 'n3',
      ),
      'Missing area root.',
    );
    badArityRoot.funcArgs = [{ key: 'n1' }];

    const unsafe = structuredClone(fixtureExecution());
    const unsafeArea = symbolFor(unsafe, 'area');
    unsafeArea.valueTree.rootKey = 'n4';
    unsafeArea.valueTree.result = { kind: 'number', value: 1 };
    unsafeArea.valueTree.nodes = [
      {
        key: 'n1',
        mode: 'LITERAL',
        literal: { kind: 'number', value: Number.MAX_SAFE_INTEGER },
      },
      {
        key: 'n2',
        mode: 'LITERAL',
        literal: { kind: 'number', value: 1 },
      },
      {
        key: 'n3',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.add' },
        funcArgs: [{ key: 'n1' }, { key: 'n2' }],
      },
      {
        key: 'n4',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.subtract' },
        funcArgs: [{ key: 'n3' }, { key: 'n1' }],
        result: { kind: 'number', value: 1 },
      },
    ];
    const unsafeDefinition = definitionFor(unsafe, 'area');
    if (unsafeDefinition.kind !== 'formula') {
      throw new Error('Area is not a formula definition.');
    }
    unsafeDefinition.address.nodeKey = 'n4';
    observationFor(unsafe, 'area').value = 1;

    const cases = [
      [omitted, 'OMITTED_FORMULA'],
      [cyclic, 'FORMULA_CYCLE'],
      [badArity, 'INVALID_FUNCTION_ARITY'],
      [unsafe, 'UNSUPPORTED_NUMERIC_RANGE'],
    ] as const;
    for (const [execution, code] of cases) {
      const report = verifyExecution({
        execution: ExecutionPayloadSchema.parse(execution),
      });
      expect(report.ok).toBe(false);
      expect(diagnosticCodes(report)).toContain(code);
      expect(() => VerificationReportSchema.parse(report)).not.toThrow();
    }
  });

  test('maps a missing operand at the JavaScript boundary to a failure report', () => {
    const execution = structuredClone(fixtureExecution());
    const root = required(
      symbolFor(execution, 'area').valueTree.nodes.find(
        (node) => node.key === 'n3',
      ),
      'Missing area root.',
    );
    root.funcArgs = [{ key: 'n1' }, { key: 'missing' }];

    const report = verifyExecution({ execution });

    expect(report.checks.executionValidity.status).toBe('failed');
    expect(diagnosticCodes(report)).toContain('MISSING_FORMULA_OPERAND');
    expect(() => VerificationReportSchema.parse(report)).not.toThrow();
  });

  test('reports invalid parent arity before evaluating an unsupported child', () => {
    const execution = structuredClone(fixtureExecution());
    const area = symbolFor(execution, 'area');
    const root = required(
      area.valueTree.nodes.find((node) => node.key === 'n3'),
      'Missing area root.',
    );
    area.valueTree.nodes.push({
      key: 'extra',
      mode: 'FUNCTION',
      funcSpec: { id: 'fg.noop' },
      funcArgs: [],
    });
    root.funcArgs = [...(root.funcArgs ?? []), { key: 'extra' }];

    const report = verifyExecution({
      execution: ExecutionPayloadSchema.parse(execution),
    });

    expect(diagnosticCodes(report)).toContain('INVALID_FUNCTION_ARITY');
    expect(diagnosticCodes(report)).not.toContain('UNSUPPORTED_FUNCTION');
  });

  test('preserves definition context when an execution address is invalid', () => {
    const execution = structuredClone(fixtureExecution());
    const area = definitionFor(execution, 'area');
    if (area.kind !== 'formula') {
      throw new Error('Expected area formula definition.');
    }
    area.address.nodeKey = 'missing';
    const report = verifyUnknown({ execution });
    expect(report.checks.executionValidity.status).toBe('failed');
    const diagnostic = required(
      report.diagnostics.find((item) => item.code === 'UNKNOWN_NODE_ADDRESS'),
      'Missing definition address diagnostic.',
    );
    expect(diagnostic.symbolId).toBe(area.symbolId);
    expect(diagnostic.nodeKey).toBe('missing');
    expect(diagnostic.invocationId).toBe('root');
    expect(diagnostic.location).toEqual(area.definitionLocation);
  });

  test('identifies every definition with a missing runtime observation', () => {
    const execution = fixtureExecution();
    execution.observations = [];
    const report = verifyUnknown({ execution });
    const definitions = invocationFor(execution).symbols;
    const diagnostics = report.diagnostics.filter(
      (item) => item.code === 'MISSING_OBSERVATION',
    );
    expect(report.checks.executionValidity.status).toBe('failed');
    expect(diagnostics.map((item) => item.symbolId).sort()).toEqual(
      definitions.map((definition) => definition.symbolId).sort(),
    );
    for (const diagnostic of diagnostics) {
      const definition = required(
        definitions.find((item) => item.symbolId === diagnostic.symbolId),
        'Missing definition.',
      );
      expect(diagnostic.invocationId).toBe('root');
      expect(diagnostic.location).toEqual(definition.definitionLocation);
    }
  });

  test('retains CSO identity and provenance when a definition is missing', () => {
    const execution = fixtureExecution();
    const definitions = structuredClone(invocationFor(execution).symbols);
    invocationFor(execution).symbols = [];
    const report = verifyUnknown({ execution });
    const diagnostics = report.diagnostics.filter(
      (item) => item.code === 'MISSING_SYMBOL_DEFINITION',
    );
    expect(diagnostics).toHaveLength(definitions.length);
    for (const definition of definitions) {
      const diagnostic = required(
        diagnostics.find((item) => item.symbolId === definition.symbolId),
        'Missing CSO context.',
      );
      expect(diagnostic.invocationId).toBe('root');
      expect(diagnostic.location).toEqual(definition.definitionLocation);
    }
  });

  test('retains symbol and source context for an invalid bound reference row', () => {
    const execution = fixtureExecution();
    const area = definitionFor(execution, 'area');
    const report = VerificationReportSchema.parse(
      verifyExecution({
        execution,
        referenceCases: [singleReference(execution, 8, 'wrong-unit')],
      }),
    );
    const diagnostic = required(
      report.diagnostics.find(
        (item) => item.code === 'REFERENCE_UNIT_MISMATCH',
      ),
      'Missing reference unit diagnostic.',
    );
    expect(report.checks.independentReferenceAgreement.status).toBe('failed');
    expect(diagnostic.symbolId).toBe(area.symbolId);
    expect(diagnostic.invocationId).toBe('root');
    expect(diagnostic.location).toEqual(area.definitionLocation);
  });

  test('identifies each omitted reference output without a row index', () => {
    const execution = fixtureExecution('two-panel-success');
    const reference = ReferenceFileSchema.parse(
      JSON.parse(readFileSync(fixtureUrl('reference-cases'), 'utf8')),
    ).cases[0];
    const expectedIds = reference.expected.map((row) => row.symbolId);
    reference.expected = [];
    const report = VerificationReportSchema.parse(
      verifyExecution({ execution, referenceCases: [reference] }),
    );
    const diagnostics = report.diagnostics.filter(
      (item) => item.code === 'MISSING_REFERENCE_SYMBOL',
    );
    expect(diagnostics.map((item) => item.symbolId).sort()).toEqual(
      expectedIds.sort(),
    );
    for (const diagnostic of diagnostics) {
      const owner = required(
        execution.invocations.find((invocation) =>
          invocation.symbols.some(
            (symbol) => symbol.symbolId === diagnostic.symbolId,
          ),
        ),
        'Missing expected definition owner.',
      );
      const definition = required(
        owner.symbols.find((symbol) => symbol.symbolId === diagnostic.symbolId),
        'Missing expected definition.',
      );
      expect(diagnostic.invocationId).toBe(owner.id);
      expect(diagnostic.location).toEqual(definition.definitionLocation);
    }
  });

  test('qualifies duplicate and extra reference rows only with available bound context', () => {
    for (const target of [
      'duplicate',
      'stale-duplicate',
      'known-extra',
      'unknown-extra',
    ]) {
      const execution = fixtureExecution();
      const area = definitionFor(execution, 'area');
      const width = definitionFor(execution, 'width');
      const reference = singleReference(execution, 8);
      if (target === 'duplicate' || target === 'stale-duplicate') {
        reference.expected.push(structuredClone(reference.expected[0]));
        if (target === 'stale-duplicate')
          reference.binding.sourceClosureHash = '0'.repeat(64);
      } else {
        reference.expected.push({
          symbolId:
            target === 'known-extra' ? width.symbolId : 'unknown-symbol',
          value: 2,
          unit: 'm',
        });
      }
      const report = verifyUnknown({ execution, referenceCases: [reference] });
      const code = target.includes('duplicate')
        ? 'DUPLICATE_REFERENCE_SYMBOL'
        : 'UNKNOWN_REFERENCE_SYMBOL';
      const diagnostic = required(
        report.diagnostics.find((item) => item.code === code),
        `Missing ${code}.`,
      );
      expect(diagnostic.symbolId).toBe(
        target.includes('duplicate')
          ? area.symbolId
          : target === 'known-extra'
            ? width.symbolId
            : 'unknown-symbol',
      );
      if (target === 'duplicate' || target === 'known-extra') {
        expect(diagnostic.invocationId).toBe('root');
        expect(diagnostic.location).toEqual(
          target === 'duplicate'
            ? area.definitionLocation
            : width.definitionLocation,
        );
      } else {
        expect(diagnostic.invocationId).toBeUndefined();
        expect(diagnostic.location).toBeUndefined();
      }
    }
  });

  test('rejects extreme finite values before constructing comparisons', () => {
    for (const value of [1e308, -1e308]) {
      for (const target of ['runtime', 'literal', 'cache', 'reference']) {
        const execution = structuredClone(fixtureExecution());
        const reference = singleReference(execution, 8);
        const area = symbolFor(execution, 'area');
        if (target === 'runtime') {
          observationFor(execution, 'area').value = value;
          const literal = required(
            area.valueTree.nodes.find((node) => node.key === 'n2'),
            'Missing operand.',
          );
          literal.literal = { kind: 'number', value: -value };
        } else if (target === 'literal') {
          const literal = required(
            area.valueTree.nodes.find((node) => node.key === 'n2'),
            'Missing operand.',
          );
          literal.literal = { kind: 'number', value };
        } else if (target === 'cache') {
          area.valueTree.result = { kind: 'number', value };
        } else {
          reference.expected[0].value = value;
        }
        const report = verifyUnknown({
          execution,
          referenceCases: [reference],
        });
        expect(report.ok).toBe(false);
        const diagnostic = required(
          report.diagnostics.find(
            (item) => item.code === 'UNSUPPORTED_NUMERIC_RANGE',
          ),
          `Missing range diagnostic for ${target}.`,
        );
        expect(diagnostic.comparison).toBeUndefined();
        expect(diagnostic.valueDisplay?.text).toBe(String(value));
      }
    }
  });

  test('returns structured nonfinite and nonnumeric observation failures', () => {
    for (const [value, code] of [
      [Number.POSITIVE_INFINITY, 'NON_FINITE_NUMBER'],
      ['wrong', 'NONNUMERIC_RESULT'],
    ] as const) {
      const execution: unknown = structuredClone(fixtureExecution());
      Reflect.set(objectAt(execution, ['observations', 1]), 'value', value);
      const report = verifyUnknown({ execution });
      const diagnostic = required(
        report.diagnostics.find((candidate) => candidate.code === code),
        `Missing ${code}.`,
      );
      expect(report.checks.executionValidity.status).toBe('failed');
      expect(diagnostic.symbolId).toBe(
        definitionFor(fixtureExecution(), 'area').symbolId,
      );
      expect(diagnostic.location?.start.line).toBe(11);
      expect(diagnostic.valueDisplay?.text).toBe(String(value));
    }
  });

  test('evaluates detached formulas and ignores repeated placements in counts', () => {
    const execution = structuredClone(fixtureExecution());
    const section = required(
      execution.cso.sections[0],
      'Missing root section.',
    );
    const areaId = definitionFor(execution, 'area').symbolId;
    const areaItem = required(
      section.items.find(
        (item) => item.kind === 'symbol' && item.symbol.id === areaId,
      ),
      'Missing area item.',
    );
    if (areaItem.kind !== 'symbol') {
      throw new Error('Area item is not a symbol.');
    }
    section.items = section.items.filter(
      (item) => item.kind !== 'symbol' || item.symbol.id !== areaId,
    );
    section.items.push({ kind: 'symbolRef', id: areaId });
    execution.cso.detachedItems = [{ kind: 'symbol', symbol: areaItem.symbol }];

    const report = verifyExecution({
      execution: ExecutionPayloadSchema.parse(execution),
    });

    expect(report.ok).toBe(true);
    expect(report.checks.formulaConsistency.counts).toEqual({
      checked: 1,
      passed: 1,
      failed: 0,
    });
  });

  test('folds operation evidence into its symbol without inflating cache counts', () => {
    const execution = structuredClone(fixtureExecution());
    const area = definitionFor(execution, 'area');
    if (area.kind !== 'formula') {
      throw new Error('Area is not a formula.');
    }
    execution.operationObservations = [
      {
        address: area.address,
        invocationId: 'root',
        value: 9,
        location: area.definitionLocation,
      },
    ];

    const report = verifyExecution({
      execution: ExecutionPayloadSchema.parse(execution),
    });

    expect(diagnosticCodes(report)).toContain('OPERATION_MISMATCH');
    expect(report.checks.formulaConsistency).toMatchObject({
      status: 'failed',
      counts: { checked: 1, passed: 0, failed: 1 },
      cacheCounts: { checked: 2, passed: 2, failed: 0 },
    });
  });

  test('identifies every documented input consuming a failed binding', () => {
    const execution = sharedInputExecution();
    const root = invocationFor(execution);
    const width = definitionFor(execution, 'width');
    const area = definitionFor(execution, 'area');
    execution.entry.resolvedInputs.width = 3;
    root.resolvedInputs.width = 3;

    const report = VerificationReportSchema.parse(
      verifyExecution({ execution: ExecutionPayloadSchema.parse(execution) }),
    );
    expect(report.checks.inputConsistency.counts).toEqual({
      checked: 2,
      passed: 0,
      failed: 2,
    });
    const diagnostics = report.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code === 'INPUT_MISMATCH' &&
        diagnostic.message.startsWith('Resolved input'),
    );
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((diagnostic) => diagnostic.symbolId).sort()).toEqual(
      [width.symbolId, area.symbolId].sort(),
    );
    for (const diagnostic of diagnostics) {
      expect(diagnostic.invocationId).toBe(root.id);
      expect(diagnostic.location).toBeDefined();
      expect(diagnostic.comparison).toMatchObject({
        actual: 3,
        expected: 2,
        absoluteError: 1,
        absoluteTolerance: 1e-9,
        relativeTolerance: 1e-12,
      });
    }
  });

  test('qualifies all consumers of a missing binding but leaves unused parameters unqualified', () => {
    const execution = sharedInputExecution();
    const root = invocationFor(execution);
    root.inputBindings = [];
    root.resolvedInputs.unused = 3;
    execution.entry.resolvedInputs.unused = 3;
    const report = verifyUnknown({ execution });
    const diagnostics = report.diagnostics.filter(
      (item) => item.code === 'MISSING_INPUT_BINDING',
    );
    expect(diagnostics).toHaveLength(3);
    for (const definition of root.symbols) {
      const diagnostic = required(
        diagnostics.find((item) => item.symbolId === definition.symbolId),
        'Missing binding consumer.',
      );
      expect(diagnostic.invocationId).toBe(root.id);
      expect(diagnostic.location).toEqual(definition.definitionLocation);
    }
    const unused = required(
      diagnostics.find((item) => item.symbolId === undefined),
      'Missing unused parameter diagnostic.',
    );
    expect(unused.invocationId).toBe(root.id);
    expect(unused.location).toBeUndefined();
    expect(unused.message).toContain("'unused'");
  });

  test('fails unused input bindings without inventing documented-symbol counts', () => {
    for (const keepDocumentedInput of [true, false]) {
      const execution = structuredClone(fixtureExecution());
      const root = invocationFor(execution);
      execution.entry.resolvedInputs.unused = 3;
      root.resolvedInputs.unused = 3;
      root.inputBindings.push({
        kind: 'parsedDefault',
        parameterName: 'unused',
        parameterLocation: {
          moduleId: root.moduleId,
          start: { line: 3, column: 0 },
          end: { line: 3, column: 10 },
        },
        value: 2,
        defaultLocation: {
          moduleId: root.moduleId,
          start: { line: 3, column: 0 },
          end: { line: 3, column: 10 },
        },
      });
      if (!keepDocumentedInput) {
        root.symbols = [];
        execution.observations = [];
        for (const section of execution.cso.sections) {
          section.items = section.items.filter(
            (item) => item.kind !== 'symbol',
          );
        }
      }

      const report = verifyExecution({
        execution: ExecutionPayloadSchema.parse(execution),
      });
      expect(report.checks.inputConsistency).toEqual({ status: 'failed' });
      expect(diagnosticCodes(report)).toContain('INPUT_MISMATCH');
      expect(
        report.diagnostics.find(
          (diagnostic) =>
            diagnostic.code === 'INPUT_MISMATCH' &&
            diagnostic.message.includes("'unused'"),
        )?.symbolId,
      ).toBeUndefined();
      if (keepDocumentedInput) {
        expect(report.checks.formulaConsistency.status).toBe('passed');
      } else {
        expect(report.checks.formulaConsistency).toEqual({
          status: 'not_applicable',
          counts: { checked: 0, passed: 0, failed: 0 },
        });
      }
    }
  });

  test('keeps input-only formulas and empty complete references not applicable', () => {
    const execution = structuredClone(fixtureExecution());
    const areaId = definitionFor(execution, 'area').symbolId;
    invocationFor(execution).symbols = invocationFor(execution).symbols.filter(
      (definition) => definition.symbolId !== areaId,
    );
    execution.observations = execution.observations.filter(
      (observation) => observation.symbolId !== areaId,
    );
    for (const section of execution.cso.sections) {
      section.items = section.items.filter(
        (item) => item.kind !== 'symbol' || item.symbol.id !== areaId,
      );
    }
    const parsed = ExecutionPayloadSchema.parse(execution);
    const emptyReference = ReferenceCaseSchema.parse({
      id: 'input-only',
      revision: 'hand-v1',
      basis: {
        method: 'No calculated outputs',
        derivation: 'The document contains one input.',
        sourceDescription: 'Independent input-only case.',
      },
      binding: {
        entryModuleId: parsed.entry.moduleId,
        entrySourceHash: parsed.entry.sourceHash,
        sourceClosureHash: parsed.sourceClosureHash,
        function: parsed.entry.function,
        resolvedInputs: parsed.entry.resolvedInputs,
      },
      expected: [],
    });

    const report = verifyExecution({
      execution: parsed,
      referenceCases: [emptyReference],
    });

    expect(report.ok).toBe(true);
    expect(report.checks.formulaConsistency).toEqual({
      status: 'not_applicable',
      counts: { checked: 0, passed: 0, failed: 0 },
    });
    expect(report.checks.independentReferenceAgreement).toEqual({
      status: 'not_applicable',
      counts: { checked: 0, passed: 0, failed: 0 },
    });
  });

  test('validates source and references independently with all three values', () => {
    const execution = fixtureExecution();
    const passing = verifyExecution({
      execution,
      referenceCases: [singleReference(execution, 8)],
    });
    expect(passing.checks.independentReferenceAgreement).toEqual({
      status: 'passed',
      counts: { checked: 1, passed: 1, failed: 0 },
    });

    const runtimeMatchesReference = structuredClone(execution);
    observationFor(runtimeMatchesReference, 'area').value = 9;
    const formulaDisagrees = verifyExecution({
      execution: ExecutionPayloadSchema.parse(runtimeMatchesReference),
      referenceCases: [singleReference(runtimeMatchesReference, 9)],
    });
    const formulaReferenceDiagnostic = required(
      formulaDisagrees.diagnostics.find(
        (diagnostic) => diagnostic.code === 'REFERENCE_FORMULA_MISMATCH',
      ),
      'Missing formula reference mismatch.',
    );
    expect(formulaReferenceDiagnostic.comparison).toMatchObject({
      actual: 9,
      expected: 9,
      formulaValue: 8,
      absoluteError: 0,
      referenceRevision: 'hand-v1',
    });

    const invalidReference = verifyUnknown({
      execution,
      referenceCases: 'invalid',
    });
    expect(invalidReference.checks.sourceToDocumentConsistency.status).toBe(
      'passed',
    );
    expect(invalidReference.checks.independentReferenceAgreement.status).toBe(
      'failed',
    );
    expect(
      invalidReference.diagnostics.every(
        (diagnostic) =>
          diagnostic.check === 'independentReferenceAgreement' ||
          diagnostic.stage !== 'reference',
      ),
    ).toBe(true);
  });
});
