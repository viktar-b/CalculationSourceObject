import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExecutionResponseSchema, verifyExecution } from '@cs-object/core';
import { prepareExecutionDocument } from '@cs-object/react';
import { afterAll, beforeAll, expect, test } from 'vitest';

const repoRoot = join(import.meta.dirname, '../..');
const directory = mkdtempSync(join(tmpdir(), 'cso-method-table-'));
const python = join(directory, 'venv', 'bin', 'python');
const cli = join(repoRoot, 'packages/cso-cli/dist/cli.js');

const rectangle = `from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, section, symbol

Width: TypeAlias = Annotated[float, symbol(glyph="w", description="Width", unit="m")]
Height: TypeAlias = Annotated[float, symbol(glyph="h", description="Height", unit="m")]
Allowance: TypeAlias = Annotated[float, symbol(glyph="c", description="Allowance", unit="m")]

@calculation(id="rectangle", title="Rectangle geometry")
@section(id="geometry", title="Rectangle geometry", root=True)
def rectangle(width: Width, height: Height, allowance: Allowance = 0.0) -> CalculationResults:
    area: Annotated[float, symbol(glyph="A", description="Area", unit="m^2")] = width * height
    perimeter: Annotated[float, symbol(glyph="P", description="Perimeter", unit="m")] = 2 * (width + height)
    return {"area": area, "perimeter": perimeter}
`;

const compare = `from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.rectangle import rectangle

@calculation(id="compare", title="Rectangle comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    second_panel = rectangle(width=1.0, height=6.0)
    extra_panel = rectangle(width=4.0, height=5.0)
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={"Case A": first_panel, "Case B": second_panel})
    compared: Annotated[float, symbol(glyph="R", description="Compared area", unit="m^2")] = first_panel["area"]
    return {"compared": compared}
`;

const empty = `from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.rectangle import rectangle

@calculation(id="empty", title="Empty comparison")
@section(id="empty", title="Empty", root=True)
def empty_cases() -> CalculationResults:
    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={})
    ready: Annotated[float, symbol(glyph="r", description="Ready", unit="")] = 1
    return {"ready": ready}
`;

const publication = compare.replace(
  '    extra_panel = rectangle(width=4.0, height=5.0)\n',
  '',
);
const rows = compare.replace(
  'cases={"Case A": first_panel, "Case B": second_panel}',
  'cases={"Case A": first_panel}, cases_axis="rows"',
);

beforeAll(() => {
  const created = spawnSync(
    '/opt/homebrew/bin/python3',
    ['-m', 'venv', join(directory, 'venv')],
    {
      encoding: 'utf8',
    },
  );
  expect(created.status).toBe(0);
  const installed = spawnSync(
    python,
    [
      '-m',
      'pip',
      'install',
      '--no-deps',
      join(repoRoot, 'packages/cso-python'),
    ],
    { encoding: 'utf8' },
  );
  expect(installed.status, installed.stderr).toBe(0);
  writeFileSync(join(directory, 'rectangle.cso.py'), rectangle);
  writeFileSync(join(directory, 'compare.cso.py'), compare);
  writeFileSync(join(directory, 'publish.cso.py'), publication);
  writeFileSync(join(directory, 'empty.cso.py'), empty);
  writeFileSync(join(directory, 'rows.cso.py'), rows);
  const bindings = spawnSync(
    python,
    ['-I', '-m', 'cso_python', 'bindings', directory],
    {
      encoding: 'utf8',
    },
  );
  expect(bindings.status, bindings.stderr).toBe(0);
}, 120_000);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function capture(source: string, name: string) {
  const result = spawnSync(
    python,
    ['-I', '-m', 'cso_python', 'execute', source, '--function', name],
    { cwd: directory, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  expect(result.status, result.stderr).toBe(0);
  const response = ExecutionResponseSchema.parse(JSON.parse(result.stdout));
  if (!response.ok) throw new Error(response.diagnostics[0]?.message);
  return response.execution;
}

function publish(
  command: 'html' | 'pdf',
  source: string,
  name: string,
  output: string,
  extra: string[] = [],
) {
  return spawnSync(
    process.execPath,
    [
      cli,
      command,
      source,
      '--function',
      name,
      '--out',
      output,
      '--format',
      'json',
      ...extra,
    ],
    {
      cwd: directory,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PYTHON: python },
    },
  );
}

test('publishes one straight-line method and bound case columns', async () => {
  const execution = capture('compare.cso.py', 'compare');
  expect(execution.cso.schemaVersion).toBe('1.1.0');
  expect(verifyExecution({ execution }).ok).toBe(true);
  const first = prepareExecutionDocument({ execution, assets: [] });
  const second = prepareExecutionDocument({ execution, assets: [] });
  expect(second).toEqual(first);
  expect(first.documentVersion).toBe('3');
  const root = first.sections[0];
  expect(root?.items.map((item) => item.kind)).toEqual([
    'method',
    'section',
    'table',
    'symbol',
  ]);
  const table = root?.items.find((item) => item.kind === 'table');
  if (table?.kind !== 'table') throw new Error('Missing table');
  const areas = table.groups
    .flatMap((group) => group.rows)
    .find((row) => row.quantity === 'area');
  expect(areas?.cells.map((cell) => cell.value)).toEqual([6, 6]);
  const perimeters = table.groups
    .flatMap((group) => group.rows)
    .find((row) => row.quantity === 'perimeter');
  expect(perimeters?.cells.map((cell) => cell.value)).toEqual([10, 14]);
  expect(
    first.sections.some(
      (section) =>
        section.invocationId === 'root/first_panel' ||
        section.invocationId === 'root/second_panel',
    ),
  ).toBe(false);
  expect(
    first.sections.some(
      (section) => section.invocationId === 'root/extra_panel',
    ),
  ).toBe(true);

  const emptyExecution = capture('empty.cso.py', 'empty_cases');
  expect(emptyExecution.invocations.map((item) => item.function)).toEqual([
    'empty_cases',
  ]);
  const emptyDocument = prepareExecutionDocument({
    execution: emptyExecution,
    assets: [],
  });
  const emptyTable = emptyDocument.sections[0]?.items.find(
    (item) => item.kind === 'table',
  );
  if (emptyTable?.kind !== 'table') throw new Error('Missing empty table');
  expect(emptyTable.emptyState).toBe('No cases evaluated');
  expect(emptyTable.cases).toEqual([]);
  expect(
    emptyDocument.sections[0]?.items.some((item) => item.kind === 'method'),
  ).toBe(true);

  const swapped = structuredClone(execution);
  const areaCells =
    swapped.tables?.[0]?.cells.filter((cell) => cell.quantity === 'area') ?? [];
  const firstSymbol = areaCells[0]?.symbolId;
  const secondSymbol = areaCells[1]?.symbolId;
  if (!areaCells[0] || !areaCells[1] || !firstSymbol || !secondSymbol) {
    throw new Error('Missing area cells');
  }
  areaCells[0].symbolId = secondSymbol;
  areaCells[1].symbolId = firstSymbol;
  expect(
    verifyExecution({ execution: swapped }).diagnostics.some(
      (item) => item.code === 'CELL_BINDING_MISMATCH',
    ),
  ).toBe(true);
  const retargeted = structuredClone(execution);
  const method = retargeted.methods?.[0];
  if (!method) throw new Error('Missing method');
  method.sourceHash = 'a'.repeat(64);
  expect(
    verifyExecution({ execution: retargeted }).diagnostics.some(
      (item) => item.code === 'METHOD_SOURCE_MISMATCH',
    ),
  ).toBe(true);
  const retargetedUnit = structuredClone(execution);
  const widthCell = retargetedUnit.tables?.[0]?.cells.find(
    (cell) => cell.quantity === 'width',
  );
  if (!widthCell) throw new Error('Missing width cell');
  widthCell.unit = 'mm';
  expect(
    verifyExecution({ execution: retargetedUnit }).diagnostics.some(
      (item) => item.code === 'CELL_BINDING_MISMATCH',
    ),
  ).toBe(true);

  const htmlPath = join(directory, 'compare.html');
  const html = publish('html', 'publish.cso.py', 'compare', htmlPath, [
    '--check-layout',
  ]);
  expect(html.status, html.stdout || html.stderr).toBe(0);
  const htmlText = readFileSync(htmlPath, 'utf8');
  expect(htmlText.match(/How rectangle results are calculated/g)).toHaveLength(
    1,
  );
  expect(htmlText).toContain('data-case-heading="Case A"');
  expect(htmlText).toContain('data-case-heading="Case B"');
  expect(htmlText).toContain('(w * h)');

  const sentinelPath = join(directory, 'sentinel.pdf');
  writeFileSync(sentinelPath, Buffer.from('existing-output'));
  const failed = publish('pdf', 'rows.cso.py', 'compare', sentinelPath);
  expect(failed.status).not.toBe(0);
  expect(readFileSync(sentinelPath, 'utf8')).toBe('existing-output');

  const pdfPath = join(directory, 'compare.pdf');
  const pdf = publish('pdf', 'publish.cso.py', 'compare', pdfPath);
  expect(pdf.status, pdf.stdout || pdf.stderr).toBe(0);
  const info = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  expect(info.status, info.stderr).toBe(0);
  expect(info.stdout).toContain('Pages:           1');
  expect(readdirSync(directory).some((name) => name.endsWith('.tmp'))).toBe(
    false,
  );
}, 180_000);
