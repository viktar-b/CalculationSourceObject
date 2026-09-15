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
} from '@cs-object/core';
import { VerificationReportSchema } from '@cs-object/core';
import { verifyExecution } from '@cs-object/core';

const fixtureUrl = new URL(
  '../../fixtures/contract-cases/single-success.json',
  import.meta.url,
);

const required = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
};

const fixtureExecution = (): ExecutionPayload => {
  const source: unknown = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
  const response = ExecutionResponseSchema.parse(source);
  if (!response.ok) {
    throw new Error('Expected a successful execution fixture.');
  }
  return structuredClone(response.execution);
};

const rootInvocation = (execution: ExecutionPayload): Invocation =>
  required(
    execution.invocations.find((invocation) => invocation.id === 'root'),
    'Missing root invocation.',
  );

const definitionFor = (
  execution: ExecutionPayload,
  localId: string,
): SymbolDefinition =>
  required(
    rootInvocation(execution).symbols.find(
      (definition) => definition.localId === localId,
    ),
    `Missing definition '${localId}'.`,
  );

const symbolFor = (
  execution: ExecutionPayload,
  localId: string,
): CalculationSourceSymbol => {
  const definition = definitionFor(execution, localId);
  return required(
    collectCsoSymbols(execution.cso).find(
      (symbol) => symbol.id === definition.symbolId,
    ),
    `Missing CSO symbol '${definition.symbolId}'.`,
  );
};

const makeConstant = (
  execution: ExecutionPayload,
  localId: string,
  value: number,
): void => {
  const invocation = rootInvocation(execution);
  const definition = definitionFor(execution, localId);
  const index = invocation.symbols.findIndex(
    (candidate) => candidate.symbolId === definition.symbolId,
  );
  if (index < 0) {
    throw new Error(`Missing definition index '${localId}'.`);
  }
  invocation.symbols[index] = {
    symbolId: definition.symbolId,
    localId: definition.localId,
    variableName: definition.variableName,
    definitionLocation: definition.definitionLocation,
    kind: 'constant',
    literal: { value, location: definition.definitionLocation },
  };
  const observation = required(
    execution.observations.find(
      (candidate) => candidate.symbolId === definition.symbolId,
    ),
    `Missing observation '${localId}'.`,
  );
  observation.kind = 'constant';
  observation.value = value;
};

const makeInput = (
  execution: ExecutionPayload,
  localId: string,
  value: number,
): void => {
  const invocation = rootInvocation(execution);
  const definition = definitionFor(execution, localId);
  const index = invocation.symbols.findIndex(
    (candidate) => candidate.symbolId === definition.symbolId,
  );
  if (index < 0) {
    throw new Error(`Missing definition index '${localId}'.`);
  }
  invocation.symbols[index] = {
    symbolId: definition.symbolId,
    localId: definition.localId,
    variableName: definition.variableName,
    definitionLocation: definition.definitionLocation,
    kind: 'input',
    givenSource: { kind: 'parameter', parameterName: localId },
  };
  invocation.resolvedInputs[localId] = value;
  execution.entry.resolvedInputs[localId] = value;
  invocation.inputBindings.push({
    kind: 'parsedDefault',
    parameterName: localId,
    parameterLocation: definition.definitionLocation,
    value,
    defaultLocation: definition.definitionLocation,
  });
  const observation = required(
    execution.observations.find(
      (candidate) => candidate.symbolId === definition.symbolId,
    ),
    `Missing observation '${localId}'.`,
  );
  observation.kind = 'input';
  observation.value = value;
};

const verifyValidExecution = (execution: ExecutionPayload) => {
  const parsedExecution = ExecutionPayloadSchema.parse(execution);
  return VerificationReportSchema.parse(
    verifyExecution({ execution: parsedExecution }),
  );
};

const diagnosticCodes = (
  report: ReturnType<typeof verifyValidExecution>,
): readonly string[] => report.diagnostics.map((diagnostic) => diagnostic.code);

describe('source graph cycle verification', () => {
  test('rejects an input graph that directly references itself', () => {
    const execution = fixtureExecution();
    const width = symbolFor(execution, 'width');
    width.valueTree.nodes = [
      {
        key: 'n1',
        mode: 'SYMBOL',
        symbol: { id: width.id },
        result: { kind: 'number', value: 2 },
      },
    ];

    const report = verifyValidExecution(execution);

    expect(report.ok).toBe(false);
    expect(report.checks.inputConsistency.status).toBe('failed');
    expect(diagnosticCodes(report)).toContain('FORMULA_CYCLE');
  });

  test('rejects a constant graph that directly references itself', () => {
    const execution = fixtureExecution();
    makeConstant(execution, 'width', 2);
    const width = symbolFor(execution, 'width');
    width.valueTree.nodes = [
      {
        key: 'n1',
        mode: 'SYMBOL',
        symbol: { id: width.id },
        result: { kind: 'number', value: 2 },
      },
    ];

    const report = verifyValidExecution(execution);

    expect(report.ok).toBe(false);
    expect(report.checks.constantConsistency.status).toBe('failed');
    expect(diagnosticCodes(report)).toContain('FORMULA_CYCLE');
  });

  test('rejects an input self-reference nested inside a function', () => {
    const execution = fixtureExecution();
    const width = symbolFor(execution, 'width');
    width.valueTree.rootKey = 'n3';
    width.valueTree.nodes = [
      {
        key: 'n1',
        mode: 'SYMBOL',
        symbol: { id: width.id },
      },
      {
        key: 'n2',
        mode: 'LITERAL',
        literal: { kind: 'number', value: 0 },
      },
      {
        key: 'n3',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.add' },
        funcArgs: [{ key: 'n1' }, { key: 'n2' }],
        result: { kind: 'number', value: 2 },
      },
    ];

    const report = verifyValidExecution(execution);

    expect(report.ok).toBe(false);
    expect(report.checks.inputConsistency.status).toBe('failed');
    expect(diagnosticCodes(report)).toContain('FORMULA_CYCLE');
  });

  test('rejects a cycle crossing input and constant source graphs', () => {
    const execution = fixtureExecution();
    makeConstant(execution, 'area', 2);
    const width = symbolFor(execution, 'width');
    const area = symbolFor(execution, 'area');
    width.valueTree.nodes = [
      {
        key: 'n1',
        mode: 'SYMBOL',
        symbol: { id: area.id },
        result: { kind: 'number', value: 2 },
      },
    ];
    area.valueTree.nodes = [
      {
        key: 'n3',
        mode: 'SYMBOL',
        symbol: { id: width.id },
        result: { kind: 'number', value: 2 },
      },
    ];
    area.valueTree.result = { kind: 'number', value: 2 };

    const report = verifyValidExecution(execution);

    expect(report.ok).toBe(false);
    expect(report.checks.inputConsistency.status).toBe('failed');
    expect(report.checks.constantConsistency.status).toBe('failed');
    expect(diagnosticCodes(report)).toContain('FORMULA_CYCLE');
  });

  test('rejects a cycle crossing two input source graphs', () => {
    const execution = fixtureExecution();
    makeInput(execution, 'area', 2);
    const width = symbolFor(execution, 'width');
    const area = symbolFor(execution, 'area');
    width.valueTree.nodes = [
      {
        key: 'n1',
        mode: 'SYMBOL',
        symbol: { id: area.id },
        result: { kind: 'number', value: 2 },
      },
    ];
    area.valueTree.nodes = [
      {
        key: 'n3',
        mode: 'SYMBOL',
        symbol: { id: width.id },
        result: { kind: 'number', value: 2 },
      },
    ];
    area.valueTree.result = { kind: 'number', value: 2 };

    const report = verifyValidExecution(execution);

    expect(report.ok).toBe(false);
    expect(report.checks.inputConsistency.counts).toEqual({
      checked: 2,
      passed: 0,
      failed: 2,
    });
    expect(diagnosticCodes(report)).toContain('FORMULA_CYCLE');
  });

  test('accepts an acyclic formula alias while using parsed input authority', () => {
    const execution = fixtureExecution();
    const width = symbolFor(execution, 'width');
    const area = symbolFor(execution, 'area');
    area.valueTree.nodes = [
      {
        key: 'n3',
        mode: 'SYMBOL',
        symbol: { id: width.id },
        result: { kind: 'number', value: 2 },
      },
    ];
    area.valueTree.result = { kind: 'number', value: 2 };
    const observation = required(
      execution.observations.find((item) => item.symbolId === area.id),
      'Missing area observation.',
    );
    observation.value = 2;

    const report = verifyValidExecution(execution);

    expect(report.ok).toBe(true);
    expect(report.checks.inputConsistency.status).toBe('passed');
    expect(report.checks.constantConsistency.status).toBe('not_applicable');
    expect(report.checks.formulaConsistency.status).toBe('passed');
  });

  test('rejects numerically equivalent computed roots for source values', () => {
    for (const kind of ['parameter', 'literal', 'constant']) {
      for (const mode of ['FUNCTION', 'SYMBOL']) {
        const execution = fixtureExecution();
        const width = symbolFor(execution, 'width');
        if (kind === 'constant') {
          makeConstant(execution, 'width', 2);
        } else if (kind === 'literal') {
          const definition = definitionFor(execution, 'width');
          if (definition.kind !== 'input') {
            throw new Error('Expected input definition.');
          }
          definition.givenSource = {
            kind: 'literal',
            value: 2,
            location: definition.definitionLocation,
          };
        }
        if (mode === 'FUNCTION') {
          width.valueTree.nodes = [
            {
              key: 'one',
              mode: 'LITERAL',
              literal: { kind: 'number', value: 1 },
            },
            {
              key: 'n1',
              mode: 'FUNCTION',
              funcSpec: { id: 'fg.add' },
              funcArgs: [{ key: 'one' }, { key: 'one' }],
              result: { kind: 'number', value: 2 },
            },
          ];
        } else {
          makeConstant(execution, 'area', 2);
          const area = symbolFor(execution, 'area');
          area.valueTree.nodes = [
            {
              key: 'n3',
              mode: 'LITERAL',
              literal: { kind: 'number', value: 2 },
              result: { kind: 'number', value: 2 },
            },
          ];
          area.valueTree.result = { kind: 'number', value: 2 };
          width.valueTree.nodes = [
            {
              key: 'n1',
              mode: 'SYMBOL',
              symbol: { id: area.id },
              result: { kind: 'number', value: 2 },
            },
          ];
        }
        const report = verifyValidExecution(execution);
        expect(report.ok).toBe(false);
        const check =
          kind === 'constant' ? 'constantConsistency' : 'inputConsistency';
        expect(report.checks[check].status).toBe('failed');
        expect(report.checks[check].cacheCounts?.failed).toBe(0);
        const diagnostic = required(
          report.diagnostics.find(
            (item) =>
              item.code === 'SOURCE_VALUE_GRAPH_MISMATCH' &&
              item.symbolId === width.id,
          ),
          'Missing source graph shape diagnostic.',
        );
        expect(diagnostic.invocationId).toBe('root');
        expect(diagnostic.location).toEqual(
          definitionFor(execution, 'width').definitionLocation,
        );
        expect(diagnosticCodes(report)).not.toContain('FORMULA_CYCLE');
      }
    }
  });

  test('does not propagate a tampered lowered input literal to formulas', () => {
    const execution = fixtureExecution();
    const width = symbolFor(execution, 'width');
    const root = required(
      width.valueTree.nodes.find((node) => node.key === 'n1'),
      'Missing width root.',
    );
    root.literal = { kind: 'number', value: 999 };
    root.result = { kind: 'number', value: 999 };
    width.valueTree.result = { kind: 'number', value: 999 };

    const report = verifyValidExecution(execution);

    expect(report.checks.inputConsistency.status).toBe('failed');
    expect(report.checks.formulaConsistency.status).toBe('passed');
    expect(diagnosticCodes(report)).not.toContain('FORMULA_MISMATCH');
  });
});
