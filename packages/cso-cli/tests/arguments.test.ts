import { describe, expect, test } from 'vitest';
import { parseCliArgs } from '../src/arguments.ts';
import { parseVerifiedArgs } from '../src/verified-arguments.ts';
import { parseDevArgs } from '../src/dev-server.ts';
import { usageReport } from '../src/reports.ts';
import { CommandReportSchema } from '@cs-object/core';

const base = [
  '--source',
  'input with spaces.cso.py',
  '--function',
  'calculate',
  '--out',
  'output with spaces.pdf',
];
describe('development command boundaries', () => {
  test('preserves unlimited defaults and normalizes finite calculation deadlines', () => {
    expect(
      parseVerifiedArgs('verify', ['input.cso.py', '--function', 'calculate'])
        .executionTimeoutMs,
    ).toBeUndefined();
    expect(
      parseDevArgs(['input.cso.py', '--function', 'calculate'])
        .executionTimeoutMs,
    ).toBeUndefined();
    for (const [seconds, milliseconds] of [
      ['0', 0],
      ['-0.0', 0],
      ['0.0001', 1],
      ['1e-3', 1],
      ['1e-400', 1],
      ['2.5', 2500],
      ['2147483.648', 2147483648],
    ] satisfies [string, number][]) {
      expect(
        parseVerifiedArgs('verify', [
          'input.cso.py',
          '--function',
          'calculate',
          '--timeout',
          seconds,
        ]).executionTimeoutMs,
      ).toBe(milliseconds);
      expect(
        parseDevArgs([
          'input.cso.py',
          '--function',
          'calculate',
          '--timeout',
          seconds,
        ]).executionTimeoutMs,
      ).toBe(milliseconds);
    }
    for (const seconds of [
      '-1',
      '-1e-400',
      'NaN',
      'Infinity',
      '1e309',
      '  ',
      '0x10',
    ]) {
      expect(() =>
        parseVerifiedArgs('verify', [
          'input.cso.py',
          '--function',
          'calculate',
          '--timeout',
          seconds,
        ]),
      ).toThrow();
    }
  });
  test('preserves repeated numeric inputs and caller-relative paths', () => {
    const parsed = parseCliArgs([
      ...base,
      '--input',
      'width=2',
      '--input',
      'height=-3.5',
    ]);
    expect(parsed.inputs).toEqual({ width: 2, height: -3.5 });
    expect(parsed.sourcePath).toBe(`${process.cwd()}/input with spaces.cso.py`);
    expect(parsed.outPath).toBe(`${process.cwd()}/output with spaces.pdf`);
  });
  test.each([
    ['--input', 'width=2', '--input', 'width=3'],
    ['--input', 'K=2', '--input', 'K=3'],
    ['--inputs-json', '{"K":2,"K":3}'],
    ['--inputs-json', '{"width":2,"width":3}'],
    ['--inputs-json', '{"width":2,"w\\u0069dth":3}'],
    ['--inputs-json', '{"width":2}', '--input', 'width=3'],
    ['--source', 'another.cso.py'],
    ['--unknown', '2'],
    ['--input'],
    ['--input', 'width=NaN'],
    ['--input', 'width=Infinity'],
    ['--input', 'width=9007199254740993'],
    ['--input', 'width='],
    ['--input', 'width=0x10'],
    ['--input', 'width=  '],
    ['--inputs-json', '{"width":2,}'],
    ['--inputs-json', '[]'],
    ['--inputs-json', '{"width":true}'],
  ])('rejects invalid/ambiguous options %j', (...extra) => {
    expect(() => parseCliArgs([...base, ...extra])).toThrow();
  });
  test('accepts the public Unicode identifier contract for functions and inputs', () => {
    const parsed = parseCliArgs([
      '--source',
      'input.cso.py',
      '--function',
      'π',
      '--out',
      'out.json',
      '--input',
      'π=2',
      '--inputs-json',
      '{"長さ":3}',
    ]);
    expect(parsed.functionName).toBe('π');
    expect(parsed.inputs).toEqual({ π: 2, 長さ: 3 });
  });
  test('distinguishes a command typo from an unavailable command without invented provenance', () => {
    const report = CommandReportSchema.parse(
      usageReport({ kind: 'unknown', command: 'verfiy' }),
    );
    expect(report.command).toBeUndefined();
    expect(report.diagnostics[0]?.code).toBe('UNKNOWN_COMMAND');
    expect(report.diagnostics[0]?.message).toContain('verfiy');
    expect(report.provenance).toEqual({});
  });
  test('normalizes Python compatibility identifiers before forwarding', () => {
    const parsed = parseCliArgs([
      '--source',
      'input.cso.py',
      '--function',
      'K',
      '--out',
      'out.json',
      '--input',
      'K=2',
    ]);
    expect(parsed.functionName).toBe('K');
    expect(parsed.inputs).toEqual({ K: 2 });
  });
  test('retains zero, negative and scientific numeric values', () => {
    expect(
      parseCliArgs([...base, '--inputs-json', '{"width":0,"height":-2e3}'])
        .inputs,
    ).toEqual({ width: 0, height: -2000 });
    expect(parseCliArgs([...base, '--input', '__proto__=2']).inputs).toEqual(
      Object.fromEntries([['__proto__', 2]]),
    );
  });
  test.each(['verify', 'pdf'] as const)(
    'unavailable %s never fabricates verification',
    (command) => {
      const report = CommandReportSchema.parse(
        usageReport({ kind: 'unavailable', command }),
      );
      expect(report.ok).toBe(false);
      expect(report.provenance).toEqual({});
      expect(report.output).toBeUndefined();
      expect(
        Object.values(report.checks).every(
          (check) => check.status === 'not_applicable',
        ),
      ).toBe(true);
    },
  );
});
