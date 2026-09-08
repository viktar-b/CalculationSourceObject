import { describe, expect, it } from 'vitest';
import { ComparisonSchema } from '../src/contracts/common.ts';
import {
  compareNumbers,
  evaluateOperation,
  numericPolicy,
  validateNumber,
  validateOperation,
  type NumericResult,
} from '../src/verification/numeric.ts';

function failureCode(result: NumericResult): string | undefined {
  return result.ok ? undefined : result.code;
}

describe('numeric verification policy', () => {
  it('publishes the fixed prototype policy', () => {
    expect(numericPolicy).toEqual({
      absoluteTolerance: 1e-9,
      relativeTolerance: 1e-12,
      numberDomain: 'finite-real-safe-integer',
    });
    expect(Object.isFrozen(numericPolicy)).toBe(true);
  });

  it.each([
    0,
    -0,
    Number.MIN_VALUE,
    0.5,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
  ])('accepts supported value %s without coercion', (value) => {
    const result = validateNumber(value);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.is(result.value, value)).toBe(true);
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite value %s',
    (value) => {
      const result = validateNumber(value);
      expect(failureCode(result)).toBe('NON_FINITE_NUMBER');
      if (!result.ok) {
        expect(result.valueDisplay).toEqual({
          kind: 'python-float',
          text: String(value),
        });
      }
    },
  );

  it.each([9007199254740992, -9007199254740992])(
    'rejects integer-valued number outside the exact range %s',
    (value) => {
      const result = validateNumber(value);
      expect(failureCode(result)).toBe('UNSUPPORTED_NUMERIC_RANGE');
      if (!result.ok) {
        expect(result.valueDisplay).toEqual({
          kind: 'python-int',
          text: String(value),
        });
      }
    },
  );
});

describe('formula operations', () => {
  it('accepts supported unary and binary signatures without a numeric value', () => {
    expect(validateOperation('fg.add', 2)).toEqual({ ok: true });
    expect(validateOperation('fg.sqrt', 1)).toEqual({ ok: true });
  });

  it('rejects an unsupported function before operand validation', () => {
    expect(validateOperation('fg.sin', 1)).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_FUNCTION',
    });
    expect(
      failureCode(evaluateOperation('fg.sin', [Number.POSITIVE_INFINITY])),
    ).toBe('UNSUPPORTED_FUNCTION');
  });

  it('rejects invalid arity before operand validation', () => {
    expect(validateOperation('fg.add', 1)).toMatchObject({
      ok: false,
      code: 'INVALID_FUNCTION_ARITY',
    });
    expect(
      failureCode(evaluateOperation('fg.add', [Number.POSITIVE_INFINITY])),
    ).toBe('INVALID_FUNCTION_ARITY');
  });

  it.each([
    ['fg.add', [2.5, 4], 6.5],
    ['fg.subtract', [2.5, 4], -1.5],
    ['fg.multiply', [-3, 2.5], -7.5],
    ['fg.divide', [7.5, 2.5], 3],
    ['fg.pow', [16, 0.5], 4],
    ['fg.pow', [-8, 3], -512],
    ['fg.pow', [4, -2], 0.0625],
    ['fg.sqrt', [81], 9],
    ['fg.uminus', [2.5], -2.5],
  ] as const)(
    'evaluates %s with real arithmetic',
    (functionId, operands, value) => {
      expect(evaluateOperation(functionId, operands)).toEqual({
        ok: true,
        value,
      });
    },
  );

  it('preserves IEEE signed zero where Python real arithmetic does', () => {
    const squareRoot = evaluateOperation('fg.sqrt', [-0]);
    const oddPower = evaluateOperation('fg.pow', [-0, 3]);
    const negated = evaluateOperation('fg.uminus', [-0]);
    const sum = evaluateOperation('fg.add', [-0, -0]);
    const difference = evaluateOperation('fg.subtract', [-0, 0]);
    const product = evaluateOperation('fg.multiply', [-1, 0]);

    expect(squareRoot.ok && Object.is(squareRoot.value, -0)).toBe(true);
    expect(oddPower.ok && Object.is(oddPower.value, -0)).toBe(true);
    expect(negated.ok && Object.is(negated.value, 0)).toBe(true);
    expect(sum.ok && Object.is(sum.value, -0)).toBe(true);
    expect(difference.ok && Object.is(difference.value, -0)).toBe(true);
    expect(product.ok && Object.is(product.value, -0)).toBe(true);
  });

  it.each([
    ['fg.add', [1]],
    ['fg.subtract', [1, 2, 3]],
    ['fg.multiply', []],
    ['fg.divide', [1]],
    ['fg.pow', [2]],
    ['fg.sqrt', [1, 2]],
    ['fg.uminus', []],
  ] as const)('rejects invalid arity for %s', (functionId, operands) => {
    expect(failureCode(evaluateOperation(functionId, operands))).toBe(
      'INVALID_FUNCTION_ARITY',
    );
  });

  it('rejects functions outside the verified subset', () => {
    expect(failureCode(evaluateOperation('fg.sin', [0]))).toBe(
      'UNSUPPORTED_FUNCTION',
    );
  });

  it.each([
    ['fg.divide', [7, 0], 'DIVISION_BY_ZERO'],
    ['fg.divide', [7, -0], 'DIVISION_BY_ZERO'],
    ['fg.sqrt', [-1], 'NEGATIVE_SQUARE_ROOT'],
    ['fg.pow', [-8, 1 / 3], 'NON_REAL_POWER'],
    ['fg.pow', [0, -1], 'ZERO_NEGATIVE_POWER'],
    ['fg.pow', [-0, -3], 'ZERO_NEGATIVE_POWER'],
  ] as const)(
    'rejects invalid real operation %s',
    (functionId, operands, code) => {
      expect(failureCode(evaluateOperation(functionId, operands))).toBe(code);
    },
  );

  it('rejects invalid operands before evaluating the operation', () => {
    expect(
      failureCode(evaluateOperation('fg.add', [Number.POSITIVE_INFINITY, 1])),
    ).toBe('NON_FINITE_NUMBER');
    expect(
      failureCode(evaluateOperation('fg.multiply', [9007199254740992, 0])),
    ).toBe('UNSUPPORTED_NUMERIC_RANGE');
  });

  it('rejects unsafe exact integer intermediates before cancellation', () => {
    expect(
      failureCode(evaluateOperation('fg.add', [Number.MAX_SAFE_INTEGER, 1])),
    ).toBe('UNSUPPORTED_NUMERIC_RANGE');
    expect(
      failureCode(
        evaluateOperation('fg.subtract', [Number.MIN_SAFE_INTEGER, 1]),
      ),
    ).toBe('UNSUPPORTED_NUMERIC_RANGE');
    expect(
      failureCode(
        evaluateOperation('fg.multiply', [3_000_000_000, 3_000_000_000]),
      ),
    ).toBe('UNSUPPORTED_NUMERIC_RANGE');

    const unsafePower = evaluateOperation('fg.pow', [2, 53]);
    expect(failureCode(unsafePower)).toBe('UNSUPPORTED_NUMERIC_RANGE');
    expect(unsafePower).toMatchObject({
      valueDisplay: { kind: 'python-int', text: '9007199254740992' },
    });

    const boundedLargePower = evaluateOperation('fg.pow', [2, 100]);
    expect(failureCode(boundedLargePower)).toBe('UNSUPPORTED_NUMERIC_RANGE');
    expect(boundedLargePower).toMatchObject({
      valueDisplay: { kind: 'unsupported', text: '2 ** 100' },
    });
  });

  it('accepts exact integer results at the safe boundary', () => {
    expect(
      evaluateOperation('fg.add', [Number.MAX_SAFE_INTEGER - 1, 1]),
    ).toEqual({ ok: true, value: Number.MAX_SAFE_INTEGER });
    expect(
      evaluateOperation('fg.subtract', [Number.MIN_SAFE_INTEGER + 1, 1]),
    ).toEqual({ ok: true, value: Number.MIN_SAFE_INTEGER });
    expect(evaluateOperation('fg.pow', [2, 52])).toEqual({
      ok: true,
      value: 4503599627370496,
    });
  });

  it('rejects non-finite computed results', () => {
    expect(
      failureCode(evaluateOperation('fg.divide', [1, Number.MIN_VALUE])),
    ).toBe('NON_FINITE_NUMBER');
    expect(failureCode(evaluateOperation('fg.pow', [2.5, 1000]))).toBe(
      'NON_FINITE_NUMBER',
    );
  });
});

describe('numeric comparisons', () => {
  it('keeps the actual and expected values in their report roles', () => {
    const result = compareNumbers(999, 8);
    expect(result).toEqual({
      matches: false,
      comparison: {
        actual: 999,
        expected: 8,
        absoluteError: 991,
        absoluteTolerance: 1e-9,
        relativeTolerance: 1e-12,
      },
    });
    expect(ComparisonSchema.parse(result.comparison)).toEqual(
      result.comparison,
    );
  });

  it.each([
    [0, 0, true],
    [0, 1e-9, true],
    [0, 1.000000000000001e-9, false],
    [1e-300, 0, true],
    [-1, 1, false],
    [5_000_000_000_004, 5_000_000_000_000, true],
    [5_000_000_000_006, 5_000_000_000_000, false],
  ] as const)(
    'compares %s with %s using the documented tolerance',
    (actual, expected, matches) => {
      expect(compareNumbers(actual, expected).matches).toBe(matches);
    },
  );
});
