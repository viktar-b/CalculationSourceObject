import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { ExecutionResponseSchema, verifyExecution } from '@cs-object/core';
import { prepareExecutionDocument } from '@cs-object/react';
import { afterAll, beforeAll, expect, it } from 'vitest';

let directory: string;
const python = process.env.PYTHON ?? 'python3';
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'cso-section-composition-'));
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
  {
    name: 'compare_hot_formed',
    depth: 1056,
    formulas: 78,
    unreturned: 'm_m',
    selection: 'mass_per_metre_length',
    axis: 'columns',
  },
  {
    name: 'compare_tapered',
    depth: 100,
    formulas: 184,
    unreturned: 'Z_x',
    selection: 'plastic_section_modulus_about_x_axis',
    axis: 'rows',
  },
])(
  'preserves reused calculations and forwarding in $name',
  ({ name, depth, formulas, unreturned, selection, axis }) => {
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
    expect(response.protocolVersion).toBe('3');
    const execution = response.execution;
    expect(execution.cso.schemaVersion).toBe('1.1.0');
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
    expect(document.documentVersion).toBe('3');
    const items = document.sections.flatMap((section) => section.items);
    const methodItem = items.find((item) => item.kind === 'method');
    const tableItem = items.find((item) => item.kind === 'table');
    expect(methodItem?.kind).toBe('method');
    expect(tableItem?.kind).toBe('table');
    if (methodItem?.kind !== 'method' || tableItem?.kind !== 'table') return;
    expect(tableItem.casesAxis).toBe(axis);
    expect(
      methodItem.quantities.some(
        (quantity) => quantity.selectionName === selection,
      ),
    ).toBe(true);
    expect(execution.tables?.[0]?.cells).toHaveLength(6);
    expect(
      new Set(execution.tables?.[0]?.cells.map((cell) => cell.caseInvocationId)),
    ).toEqual(new Set(['root/baseline_section', 'root/candidate_section']));
    for (const invocation of ['baseline_section', 'candidate_section']) {
      expect(execution.observations.map((observation) => observation.symbolId)).toContain(
        JSON.stringify(['symbol', `root/${invocation}`, unreturned]),
      );
    }
    const sourceSymbols = [
      ...execution.cso.sections.flatMap((section) => section.items),
      ...(execution.cso.detachedItems ?? []),
    ].flatMap((item) => (item.kind === 'symbol' ? [item.symbol.glyph] : []));
    expect(sourceSymbols.some((glyph) => glyph.includes('bs'))).toBe(true);
    expect(sourceSymbols.some((glyph) => glyph.includes('cs'))).toBe(true);
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
