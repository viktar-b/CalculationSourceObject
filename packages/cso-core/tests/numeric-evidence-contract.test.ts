import { describe, expect, it } from 'vitest';
import { CalculationSourceLiteralSchema } from '../src/calculation-source/object-schema.ts';
import {
  ExecutionBindingSchema,
  ProvenanceSchema,
  ResolvedInputsSchema,
  executionBindingKey,
} from '../src/contracts/common.ts';
import { ReferenceFileSchema } from '../src/contracts/reference.ts';
import { SheetLiteralSchema } from '../src/sheet-model/schema.ts';

const binding = {
  entryModuleId: 'quantity.cso.py',
  entrySourceHash: 'a'.repeat(64),
  sourceClosureHash: 'b'.repeat(64),
  function: 'calculate',
  resolvedInputs: { quantity: 2 },
};

describe('numeric evidence at public contract seams', () => {
  it.each([
    { name: 'calculation-source', schema: CalculationSourceLiteralSchema },
    { name: 'sheet-model', schema: SheetLiteralSchema },
  ])(
    '$name validates numeric kinds on literals and cached results',
    ({ schema }) => {
      for (const literal of [
        { kind: 'number', value: 1.5, numericKind: 'int' },
        { kind: 'number', value: 1e20, numericKind: 'int' },
        { kind: 'number', value: 1e20 },
      ]) {
        expect(schema.safeParse(literal).success).toBe(false);
      }
      expect(
        schema.parse({ kind: 'number', value: 1e20, numericKind: 'float' }),
      ).toEqual({ kind: 'number', value: 1e20, numericKind: 'float' });
      expect(schema.safeParse({ kind: 'number', value: 2 }).success).toBe(true);
    },
  );

  it('rejects rounded untyped reference inputs before reference matching', () => {
    const roundedInput = JSON.parse('{"quantity":9007199254740993}');
    expect(roundedInput.quantity).toBe(9007199254740992);
    const reference = {
      referenceVersion: '1',
      cases: [
        {
          id: 'quantity',
          revision: '1',
          basis: {
            method: 'Arithmetic',
            derivation: 'q / q = 1',
            sourceDescription: 'Synthetic case',
          },
          binding: { ...binding, resolvedInputs: roundedInput },
          expected: [],
        },
      ],
    };
    expect(ReferenceFileSchema.safeParse(reference).success).toBe(false);
    expect(ResolvedInputsSchema.safeParse(roundedInput).success).toBe(false);
  });

  it('retains large float evidence through JSON and independent bindings', () => {
    const evidence = {
      resolvedInputs: { quantity: 1e20 },
      resolvedInputKinds: { quantity: 'float' },
    };
    const typed = JSON.parse(JSON.stringify({ ...binding, ...evidence }));
    expect(ExecutionBindingSchema.parse(typed)).toEqual(typed);
    expect(ProvenanceSchema.parse(evidence)).toEqual(evidence);
    expect(
      ExecutionBindingSchema.safeParse({
        ...binding,
        resolvedInputs: evidence.resolvedInputs,
      }).success,
    ).toBe(false);
    expect(
      ProvenanceSchema.safeParse({ resolvedInputs: evidence.resolvedInputs })
        .success,
    ).toBe(false);
  });

  it('rejects invalid or orphaned kind evidence', () => {
    for (const evidence of [
      {
        resolvedInputs: { quantity: 1.5 },
        resolvedInputKinds: { quantity: 'int' },
      },
      {
        resolvedInputs: { quantity: 1e20 },
        resolvedInputKinds: { quantity: 'int' },
      },
      { resolvedInputs: { quantity: 1e20 }, resolvedInputKinds: {} },
      {
        resolvedInputs: { quantity: 2 },
        resolvedInputKinds: { missing: 'float' },
      },
    ]) {
      expect(
        ExecutionBindingSchema.safeParse({ ...binding, ...evidence }).success,
      ).toBe(false);
    }
    expect(
      ProvenanceSchema.safeParse({ resolvedInputKinds: { quantity: 'float' } })
        .success,
    ).toBe(false);
  });

  it('keeps numeric identity independent of kind while preserving signed zero', () => {
    const legacy = ExecutionBindingSchema.parse(binding);
    for (const numericKind of ['int', 'float']) {
      const typed = ExecutionBindingSchema.parse({
        ...binding,
        resolvedInputKinds: { quantity: numericKind },
      });
      expect(executionBindingKey(typed)).toBe(executionBindingKey(legacy));
    }
    const negative = ExecutionBindingSchema.parse({
      ...binding,
      resolvedInputs: { quantity: -0 },
      resolvedInputKinds: { quantity: 'float' },
    });
    expect(Object.is(negative.resolvedInputs.quantity, -0)).toBe(true);
    expect(executionBindingKey(negative)).not.toBe(
      executionBindingKey({ ...negative, resolvedInputs: { quantity: 0 } }),
    );
  });

  it('preserves prototype-looking parameter names in both maps', () => {
    const evidence = JSON.parse(
      '{"resolvedInputs":{"__proto__":1e20,"constructor":2},"resolvedInputKinds":{"__proto__":"float","constructor":"int"}}',
    );
    expect(ExecutionBindingSchema.parse({ ...binding, ...evidence })).toEqual({
      ...binding,
      ...evidence,
    });
  });
});
