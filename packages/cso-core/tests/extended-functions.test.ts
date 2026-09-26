import { describe, expect, it } from 'vitest';
import {
  evaluateOperation,
  validateOperation,
} from '../src/verification/numeric.ts';

describe('extended numeric functions', () => {
  it.each([
    ['fg.exp', [0], ['int'], 1, 'float'],
    ['fg.log', [8, 2], ['float', 'int'], 3, 'float'],
    ['fg.min', [0, -0, 1], ['int', 'float', 'int'], 0, 'int'],
    ['fg.max', [-0, 0, -1], ['float', 'int', 'int'], -0, 'float'],
    ['fg.round', [2.675, 2], ['float', 'int'], 2.67, 'float'],
    ['fg.round', [-0.1, 0], ['float', 'int'], -0, 'float'],
    ['fg.round', [250, -2], ['int', 'int'], 200, 'int'],
  ] satisfies [
    string,
    number[],
    ('int' | 'float')[],
    number,
    'int' | 'float',
  ][])(
    '%s preserves numeric kinds and signed zero',
    (id, values, kinds, value, numericKind) => {
      expect(evaluateOperation(id, values, kinds)).toEqual({
        ok: true,
        value,
        numericKind,
      });
    },
  );

  it.each([
    ['fg.log', [0], ['int'], 'LOG_DOMAIN_ERROR'],
    ['fg.log', [2, 1], ['int', 'int'], 'DIVISION_BY_ZERO'],
    ['fg.exp', [1000], ['int'], 'NON_FINITE_NUMBER'],
    ['fg.round', [1, 2], ['float', 'float'], 'INVALID_INTEGER_OPERAND'],
    ['fg.round', [1, 0.5], ['float', 'float'], 'INVALID_INTEGER_OPERAND'],
    [
      'fg.round',
      [Number.MAX_SAFE_INTEGER, -16],
      ['int', 'int'],
      'UNSUPPORTED_NUMERIC_RANGE',
    ],
  ] satisfies [string, number[], ('int' | 'float')[], string][])(
    '%s rejects invalid active arguments',
    (id, values, kinds, code) => {
      expect(evaluateOperation(id, values, kinds)).toMatchObject({
        ok: false,
        code,
      });
    },
  );

  it('checks an explicitly floating digit count even with legacy value-kind evidence', () => {
    expect(
      evaluateOperation('fg.round', [2.675, 2], [undefined, 'float']),
    ).toMatchObject({ ok: false, code: 'INVALID_INTEGER_OPERAND' });
    expect(evaluateOperation('fg.round', [-0, 2], ['int', 'int'])).toEqual({
      ok: true,
      value: 0,
      numericKind: 'int',
    });
  });

  it.each([
    ['fg.log', 0],
    ['fg.log', 3],
    ['fg.exp', 2],
    ['fg.min', 1],
    ['fg.max', 0],
    ['fg.round', 3],
    ['fg.and', 0],
    ['fg.and', 1],
    ['fg.or', 0],
    ['fg.or', 1],
  ] satisfies [string, number][])('%s rejects arity %d', (id, count) => {
    expect(validateOperation(id, count)).toMatchObject({
      ok: false,
      code: 'INVALID_FUNCTION_ARITY',
    });
  });
});
