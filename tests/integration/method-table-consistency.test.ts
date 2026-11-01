import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ExecutionResponseSchema,
  PreparedDocumentSchema,
  verifyExecution,
} from '@cs-object/core';
import {
  PreparedFormulaSheet,
  prepareExecutionDocument,
} from '@cs-object/react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { writeExternalMethodProject } from './fixtures/method-external-project.ts';

const directory = mkdtempSync(join(tmpdir(), 'cso-method-consistency-'));
const python =
  process.env.PYTHON ??
  join(
    import.meta.dirname,
    '../../.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
const leaf = `from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, check, document_section, section, symbol
Width: TypeAlias = Annotated[float, symbol(glyph="w_{rect}", description="Width", unit="m")]
Height: TypeAlias = Annotated[float, symbol(glyph="h_{rect}", description="Height", unit="m")]
@calculation(id="rectangle", title="Rectangle")
@section(id="rectangle", title="Rectangle", metadata={"assumptions": ["Rectangle sides are perpendicular."], "references": ["Rectangle reference."]})
def rectangle(width: Width, height: Height) -> CalculationResults:
    with document_section(id="area", title="Area", metadata={"limitations": ["Area is geometric only."]}):
        area: Annotated[float, symbol(glyph="A_{rect}", description="Area", unit="m^2")] = width * height
    chosen: Annotated[float, symbol(glyph="l_{max}", description="Longer side", unit="m")] = width if width > height else height
    check(id="area-limit", targets=("area",), explanation="Area must not exceed four square metres.", predicate=area <= 4)
    return {"area": area, "chosen": chosen}
`;
const wrapper = `from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, section, symbol
from _cso_bindings.leaf import rectangle
Width: TypeAlias = Annotated[float, symbol(glyph="w_{pair}", description="Width", unit="m")]
Height: TypeAlias = Annotated[float, symbol(glyph="h_{pair}", description="Height", unit="m")]
@calculation(id="pair", title="Two rectangles")
@section(id="pair", title="Two rectangles", metadata={"assumptions": ["Both rectangles use the same dimensions."]})
def pair(width: Width, height: Height) -> CalculationResults:
    first = rectangle(width=width, height=height)
    second = rectangle(width=height, height=width)
    return {"area": first["area"], "chosen": second["chosen"]}
`;
function source(target: 'leaf' | 'wrapper', axis = 'columns', empty = false) {
  return `from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.${target} import ${target === 'leaf' ? 'rectangle' : 'pair'} as calculate
@calculation(id="compare", title="Compare rectangles")
@section(id="compare", title="Compare rectangles", root=True)
def compare() -> CalculationResults:
    method(id="method", calculation=calculate, title="Rectangle method")
${empty ? '' : '    first = calculate(width=2.0, height=3.0)\n    second = calculate(width=3.0, height=1.0)\n'}    table(id="results", method="method", title="Comparison", cases=${empty ? '{}' : '{"First": first, "Second": second}'}, inputs=(), outputs=(), cases_axis="${axis}")
    ready: Annotated[float, symbol(glyph="r_{ready}", description="Ready", unit="")] = 1
    return {"ready": ready}
`;
}
beforeAll(() => {
  writeFileSync(join(directory, 'leaf.cso.py'), leaf);
  writeFileSync(join(directory, 'wrapper.cso.py'), wrapper);
  writeFileSync(
    join(directory, 'diamond.cso.py'),
    wrapper
      .replace(
        'from _cso_bindings.leaf import rectangle',
        'from _cso_bindings.leaf import rectangle\nfrom _cso_bindings.wrapper import pair',
      )
      .replace('def pair(', 'def combined(')
      .replace('first = rectangle(', 'first = pair('),
  );
  writeFileSync(
    join(directory, 'diamond_compare.cso.py'),
    source('wrapper').replace(
      'from _cso_bindings.wrapper import pair',
      'from _cso_bindings.diamond import combined',
    ),
  );
  writeFileSync(
    join(directory, 'negative.cso.py'),
    wrapper.replace(
      'second = rectangle(width=height, height=width)',
      'second = rectangle(width=-2.0, height=-3.0)',
    ),
  );
  writeFileSync(
    join(directory, 'negative_compare.cso.py'),
    source('wrapper').replace(
      '_cso_bindings.wrapper',
      '_cso_bindings.negative',
    ),
  );
  for (const target of ['leaf', 'wrapper'] as const) {
    for (const axis of ['columns', 'rows']) {
      writeFileSync(
        join(directory, `${target}_${axis}.cso.py`),
        source(target, axis),
      );
    }
  }
  writeFileSync(
    join(directory, 'empty.cso.py'),
    source('wrapper', 'columns', true),
  );
  writeFileSync(
    join(directory, 'equal.cso.py'),
    source('leaf')
      .replace('height=3.0', 'height=2.0')
      .replace('width=3.0, height=1.0', 'width=2.0, height=2.0'),
  );
  writeFileSync(
    join(directory, 'qualified.cso.py'),
    leaf
      .replace('calculation, check,', 'calculation, applicable, check,')
      .replace(
        'width if width > height else height',
        'width if abs(width) > abs(height) else height',
      )
      .replace('predicate=area <= 4', 'predicate=abs(area) <= 4')
      .replace(
        '    return {"area": area',
        '    applicable(id="area-limit", targets=("area",), explanation="Width limit", predicate=abs(width) < 100)\n    return {"area": area',
      ),
  );
  writeFileSync(
    join(directory, 'qualified_compare.cso.py'),
    source('leaf').replace('_cso_bindings.leaf', '_cso_bindings.qualified'),
  );
  const result = spawnSync(
    python,
    ['-I', '-m', 'cso_python', 'bindings', directory],
    { encoding: 'utf8' },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
function capture(file: string) {
  const result = spawnSync(
    python,
    [
      '-I',
      '-m',
      'cso_python',
      'execute',
      join(directory, file),
      '--function',
      'compare',
      '--supported-execution-protocol',
      '4',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  const response = ExecutionResponseSchema.parse(JSON.parse(result.stdout));
  if (!response.ok) throw new Error(response.diagnostics[0]?.message);
  expect(verifyExecution({ execution: response.execution }).ok).toBe(true);
  return response.execution;
}

test('rejects a changed method formula even when the chosen numbers coincide', () => {
  const execution = capture('equal.cso.py');
  const method = execution.methods?.[0];
  if (!method) throw new Error('Missing method');
  const area = method.quantities.find(
    (quantity) => quantity.variableName === 'area',
  );
  const multiply = area?.nodes.find(
    (node) => node.funcSpec?.id === 'fg.multiply',
  );
  if (!multiply?.funcSpec) throw new Error('Missing multiplication');
  multiply.funcSpec.id = 'fg.add';
  const report = verifyExecution({ execution });
  expect(report.ok).toBe(false);
  expect(
    report.diagnostics.some((item) => item.code === 'METHOD_FORMULA_MISMATCH'),
  ).toBe(true);
  expect(() => prepareExecutionDocument({ execution, assets: [] })).toThrow();
});

test('rejects altered nested formulas and equal-valued forwarded output identities', () => {
  const captured = capture('wrapper_columns.cso.py');
  for (const mutation of [
    'formula',
    'forwarded-output',
    'call-input',
  ] as const) {
    const execution = structuredClone(captured);
    const method = execution.methods?.[0];
    if (!method) throw new Error('Missing method');
    if (mutation === 'formula') {
      const node = method.helpers[0]?.quantities.find(
        (quantity) => quantity.variableName === 'area',
      )?.nodes[0];
      if (!node?.funcSpec) throw new Error('Missing helper formula');
      node.funcSpec.id = 'fg.add';
    } else if (mutation === 'forwarded-output') {
      const node = method.quantities.find(
        (quantity) => quantity.selectionName === 'area',
      )?.nodes[0];
      if (!node?.ref) throw new Error('Missing forwarded output');
      node.ref.call = 'second';
    } else {
      const call = method.content.find(
        (item) => item.kind === 'call' && item.binding === 'first',
      );
      if (call?.kind !== 'call' || !call.inputs[0]?.nodes[0]?.ref)
        throw new Error('Missing call');
      call.inputs[0].nodes[0].ref.name = 'height';
    }
    expect(verifyExecution({ execution }).ok, mutation).toBe(false);
  }
});

test('preserves negative literal call arguments and rejects altered constants or operand order', () => {
  capture('negative_compare.cso.py');
  const captured = capture('leaf_columns.cso.py');
  for (const mutation of ['literal', 'operand-order'] as const) {
    const execution = structuredClone(captured);
    const quantity = execution.methods?.[0]?.quantities.find(
      (item) => item.variableName === 'chosen',
    );
    if (!quantity) throw new Error('Missing conditional');
    if (mutation === 'literal') {
      const node = quantity.nodes.find((item) => item.mode === 'SYMBOL');
      if (!node) throw new Error('Missing operand');
      node.mode = 'LITERAL';
      node.literal = { kind: 'number', value: 2, numericKind: 'float' };
      delete node.ref;
    } else {
      const node = quantity.nodes.find((item) => item.funcSpec?.id === 'fg.gt');
      if (!node?.funcArgs) throw new Error('Missing comparison');
      node.funcArgs.reverse();
    }
    expect(verifyExecution({ execution }).ok, mutation).toBe(false);
  }
});

test('explains a dependency shared by direct and nested calls once while keeping every outcome', () => {
  const execution = capture('diamond_compare.cso.py');
  const document = prepareExecutionDocument({ execution, assets: [] });
  const html = renderToStaticMarkup(
    createElement(PreparedFormulaSheet, { document }),
  );
  expect(html.match(/data-helper="rectangle"/g)).toHaveLength(1);
  const table = document.sections
    .flatMap((section) => section.items)
    .find((item) => item.kind === 'table');
  if (table?.kind !== 'table') throw new Error('Missing table');
  expect(
    table.engineeringChecks?.flatMap((check) => check.results),
  ).toHaveLength(6);
  expect(table.branchNotes).toHaveLength(6);
  expect(html).toContain('First / first / first');
  expect(html).toContain('First / second');
});

test('preserves method and helper context and visible outcomes with hidden quantities in both orientations', () => {
  for (const target of ['leaf', 'wrapper']) {
    for (const axis of ['columns', 'rows']) {
      const execution = capture(`${target}_${axis}.cso.py`);
      const document = prepareExecutionDocument({ execution, assets: [] });
      const html = renderToStaticMarkup(
        createElement(PreparedFormulaSheet, { document }),
      );
      for (const context of [
        'Rectangle sides are perpendicular.',
        'Rectangle reference.',
        'Area is geometric only.',
      ])
        expect(html).toContain(context);
      const table = document.sections
        .flatMap((section) => section.items)
        .find((item) => item.kind === 'table');
      if (table?.kind !== 'table') throw new Error('Missing table');
      const results = table.engineeringChecks?.flatMap(
        (check) => check.results,
      );
      expect(results?.map((item) => item.value).sort()).toEqual(
        target === 'wrapper' ? [false, false, true, true] : [false, true],
      );
      expect(table.branchNotes).toHaveLength(target === 'wrapper' ? 4 : 2);
      expect(html).toMatch(/First[^<]*.*Fail\./);
      expect(html).toMatch(/Second[^<]*.*Pass\./);
      if (target === 'wrapper') {
        expect(html).toContain('Both rectangles use the same dimensions.');
        expect(html).toContain('First / first');
        expect(html).toContain('First / second');
        const tampered = structuredClone(document);
        const method = tampered.sections
          .flatMap((section) => section.items)
          .find((item) => item.kind === 'method');
        if (method?.kind !== 'method') throw new Error('Missing method');
        const context = method.helpers[0]?.context?.[0];
        if (!context) throw new Error('Missing helper context');
        context.path = '/sourceMetadata/missing';
        expect(PreparedDocumentSchema.safeParse(tampered).success).toBe(false);
      }
    }
  }
});

test('keeps source context and validates method structure without evaluating an empty table', () => {
  const execution = capture('empty.cso.py');
  expect(execution.invocations).toHaveLength(1);
  const document = prepareExecutionDocument({ execution, assets: [] });
  const html = renderToStaticMarkup(
    createElement(PreparedFormulaSheet, { document }),
  );
  expect(html).toContain('Rectangle sides are perpendicular.');
  expect(html).toContain('No cases evaluated');
  const node = execution.methods?.[0]?.helpers[0]?.quantities.find(
    (quantity) => quantity.variableName === 'area',
  )?.nodes[0];
  if (!node?.funcArgs) throw new Error('Missing method formula');
  node.funcArgs[0] = { key: 'missing' };
  expect(verifyExecution({ execution }).ok).toBe(false);
});

test('numeric helpers preserve qualifications and same-name conditions retain distinct formulas', () => {
  const execution = capture('qualified_compare.cso.py');
  expect(execution.checkOutcomes?.map((item) => item.value)).toEqual([
    false,
    true,
  ]);
  expect(execution.applicabilityOutcomes?.map((item) => item.value)).toEqual([
    true,
    true,
  ]);
  const document = prepareExecutionDocument({ execution, assets: [] });
  const method = document.sections
    .flatMap((section) => section.items)
    .find((item) => item.kind === 'method');
  if (method?.kind !== 'method') throw new Error('Missing method');
  const conditions = method.content.filter(
    (item) => item.kind === 'check' || item.kind === 'applicability',
  );
  expect(new Set(conditions.map((item) => item.predicateSymbolId)).size).toBe(
    2,
  );
  const html = renderToStaticMarkup(
    createElement(PreparedFormulaSheet, { document }),
  );
  expect(html).toContain('Width limit');
});

test('binds opaque external method leaves by exact declaration and call identity', () => {
  writeExternalMethodProject(directory, 'columns');
  const generated = spawnSync(
    python,
    ['-I', '-m', 'cso_python', 'bindings', directory],
    { encoding: 'utf8' },
  );
  expect(generated.status, generated.stdout + generated.stderr).toBe(0);
  const execution = capture('external_compare.cso.py');
  const changed = structuredClone(execution);
  const leaf = changed.methods?.[0]?.content.find(
    (item) => item.kind === 'external',
  );
  if (!leaf || leaf.kind !== 'external')
    throw new Error('Missing static external leaf');
  leaf.declaration.fingerprint = 'a'.repeat(64);
  const report = verifyExecution({ execution: changed });
  expect(report.ok).toBe(false);
  expect(
    report.diagnostics.some(
      (diagnostic) => diagnostic.code === 'METHOD_FORMULA_MISMATCH',
    ),
  ).toBe(true);
  const omitted = structuredClone(execution);
  const method = omitted.methods?.[0];
  if (!method) throw new Error('Missing method');
  method.content = method.content.filter((item) => item.kind !== 'external');
  expect(verifyExecution({ execution: omitted }).ok).toBe(false);
});
