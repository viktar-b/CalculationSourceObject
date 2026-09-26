import { describe, expect, it } from 'vitest';
import {
  evaluateOperation,
  validateOperation,
} from '../src/verification/numeric.ts';

describe('extended numeric functions', () => {
  it.each([
    ['fg.abs', [-3], ['int'], 3, 'int'],
    ['fg.abs', [-3.5], ['float'], 3.5, 'float'],
    ['fg.abs', [-0], ['float'], 0, 'float'],
    ['fg.abs', [-Number.MAX_VALUE], ['float'], Number.MAX_VALUE, 'float'],
    ['fg.atan2', [1, 1], ['int', 'int'], Math.PI / 4, 'float'],
    ['fg.exp', [0], ['int'], 1, 'float'],
    ['fg.floor', [-1.2], ['float'], -2, 'int'],
    ['fg.floor', [-0], ['float'], 0, 'int'],
    [
      'fg.floor',
      [Number.MAX_SAFE_INTEGER],
      ['float'],
      Number.MAX_SAFE_INTEGER,
      'int',
    ],
    [
      'fg.floor',
      [-Number.MAX_SAFE_INTEGER],
      ['float'],
      -Number.MAX_SAFE_INTEGER,
      'int',
    ],
    ['fg.log', [8, 2], ['float', 'int'], 3, 'float'],
    ['fg.hypot', [], [], 0, 'float'],
    ['fg.hypot', [-0], ['float'], 0, 'float'],
    ['fg.hypot', [0, -0, 0], ['int', 'float', 'int'], 0, 'float'],
    ['fg.hypot', [3, 4], ['int', 'int'], 5, 'float'],
    ['fg.hypot', [2, 3, 6], ['int', 'int', 'int'], 7, 'float'],
    [
      'fg.hypot',
      [1, 2, 2, 4, 12],
      ['int', 'int', 'int', 'int', 'int'],
      13,
      'float',
    ],
    ['fg.hypot', [3e154, 4e154], ['float', 'float'], 5e154, 'float'],
    [
      'fg.hypot',
      [1e308, 3e307, 4e307],
      ['float', 'float', 'float'],
      1.118033988749895e308,
      'float',
    ],
    [
      'fg.hypot',
      [4e307, 1e308, 3e307],
      ['float', 'float', 'float'],
      1.118033988749895e308,
      'float',
    ],
    ['fg.hypot', [3e-200, 4e-200], ['float', 'float'], 5e-200, 'float'],
    ['fg.hypot', [5e-324, 5e-324], ['float', 'float'], 5e-324, 'float'],
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
    ['omitted', undefined],
    ['complete', Array.from({ length: 150_000 }, () => 'float' as const)],
  ] as const)(
    'retains subnormal precision across hypot chunks with %s kind evidence',
    (_, numericKinds) => {
      const values = Array.from({ length: 150_000 }, () => Number.MIN_VALUE);

      expect(evaluateOperation('fg.hypot', values, numericKinds)).toEqual({
        ok: true,
        value: Math.sqrt(values.length) * Number.MIN_VALUE,
        numericKind: 'float',
      });
    },
  );

  it('agrees with Python for mixed magnitudes across hypot chunk boundaries', () => {
    const expected = 1.118033988749895e308;
    const first = Array.from({ length: 2_050 }, () => 0);
    first[0] = 1e308;
    first[1_024] = 3e307;
    first[2_049] = 4e307;
    const permuted = [...first].reverse();

    for (const values of [first, permuted]) {
      expect(
        evaluateOperation(
          'fg.hypot',
          values,
          values.map(() => 'float'),
        ),
      ).toEqual({ ok: true, value: expected, numericKind: 'float' });
    }
  });

  it.each([
    [[1, 1], Math.PI / 4],
    [[1, -1], (3 * Math.PI) / 4],
    [[-1, -1], (-3 * Math.PI) / 4],
    [[-1, 1], -Math.PI / 4],
    [[1, 0], Math.PI / 2],
    [[-1, 0], -Math.PI / 2],
    [[0, 1], 0],
    [[0, -1], Math.PI],
  ] satisfies [number[], number][])(
    'atan2(%j) selects the expected quadrant',
    (values, expected) => {
      expect(evaluateOperation('fg.atan2', values, ['int', 'int'])).toEqual({
        ok: true,
        value: expected,
        numericKind: 'float',
      });
    },
  );

  it.each([
    [undefined, -Math.PI],
    [[], -Math.PI],
    [[undefined, undefined], -Math.PI],
    [['int', undefined], Math.PI],
    [['int'], Math.PI],
    [[undefined, 'int'], -0],
    [['int', 'int'], 0],
    [['int', 'float'], Math.PI],
    [['float', 'int'], -0],
    [['float', 'float'], -Math.PI],
  ] satisfies [readonly ('int' | 'float' | undefined)[] | undefined, number][])(
    'atan2 normalizes only explicitly integer zeros with kinds %j',
    (kinds, expected) => {
      expect(evaluateOperation('fg.atan2', [-0, -0], kinds)).toEqual({
        ok: true,
        value: expected,
        numericKind: 'float',
      });
    },
  );

  it.each([
    ['fg.sin', [-0], ['int'], 0, 'float'],
    ['fg.atan', [-0], ['int'], 0, 'float'],
    ['fg.sqrt', [-0], ['int'], 0, 'float'],
    ['fg.sin', [-0], ['float'], -0, 'float'],
    ['fg.atan', [-0], [undefined], -0, 'float'],
    ['fg.multiply', [-0, -1], ['int', 'float'], -0, 'float'],
    ['fg.divide', [-0, 1], ['int', undefined], 0, undefined],
    ['fg.divide', [-0, 1], ['float', undefined], -0, undefined],
    ['fg.min', [-0, -0], ['int', undefined], 0, undefined],
    ['fg.max', [-0, -0], ['int', undefined], 0, undefined],
    ['fg.min', [-0, -0], [undefined, 'int'], -0, undefined],
    ['fg.max', [-0, -0], [undefined, 'int'], -0, undefined],
  ] satisfies [
    string,
    number[],
    ('int' | 'float' | undefined)[],
    number,
    'int' | 'float' | undefined,
  ][])(
    '%s applies known integer zero normalization before dispatch',
    (id, values, kinds, value, numericKind) => {
      expect(evaluateOperation(id, values, kinds)).toEqual({
        ok: true,
        value,
        ...(numericKind === undefined ? {} : { numericKind }),
      });
    },
  );

  it.each([
    [
      'fg.floor',
      [Number.MAX_SAFE_INTEGER + 1],
      ['float'],
      'UNSUPPORTED_NUMERIC_RANGE',
    ],
    ['fg.floor', [Number.MAX_VALUE], ['float'], 'UNSUPPORTED_NUMERIC_RANGE'],
    [
      'fg.hypot',
      [Number.MAX_VALUE, Number.MAX_VALUE],
      ['float', 'float'],
      'NON_FINITE_NUMBER',
    ],
    [
      'fg.atan2',
      [Number.POSITIVE_INFINITY, 0],
      ['float', 'int'],
      'NON_FINITE_NUMBER',
    ],
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
    ['fg.abs', 0],
    ['fg.abs', 2],
    ['fg.floor', 0],
    ['fg.floor', 2],
    ['fg.atan2', 0],
    ['fg.atan2', 1],
    ['fg.atan2', 3],
    ['fg.atan2', 6],
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
