import { describe, expect, test } from 'vitest';
import type { z } from 'zod';
import {
  CalculationSourceObjectSchema,
  CalculationSourceValueNodeSchema,
  CalculationSourceValueTreeSchema,
} from '../src/calculation-source/object-schema.ts';

const codes = (result: z.ZodSafeParseResult<unknown>) =>
  result.success
    ? []
    : result.error.issues.flatMap((issue) =>
        issue.code === 'custom' ? [issue.params?.diagnosticCode] : [],
      );

const literal = {
  key: 'n1',
  mode: 'LITERAL',
  literal: { kind: 'number', value: 4 },
};

describe('stable graph validation diagnostics', () => {
  test('keeps missing function payload and arguments structurally invalid', () => {
    const result = CalculationSourceValueNodeSchema.safeParse({
      key: 'n2',
      mode: 'FUNCTION',
    });
    expect(result.success).toBe(false);
    expect(codes(result)).toEqual([
      'MISSING_FUNCTION_PAYLOAD',
      'MISSING_FUNCTION_ARGUMENTS',
    ]);
  });

  test('distinguishes missing roots, duplicate nodes and missing operands', () => {
    const duplicate = CalculationSourceValueTreeSchema.safeParse({
      rootKey: 'missing',
      nodes: [literal, literal],
    });
    expect(duplicate.success).toBe(false);
    expect(codes(duplicate)).toEqual([
      'MISSING_FORMULA_ROOT',
      'DUPLICATE_NODE_ID',
      'DUPLICATE_NODE_ID',
    ]);
    const missing = CalculationSourceValueTreeSchema.safeParse({
      rootKey: 'sum',
      nodes: [
        literal,
        {
          key: 'sum',
          mode: 'FUNCTION',
          funcSpec: { id: 'fg.add' },
          funcArgs: [{ key: 'n1' }, { key: 'absent' }],
        },
      ],
    });
    expect(missing.success).toBe(false);
    expect(codes(missing)).toEqual(['MISSING_FORMULA_OPERAND']);
  });

  test('keeps rendering functions outside the numerical subset parseable', () => {
    expect(
      CalculationSourceValueNodeSchema.safeParse({
        key: 'max',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.max' },
        funcArgs: [{ key: 'n1' }, { key: 'n2' }],
      }).success,
    ).toBe(true);
  });

  test('attaches a stable code to an unresolved symbol edge', () => {
    const cso = {
      schemaVersion: '1.0.0',
      title: 'Unresolved reference',
      source: { id: 'synthetic', metadata: {} },
      rootSectionIds: ['root'],
      sections: [
        {
          id: 'root',
          title: 'Calculation',
          items: [
            {
              kind: 'symbol',
              symbol: {
                id: 'output',
                glyph: 'Q_{out}',
                description: 'Output',
                unit: 'm',
                valueTree: {
                  rootKey: 'operand',
                  nodes: [
                    {
                      key: 'operand',
                      mode: 'SYMBOL',
                      symbol: { id: 'missing-symbol' },
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };
    const result = CalculationSourceObjectSchema.safeParse(cso);
    expect(result.success).toBe(false);
    expect(codes(result)).toContain('UNRESOLVED_SYMBOL_REFERENCE');
  });
});
