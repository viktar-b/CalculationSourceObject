import {
  type CalculationSourceSymbol,
  CalculationSourceSymbolSchema,
} from '@cs-object/core';
import { expect, it } from 'vitest';
import { tableCaseQualifier } from '../src/table-case-notation.ts';

const quantity = (
  invocationId: string,
  glyphScope?: string,
): CalculationSourceSymbol =>
  CalculationSourceSymbolSchema.parse({
    id: invocationId,
    glyph: 'u_{ax}',
    valueTree: {
      rootKey: 'value',
      nodes: [
        {
          key: 'value',
          mode: 'LITERAL',
          literal: { kind: 'number', value: 1 },
        },
      ],
    },
    metadata: {
      invocationId,
      ...(glyphScope === undefined ? {} : { glyphScope }),
    },
  });

it('uses captured scopes for nested cases instead of the display heading', () => {
  const symbols = [
    quantity('root/outer_frame/case_alpha', 'outer_frame,case_alpha'),
  ];
  expect(tableCaseQualifier('root/outer_frame/case_alpha', symbols)).toBe(
    'of,ca',
  );
});

it('retains the case prefix for an output forwarded from a nested helper', () => {
  const symbols = [
    quantity('root/case_alpha/inner_response', 'case_alpha,inner_response'),
  ];
  expect(tableCaseQualifier('root/case_alpha', symbols)).toBe('ca');
});

it('does not borrow a qualifier from a shared caller or a similarly named case', () => {
  const symbols = [
    quantity('root/parent_case', 'parent_case'),
    quantity('root/case_alpha_extra', 'case_alpha_extra'),
  ];
  expect(tableCaseQualifier('root/case_alpha', symbols)).toBeUndefined();
});

it('does not invent a suffix for unqualified or older quantities', () => {
  expect(
    tableCaseQualifier('root/case_alpha', [quantity('root/case_alpha')]),
  ).toBeUndefined();
});
