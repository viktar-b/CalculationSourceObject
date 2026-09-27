import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { ExecutionResponseSchema, verifyExecution } from '@cs-object/core';
import { prepareExecutionDocument } from '@cs-object/react';
import { afterAll, beforeAll, expect, it } from 'vitest';

const directory = mkdtempSync(join(tmpdir(), 'cso-section-composition-'));
const python = process.env.PYTHON ?? 'python3';
beforeAll(() => {
  cpSync(
    new URL('../../examples/section-properties/', import.meta.url),
    directory,
    {
      recursive: true,
      filter: (path) =>
        !['_cso_bindings', '__pycache__'].includes(basename(path)),
    },
  );
  execFileSync(python, ['-I', '-m', 'cso_python', 'bindings', directory]);
  execFileSync(python, [
    '-I',
    '-m',
    'cso_python',
    'bindings',
    directory,
    '--check',
  ]);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

it.each([
  { name: 'compare_hot_formed', depth: 1056, formulas: 78, unreturned: 'm_m' },
  { name: 'compare_tapered', depth: 100, formulas: 184, unreturned: 'Z_x' },
])(
  'preserves reused calculations and forwarding in $name',
  ({ name, depth, formulas, unreturned }) => {
    const response = ExecutionResponseSchema.parse(
      JSON.parse(
        execFileSync(
          python,
          [
            '-I',
            '-m',
            'cso_python',
            'execute',
            join(directory, 'compare.cso.py'),
            '--function',
            name,
            '--input',
            `candidate_depth=${depth}`,
          ],
          { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
        ),
      ),
    );
    if (!response.ok) throw new Error(JSON.stringify(response.diagnostics));
    const execution = response.execution;
    const report = verifyExecution({ execution });
    expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
    expect(execution.invocations.map((invocation) => invocation.id)).toEqual([
      'root',
      'root/baseline_section',
      'root/candidate_section',
      'root/property_ratios',
    ]);
    const outputs = new Map(
      execution.authoring?.outputs.map((output) => [output.name, output.value]),
    );
    expect(outputs.get('area_ratio')).toBe(1);
    expect(outputs.get('inertia_ratio')).toBe(1);
    expect(outputs.get('baseline_area')).toBe(outputs.get('candidate_area'));
    expect(
      execution.observations.filter(
        (observation) => observation.kind === 'formula',
      ),
    ).toHaveLength(formulas);
    const parameters = execution.authoring?.parameters.filter(
      (parameter) => parameter.invocationId === 'root/property_ratios',
    );
    expect(parameters).toHaveLength(4);
    expect(
      parameters?.every((parameter) => parameter.origin.kind === 'output'),
    ).toBe(true);
    const document = prepareExecutionDocument({ execution, assets: [] });
    const symbols = document.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.kind === 'symbol' ? [item.symbol] : [],
      ),
    );
    expect(symbols).toHaveLength(execution.observations.length);
    expect(new Set(symbols.map((symbol) => symbol.id))).toEqual(
      new Set(
        execution.observations.map((observation) => observation.symbolId),
      ),
    );
    for (const invocation of ['baseline_section', 'candidate_section']) {
      expect(symbols.map((symbol) => symbol.id)).toContain(
        JSON.stringify(['symbol', `root/${invocation}`, unreturned]),
      );
    }
    expect(symbols.some((symbol) => symbol.glyph.includes('bs'))).toBe(true);
    expect(symbols.some((symbol) => symbol.glyph.includes('cs'))).toBe(true);
  },
);

it('imports a generated parent from an external working directory', () => {
  const result = execFileSync(
    python,
    [
      '-c',
      [
        'from _cso_bindings.compare import compare_hot_formed, compare_tapered',
        'for calculation, depth in [(compare_hot_formed, 1056), (compare_tapered, 100)]:',
        '    result = calculation(candidate_depth=depth)',
        '    assert result["area_ratio"] == result["inertia_ratio"] == 1',
        'print("passed")',
      ].join('\n'),
    ],
    { cwd: directory, encoding: 'utf8' },
  );
  expect(result.trim()).toBe('passed');
});
