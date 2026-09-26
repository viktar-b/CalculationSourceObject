import { describe, expect, it } from 'vitest';
import { evaluateOperation } from '../src/verification/numeric.ts';

const identities = [
  ['fg.rad', 180, Math.PI],
  ['fg.rad', 720, 4 * Math.PI],
  ['fg.deg', Math.PI, 180],
  ['fg.sin', Math.PI / 6, 0.5],
  ['fg.cos', Math.PI / 3, 0.5],
  ['fg.tan', Math.PI / 4, 1],
  ['fg.asin', 0.5, Math.PI / 6],
  ['fg.acos', 0.5, Math.PI / 3],
  ['fg.atan', 1, Math.PI / 4],
  ['fg.sinh', Math.LN2, 0.75],
  ['fg.cosh', Math.LN2, 1.25],
  ['fg.tanh', Math.LN2, 0.6],
  ['fg.asin', -1, -Math.PI / 2],
  ['fg.asin', 1, Math.PI / 2],
  ['fg.acos', -1, Math.PI],
  ['fg.acos', 1, 0],
  ['fg.cos', 0, 1],
  ['fg.cosh', 0, 1],
] as const;

describe('trigonometry', () => {
  it.each(identities)(
    '%s(%s) agrees with an analytic identity',
    (id, input, expected) => {
      for (const kinds of [undefined, ['float'] as const]) {
        const result = evaluateOperation(id, [input], kinds);
        expect(result).toMatchObject({ ok: true, numericKind: 'float' });
        if (result.ok) expect(result.value).toBeCloseTo(expected, 14);
      }
    },
  );

  it.each([
    'fg.sin',
    'fg.tan',
    'fg.asin',
    'fg.atan',
    'fg.sinh',
    'fg.tanh',
    'fg.rad',
    'fg.deg',
  ])(
    '%s preserves negative zero for float input and returns float for integer input',
    (id) => {
      expect(evaluateOperation(id, [-0], ['float'])).toEqual({
        ok: true,
        value: -0,
        numericKind: 'float',
      });
      expect(evaluateOperation(id, [0], ['int'])).toEqual({
        ok: true,
        value: 0,
        numericKind: 'float',
      });
    },
  );

  it.each(['fg.asin', 'fg.acos'])(
    '%s rejects values outside the closed unit interval',
    (id) => {
      for (const value of [-1.0000000000000002, 1.0000000000000002, -2, 2]) {
        expect(evaluateOperation(id, [value], ['float'])).toMatchObject({
          ok: false,
          code: 'TRIG_DOMAIN_ERROR',
        });
      }
    },
  );

  it.each([
    ['fg.sinh', 711],
    ['fg.sinh', -711],
    ['fg.cosh', 711],
    ['fg.deg', 1e308],
  ] as const)('%s rejects a non-finite result', (id, input) => {
    expect(evaluateOperation(id, [input], ['float'])).toMatchObject({
      ok: false,
      code: 'NON_FINITE_NUMBER',
    });
  });

  it.each([
    ['fg.sinh', 710],
    ['fg.cosh', -710],
    ['fg.rad', 1e308],
    ['fg.sin', 1e308],
    ['fg.cos', 1e308],
    ['fg.tan', 1e308],
    ['fg.tanh', -1e308],
  ] as const)(
    '%s accepts finite float inputs and results beyond the safe integer range',
    (id, input) => {
      const result = evaluateOperation(id, [input], ['float']);
      expect(result).toMatchObject({ ok: true, numericKind: 'float' });
      if (result.ok) expect(Number.isFinite(result.value)).toBe(true);
      expect(evaluateOperation(id, [1e308], ['int'])).toMatchObject({
        ok: false,
        code: 'UNSUPPORTED_NUMERIC_RANGE',
      });
    },
  );

  it.each([...new Set(identities.map(([id]) => id))])(
    '%s validates arity and input finiteness',
    (id) => {
      for (const args of [[], [0, 1]]) {
        expect(evaluateOperation(id, args)).toMatchObject({
          ok: false,
          code: 'INVALID_FUNCTION_ARITY',
        });
      }
      for (const value of [Infinity, -Infinity, NaN]) {
        expect(evaluateOperation(id, [value], ['float'])).toMatchObject({
          ok: false,
          code: 'NON_FINITE_NUMBER',
        });
      }
    },
  );
});
