import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { parseDevArgs, parseDevInputs } from '../src/dev-server.ts';
import { runPythonExecution } from '../src/execution.ts';

const definition = {
  inputs: [
    {
      name: 'width',
      numericType: 'float',
      glyph: 'w_{test}',
      description: 'Width',
      unit: 'm',
      default: 2,
    },
    {
      name: 'count',
      numericType: 'int',
      glyph: 'n_{test}',
      description: 'Count',
      unit: '',
      default: 1,
    },
  ],
} satisfies Parameters<typeof parseDevInputs>[1];

test('fixes source and function at startup and accepts an assigned port', () => {
  expect(
    parseDevArgs(['report.cso.py', '--function', 'calculate', '--port', '0']),
  ).toMatchObject({ functionName: 'calculate', port: 0 });
  expect(() => parseDevArgs(['report.cso.py', '--function', 'ͺ'])).toThrow();
  for (const extra of [
    ['--host', '0.0.0.0'],
    ['--port', '-1'],
    ['--port', '65536'],
    ['--port', '0', '--port', '1'],
  ]) {
    expect(() =>
      parseDevArgs(['report.cso.py', '--function', 'calculate', ...extra]),
    ).toThrow();
  }
});

test('accepts supplied numbers, defaults, negative zero and wide finite floats', () => {
  expect(
    parseDevInputs('{"inputs":{"width":1e20,"count":3}}', definition),
  ).toEqual({ width: 1e20, count: 3 });
  expect(parseDevInputs('{"inputs":{}}', definition)).toEqual({});
  expect(
    Object.is(parseDevInputs('{"inputs":{"count":-0}}', definition).count, 0),
  ).toBe(true);
  for (const token of ['1.0', '1e0', '-0.0'])
    expect(() =>
      parseDevInputs('{"inputs":{"count":' + token + '}}', definition),
    ).toThrow('integer token');
  expect(
    Object.is(
      parseDevInputs('{"inputs":{"width":-0.0}}', definition).width,
      -0,
    ),
  ).toBe(true);
});

test.each([
  '{"width":4}',
  '{"inputs":{},"source":"other.py"}',
  '{"inputs":[]}',
  '{"inputs":{"other":4}}',
  '{"inputs":{"width":true}}',
  '{"inputs":{"width":null}}',
  '{"inputs":{"width":1e999}}',
  '{"inputs":{"width":9007199254740993}}',
  '{"inputs":{"count":1e20}}',
  '{"inputs":{"count":2.5}}',
  '{"inputs":{"width":2,"\\u0077idth":3}}',
  '{"inputs":{},"inputs":{}}',
])('rejects invalid or ambiguous request %s', (body) => {
  expect(() => parseDevInputs(body, definition)).toThrow();
});

test('requires every parameter without a default', () => {
  expect(() =>
    parseDevInputs('{"inputs":{}}', {
      inputs: [
        {
          name: 'depth',
          numericType: 'float',
          glyph: 'd_{test}',
          description: 'Depth',
          unit: 'm',
        },
      ],
    }),
  ).toThrow('Missing input depth');
});

test.skipIf(process.platform === 'win32')(
  'terminates a Python adapter process at its requested deadline',
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'cso-process-deadline-'));
    const executable = join(directory, 'blocked-python');
    writeFileSync(
      executable,
      '#!/usr/bin/env node\nsetInterval(() => {}, 60000);\n',
      { mode: 0o755 },
    );
    const previous = process.env.PYTHON;
    try {
      process.env.PYTHON = executable;
      const result = runPythonExecution(
        {
          command: 'verify',
          sourcePath: 'unused.cso.py',
          functionName: 'calculate',
          inputs: {},
        },
        100,
      );
      expect(result.kind).toBe('failed');
      if (result.kind !== 'failed')
        throw new Error('Expected a process deadline failure');
      expect(result.diagnostics).toMatchObject([
        {
          code: 'PYTHON_PROCESS_FAILED',
          message: expect.stringContaining('ETIMEDOUT'),
        },
      ]);
    } finally {
      if (previous === undefined) delete process.env.PYTHON;
      else process.env.PYTHON = previous;
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
