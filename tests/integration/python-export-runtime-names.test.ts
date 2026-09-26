import { execFileSync } from 'node:child_process';
import { createPythonFromValueTreeJson } from '@cs-object/core';
import { expect, test } from 'vitest';
import { z } from 'zod';

const python = process.env.PYTHON ?? 'python3';

const collisionDocument = {
  title: 'Runtime name collisions',
  sections: [
    {
      symbols: [
        {
          id: 'math-value',
          result: 11,
          valueTree: [{ key: 'value', literal: 11 }],
        },
        {
          id: 'math',
          result: -1.2,
          valueTree: [{ key: 'value', literal: -1.2 }],
        },
        {
          id: 'math-glyph',
          glyphPlaintext: 'math',
          result: 13,
          valueTree: [{ key: 'value', literal: 13 }],
        },
        {
          id: 'abs-value',
          result: 12,
          valueTree: [{ key: 'value', literal: 12 }],
        },
        {
          id: 'abs',
          result: -3.5,
          valueTree: [{ key: 'value', literal: -3.5 }],
        },
        {
          id: 'min',
          result: 5,
          valueTree: [{ key: 'value', literal: 5 }],
        },
        {
          id: 'max',
          result: 2,
          valueTree: [{ key: 'value', literal: 2 }],
        },
        {
          id: 'round',
          result: 2.675,
          valueTree: [{ key: 'value', literal: 2.675 }],
        },
        {
          id: 'floor-output',
          result: -2,
          valueTree: [
            { key: 'root', function: 'fg.floor', arguments: ['input'] },
            { key: 'input', symbol: 'math' },
          ],
        },
        {
          id: 'abs-output',
          result: 3.5,
          valueTree: [
            { key: 'root', function: 'fg.abs', arguments: ['input'] },
            { key: 'input', symbol: 'abs' },
          ],
        },
        {
          id: 'min-output',
          result: 2,
          valueTree: [
            {
              key: 'root',
              function: 'fg.min',
              arguments: ['left', 'right'],
            },
            { key: 'left', symbol: 'min' },
            { key: 'right', symbol: 'max' },
          ],
        },
        {
          id: 'max-output',
          result: 5,
          valueTree: [
            {
              key: 'root',
              function: 'fg.max',
              arguments: ['left', 'right'],
            },
            { key: 'left', symbol: 'min' },
            { key: 'right', symbol: 'max' },
          ],
        },
        {
          id: 'round-output',
          result: 2.67,
          valueTree: [
            {
              key: 'root',
              function: 'fg.round',
              arguments: ['input', 'digits'],
            },
            { key: 'input', symbol: 'round' },
            { key: 'digits', literal: 2 },
          ],
        },
      ],
    },
  ],
};

const executeExport = (functionName: string) => {
  const code = createPythonFromValueTreeJson(collisionDocument, {
    id: 'runtime-name-collisions',
    label: 'Runtime name collisions',
    functionName,
  });
  const emittedFunctionName = `${functionName}_value`;
  const result = z
    .record(z.string(), z.number())
    .parse(
      JSON.parse(
        execFileSync(
          python,
          [
            '-I',
            '-c',
            `${code}\nimport json\nprint(json.dumps(${emittedFunctionName}()))`,
          ],
          { encoding: 'utf8' },
        ),
      ),
    );
  return { code, result };
};

test('runtime names and their existing suffixed forms remain executable and preserve output IDs', () => {
  const { code, result } = executeExport('math');

  expect(code).toContain('def math_value() -> dict[str, object]:');
  expect(code).toContain('math_value = 11');
  expect(code).toContain('math_value_2 = -1.2');
  expect(code).toContain('math_value_3 = 13');
  expect(code).toContain('abs_value = 12');
  expect(code).toContain('abs_value_2 = -3.5');
  expect(code).toContain('floor_output = math.floor(math_value_2)');
  expect(code).toContain('abs_output = abs(abs_value_2)');
  expect(code).toContain('min_output = min(min_value, max_value)');
  expect(code).toContain('max_output = max(min_value, max_value)');
  expect(code).toContain('round_output = round(round_value, 2)');
  expect(result).toEqual({
    math: -1.2,
    'math-value': 11,
    'math-glyph': 13,
    abs: -3.5,
    'abs-value': 12,
    min: 5,
    max: 2,
    round: 2.675,
    'floor-output': -2,
    'abs-output': 3.5,
    'min-output': 2,
    'max-output': 5,
    'round-output': 2.67,
  });
});

test.each(['math', 'abs', 'min', 'max', 'round'])(
  'custom function name %s cannot shadow an exporter runtime dependency',
  (functionName) => {
    const { code, result } = executeExport(functionName);

    expect(code).toContain(`def ${functionName}_value() -> dict[str, object]:`);
    expect(result['floor-output']).toBe(-2);
    expect(result['abs-output']).toBe(3.5);
    expect(result['min-output']).toBe(2);
    expect(result['max-output']).toBe(5);
    expect(result['round-output']).toBe(2.67);
  },
);
