import { describe, expect, it } from 'vitest';
import { ComparisonSchema } from '../src/contracts/common.ts';
import {
  compareNumbers,
  evaluateOperation,
  validateNumber,
} from '../src/verification/numeric.ts';

describe('numeric verification', () => {
  it('accepts finite floats without coercion and bounds exact integers', () => {
    expect(validateNumber(1e25, 'float')).toMatchObject({
      ok: true,
      value: 1e25,
      numericKind: 'float',
    });
    expect(validateNumber(Number.MAX_SAFE_INTEGER, 'int')).toMatchObject({
      ok: true,
    });
    expect(validateNumber(1e25, 'int')).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_NUMERIC_RANGE',
    });
    expect(validateNumber(1.5, 'int')).toMatchObject({
      ok: false,
      code: 'NUMERIC_KIND_MISMATCH',
    });
    expect(validateNumber(Infinity)).toMatchObject({
      ok: false,
      code: 'NON_FINITE_NUMBER',
    });
    expect(validateNumber(NaN)).toMatchObject({
      ok: false,
      code: 'NON_FINITE_NUMBER',
    });
  });

  it.each([
    ['fg.add', [2.5, 4], 6.5],
    ['fg.subtract', [2.5, 4], -1.5],
    ['fg.multiply', [-3, 2.5], -7.5],
    ['fg.divide', [7.5, 2.5], 3],
    ['fg.pow', [-8, 3], -512],
    ['fg.sqrt', [81], 9],
    ['fg.uminus', [2.5], -2.5],
  ] satisfies [string, number[], number][])(
    '%s evaluates ordinary real arithmetic',
    (id, values, value) => {
      expect(evaluateOperation(id, values)).toEqual({ ok: true, value });
    },
  );

  // One characteristic result per call. The integration suite proves Python
  // capture, verification, MathML and export are wired to these operations.
  it.each([
    ['fg.abs', [-3.5], 3.5, 'float'],
    ['fg.ceil', [1.2], 2, 'int'],
    ['fg.floor', [-1.2], -2, 'int'],
    ['fg.round', [2.5], 2, 'int'],
    ['fg.min', [2, -3, 5], -3, 'float'],
    ['fg.max', [2, -3, 5], 5, 'float'],
    ['fg.exp', [0], 1, 'float'],
    ['fg.log', [8, 2], 3, 'float'],
    ['fg.rad', [180], Math.PI, 'float'],
    ['fg.deg', [Math.PI], 180, 'float'],
    ['fg.sin', [Math.PI / 6], 0.5, 'float'],
    ['fg.cos', [Math.PI / 3], 0.5, 'float'],
    ['fg.tan', [Math.PI / 4], 1, 'float'],
    ['fg.asin', [0.5], Math.PI / 6, 'float'],
    ['fg.acos', [0.5], Math.PI / 3, 'float'],
    ['fg.atan', [1], Math.PI / 4, 'float'],
    ['fg.atan2', [1, -1], (3 * Math.PI) / 4, 'float'],
    ['fg.hypot', [2, 3, 6], 7, 'float'],
    ['fg.sinh', [Math.LN2], 0.75, 'float'],
    ['fg.cosh', [Math.LN2], 1.25, 'float'],
    ['fg.tanh', [Math.LN2], 0.6, 'float'],
    ['fg.pi', [], Math.PI, 'float'],
  ] satisfies [string, number[], number, 'int' | 'float'][])(
    '%s returns the expected value and numeric kind',
    (id, values, expected, numericKind) => {
      const result = evaluateOperation(
        id,
        values,
        values.map(() => 'float'),
      );
      expect(result).toMatchObject({ ok: true, numericKind });
      if (result.ok) expect(result.value).toBeCloseTo(expected, 14);
    },
  );

  it('preserves float signed zero and normalizes explicitly integer zero', () => {
    expect(evaluateOperation('fg.multiply', [0, -1], ['int', 'int'])).toEqual({
      ok: true,
      value: 0,
      numericKind: 'int',
    });
    expect(evaluateOperation('fg.multiply', [0, -1], ['float', 'int'])).toEqual(
      {
        ok: true,
        value: -0,
        numericKind: 'float',
      },
    );
    expect(evaluateOperation('fg.atan2', [-0, -0], ['float', 'float'])).toEqual(
      {
        ok: true,
        value: -Math.PI,
        numericKind: 'float',
      },
    );
    expect(evaluateOperation('fg.atan2', [-0, -0], ['int', 'int'])).toEqual({
      ok: true,
      value: 0,
      numericKind: 'float',
    });
  });

  it('preserves the first equal extremum and its numeric kind', () => {
    expect(
      evaluateOperation('fg.min', [0, -0, 1], ['int', 'float', 'int']),
    ).toEqual({
      ok: true,
      value: 0,
      numericKind: 'int',
    });
    expect(
      evaluateOperation('fg.max', [-0, 0, -1], ['float', 'int', 'int']),
    ).toEqual({
      ok: true,
      value: -0,
      numericKind: 'float',
    });
    expect(
      evaluateOperation('fg.max', [0, 1, NaN], ['int', 'int', 'float']),
    ).toMatchObject({
      ok: false,
      code: 'NON_FINITE_NUMBER',
    });
  });

  it.each([
    [2.675, 2, 'float', 2.67],
    [-0.1, 0, 'float', -0],
    [250, -2, 'int', 200],
  ] satisfies [number, number, 'int' | 'float', number][])(
    'round(%s, %s) follows Python rounding and preserves the result kind',
    (value, digits, numericKind, expected) => {
      expect(
        evaluateOperation('fg.round', [value, digits], [numericKind, 'int']),
      ).toEqual({
        ok: true,
        value: expected,
        numericKind,
      });
    },
  );

  it('keeps hypot stable where squaring would overflow or underflow', () => {
    expect(
      evaluateOperation('fg.hypot', [3e154, 4e154], ['float', 'float']),
    ).toEqual({
      ok: true,
      value: 5e154,
      numericKind: 'float',
    });
    expect(
      evaluateOperation('fg.hypot', [3e-200, 4e-200], ['float', 'float']),
    ).toEqual({
      ok: true,
      value: 5e-200,
      numericKind: 'float',
    });
  });

  it('allows large float intermediates but rejects unsafe integer intermediates', () => {
    expect(
      evaluateOperation('fg.multiply', [1e20, 1e5], ['float', 'int']),
    ).toEqual({
      ok: true,
      value: 1e25,
      numericKind: 'float',
    });
    expect(
      evaluateOperation(
        'fg.multiply',
        [Number.MAX_SAFE_INTEGER, 2],
        ['int', 'int'],
      ),
    ).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_NUMERIC_RANGE',
    });
    expect(evaluateOperation('fg.multiply', [1e20, 1e5])).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_NUMERIC_RANGE',
    });
    expect(evaluateOperation('fg.divide', [6, 2], ['int', 'int'])).toEqual({
      ok: true,
      value: 3,
      numericKind: 'float',
    });
  });

  it.each([
    ['fg.unknown', [Infinity], 'UNSUPPORTED_FUNCTION'],
    ['fg.add', [Infinity], 'INVALID_FUNCTION_ARITY'],
    ['fg.divide', [7, 0], 'DIVISION_BY_ZERO'],
    ['fg.sqrt', [-1], 'NEGATIVE_SQUARE_ROOT'],
    ['fg.pow', [-8, 1 / 3], 'NON_REAL_POWER'],
    ['fg.pow', [0, -1], 'ZERO_NEGATIVE_POWER'],
    ['fg.log', [0], 'LOG_DOMAIN_ERROR'],
    ['fg.asin', [1.0000000000000002], 'TRIG_DOMAIN_ERROR'],
    ['fg.exp', [1000], 'NON_FINITE_NUMBER'],
    ['fg.round', [1, 2], 'INVALID_INTEGER_OPERAND'],
    ['fg.floor', [1e20], 'UNSUPPORTED_NUMERIC_RANGE'],
  ] satisfies [string, number[], string][])(
    '%s rejects invalid arithmetic with %s operands',
    (id, values, code) => {
      expect(
        evaluateOperation(
          id,
          values,
          values.map(() => 'float'),
        ),
      ).toMatchObject({ ok: false, code });
    },
  );
});

describe('numeric comparison evidence', () => {
  it.each([
    [0, 1e-9, true],
    [0, 1.000000000000001e-9, false],
    [5_000_000_000_004, 5_000_000_000_000, true],
    [5_000_000_000_006, 5_000_000_000_000, false],
  ] satisfies [number, number, boolean][])(
    'compares %s with %s at the absolute and relative tolerance boundaries',
    (actual, expected, matches) => {
      expect(compareNumbers(actual, expected).matches).toBe(matches);
    },
  );

  it('retains actual and expected values and produces serializable overflow evidence', () => {
    const ordinary = compareNumbers(999, 8);
    expect(ordinary).toMatchObject({
      matches: false,
      comparison: { actual: 999, expected: 8, absoluteError: 991 },
    });
    const extreme = compareNumbers(Number.MAX_VALUE, -Number.MAX_VALUE);
    expect(extreme.matches).toBe(false);
    expect(extreme.comparison.absoluteError).toBe('overflow');
    expect(
      ComparisonSchema.parse(JSON.parse(JSON.stringify(extreme.comparison))),
    ).toEqual(extreme.comparison);
  });
});
