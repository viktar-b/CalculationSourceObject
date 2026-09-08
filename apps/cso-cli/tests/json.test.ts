import { expect, test } from 'vitest';
import { stringifyJson } from '../src/json.ts';

test('preserves nested negative zero without changing keys or string content', () => {
  const data = Object.fromEntries([
    ['x', -0],
    ['__proto__', [-0, 0, '-0.0', { value: -0 }]],
    ['quote"\\\n', 'literal -0.0 and "x":0'],
  ]);
  const parsed: unknown = JSON.parse(stringifyJson(data));
  expect(parsed).toEqual(data);
  expect(stringifyJson({ x: -0 })).toBe('{"x":-0.0}');
});

test('retains ordinary JSON escaping and optional field omission', () => {
  const shared = { value: 2.5e-30 };
  const data = {
    shared,
    again: shared,
    missing: undefined,
    values: [undefined, null, false, '長さ', Number.MAX_SAFE_INTEGER],
  };
  expect(stringifyJson(data)).toBe(JSON.stringify(data));
});

test('rejects cycles and non-JSON class instances', () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  expect(() => stringifyJson(cyclic)).toThrow('cyclic JSON');
  expect(() => stringifyJson(new Date())).toThrow('plain JSON object');
});
