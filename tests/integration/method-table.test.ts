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
import {
  deriveApplicability,
  ExecutionResponseSchema,
  verifyExecution,
} from '@cs-object/core';
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
const invalidAxis = compare.replace(
  'cases={"Case A": first_panel, "Case B": second_panel}',
  'cases={"Case A": first_panel}, cases_axis="diagonal"',
);
const rowPublication = publication.replace(
  'cases={"Case A": first_panel, "Case B": second_panel}',
  'cases={"Case A": first_panel, "Case B": second_panel}, cases_axis="rows"',
);

const route = `from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, section, symbol

Width: TypeAlias = Annotated[float, symbol(glyph="w", description="Width", unit="m")]
Height: TypeAlias = Annotated[float, symbol(glyph="h", description="Height", unit="m")]

@calculation(id="route", title="Route")
@section(id="route-section", title="Route", root=True)
def route(width: Width, height: Height) -> CalculationResults:
    chosen: Annotated[float, symbol(glyph="c", description="Chosen", unit="m")] = width if width > height else height
    guarded: Annotated[float, symbol(glyph="g", description="Guarded", unit="m")] = width if width > 0 else 1 / width
    return {"chosen": chosen, "guarded": guarded}
`;

const branchCompare = `from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.route import route

@calculation(id="compare", title="Route comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="route-method", calculation=route, title="How the route is calculated")
    narrow = route(width=4, height=1)
    wide = route(width=1, height=4)
    spare = route(width=2, height=2)
    table(id="route-results", method="route-method", title="Route comparison", cases={"Narrow": narrow, "Wide": wide}, cases_axis="rows")
    compared: Annotated[float, symbol(glyph="R", description="Compared", unit="m")] = narrow["chosen"]
    return {"compared": compared}
`;

const checkedRectangle = rectangle
  .replace(
    'from cso_python import CalculationResults, calculation, section, symbol',
    'from cso_python import CalculationResults, calculation, check, section, symbol',
  )
  .replace(
    '    return {"area": area, "perimeter": perimeter}',
    `    check(id="area-limit", targets=("area",), explanation="Area exceeds 20 square metres.", predicate=area <= 20)
    check(id="perimeter-limit", targets=("perimeter",), explanation="Perimeter stays under 100 metres.", predicate=perimeter < 100)
    return {"area": area, "perimeter": perimeter}`,
  );

const checkedCompare = `from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.checked import rectangle

@calculation(id="compare", title="Checked comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="rectangle-method", calculation=rectangle, title="How rectangle results are calculated")
    first_panel = rectangle(width=2.0, height=3.0)
    second_panel = rectangle(width=8.0, height=3.0)
    extra_panel = rectangle(width=4.0, height=6.0)
    table(id="rectangle-results", method="rectangle-method", title="Rectangle comparison", cases={"Case A": first_panel, "Case B": second_panel}, cases_axis="rows")
    compared: Annotated[float, symbol(glyph="R", description="Compared area", unit="m^2")] = first_panel["area"]
    return {"compared": compared}
`;

const checkedHidden = checkedCompare.replace(
  'cases={"Case A": first_panel, "Case B": second_panel}, cases_axis="rows"',
  'cases={"Case A": first_panel, "Case B": second_panel}, outputs=(), cases_axis="rows"',
);

const box = `from typing import Annotated, TypeAlias
from cso_python import CalculationResults, applicable, calculation, check, section, symbol

Width: TypeAlias = Annotated[float, symbol(glyph="w", description="Width", unit="m")]
Height: TypeAlias = Annotated[float, symbol(glyph="h", description="Height", unit="m")]
Depth: TypeAlias = Annotated[float, symbol(glyph="d", description="Depth", unit="m")]

@calculation(id="box", title="Box volume")
@section(id="box-section", title="Box", root=True)
def box(width: Width, height: Height, depth: Depth) -> CalculationResults:
    area: Annotated[float, symbol(glyph="A", description="Area", unit="m^2")] = width * height
    volume: Annotated[float, symbol(glyph="V", description="Volume", unit="m^3")] = area * depth
    applicable(id="area-limit", targets=("area",), explanation="Area exceeds the method limit.", predicate=area <= 20)
    applicable(id="second-limit", targets=("area",), explanation="Area also exceeds the second limit.", predicate=area <= 10)
    applicable(id="passing-limit", targets=("area",), explanation="This passing condition does not clear the others.", predicate=area > 0)
    check(id="volume-check", targets=("volume",), explanation="Volume exceeds 100 cubic metres.", predicate=volume <= 100)
    chosen: Annotated[float, symbol(glyph="s", description="Chosen side", unit="m")] = width if width > 0 else area
    guard: Annotated[float, symbol(glyph="g", description="Guard", unit="")] = 1 if width > 0 and area > 10 else 0
    return {"area": area, "volume": volume, "chosen": chosen, "guard": guard}
`;

const limitCompare = `from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.box import box

@calculation(id="compare", title="Box comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="box-method", calculation=box, title="How box results are calculated")
    first_panel = box(width=2.0, height=3.0, depth=2.0)
    second_panel = box(width=8.0, height=3.0, depth=2.0)
    extra_panel = box(width=-8.0, height=-3.0, depth=2.0)
    table(id="box-results", method="box-method", title="Box comparison", cases={"Case A": first_panel, "Case B": second_panel}, cases_axis="rows")
    compared: Annotated[float, symbol(glyph="R", description="Compared volume", unit="m^3")] = first_panel["volume"]
    return {"compared": compared}
`;

const limitHidden = limitCompare.replace(
  'cases={"Case A": first_panel, "Case B": second_panel}, cases_axis="rows"',
  'cases={"Case A": first_panel, "Case B": second_panel}, outputs=(), cases_axis="rows"',
);

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const margin = `from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, section, symbol, text

Length: TypeAlias = Annotated[float, symbol(glyph="L", description="Length", unit="m")]

@calculation(id="margin", title="Add a margin")
@section(id="margin-section", title="Margin")
def margin(length: Length) -> CalculationResults:
    """Add one metre of margin."""
    text(id="assumption", content="The margin is one metre.")
    grown: Annotated[float, symbol(glyph="G", description="Grown length", unit="m")] = length + 1.0
    return {"grown": grown}
`;

const panel = `from typing import Annotated, TypeAlias
from cso_python import CalculationResults, calculation, document_section, figure, section, symbol, text
from _cso_bindings.margin import margin

Width: TypeAlias = Annotated[float, symbol(glyph="w", description="Width", unit="m")]
Height: TypeAlias = Annotated[float, symbol(glyph="h", description="Height", unit="m")]

@calculation(id="panel", title="Panel area")
@section(id="panel-section", title="Panel")
def panel(width: Width, height: Height) -> CalculationResults:
    """Grow each side, then multiply."""
    with document_section(id="assumptions", title="Assumptions"):
        text(id="note", content="Panel sides are grown independently.")
    figure(id="sketch", path="sketch.png", media_type="image/png", caption="Panel sketch", alt="A rectangle")
    wider = margin(length=width)
    taller = margin(length=height)
    product: Annotated[float, symbol(glyph="Q", description="Grown product", unit="m^2")] = wider["grown"] * taller["grown"]
    area: Annotated[float, symbol(glyph="A", description="Area", unit="m^2")] = product
    return {"area": area}
`;

const panelCompare = `from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table, text
from _cso_bindings.panel import panel

@calculation(id="compare", title="Panel comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="panel-method", calculation=panel, title="How panel area is calculated")
    text(id="case-a", content="Case A is the narrow panel")
    first_panel = panel(width=2.0, height=3.0)
    text(id="case-b", content="Case B is the wide panel")
    second_panel = panel(width=1.0, height=6.0)
    table(id="panel-results", method="panel-method", title="Panel comparison", cases={"Case A": first_panel, "Case B": second_panel}, inputs=(), outputs=("area",))
    compared: Annotated[float, symbol(glyph="R", description="Compared area", unit="m^2")] = first_panel["area"]
    return {"compared": compared}
`;

const limitedMargin = margin
  .replace(
    'from cso_python import CalculationResults, calculation, section, symbol, text',
    'from cso_python import CalculationResults, applicable, calculation, section, symbol, text',
  )
  .replace(
    '    text(id="assumption", content="The margin is one metre.")',
    `    applicable(id="length-limit", targets=("length",), explanation="Length exceeds the margin limit.", predicate=length <= 5)
    text(id="assumption", content="The margin is one metre.")`,
  );

const limitedPanel = panel.replace(
  'from _cso_bindings.margin import margin',
  'from _cso_bindings.limited_margin import margin',
);

const limitedCompare = `from typing import Annotated
from cso_python import CalculationResults, calculation, method, section, symbol, table
from _cso_bindings.limited_panel import panel

@calculation(id="compare", title="Limited panel comparison")
@section(id="comparison", title="Comparison", root=True)
def compare() -> CalculationResults:
    method(id="panel-method", calculation=panel, title="How panel area is calculated")
    narrow = panel(width=2.0, height=3.0)
    wide = panel(width=8.0, height=3.0)
    table(id="panel-results", method="panel-method", title="Panel comparison", cases={"Narrow": narrow, "Wide": wide}, cases_axis="rows", inputs=(), outputs=("area",))
    compared: Annotated[float, symbol(glyph="R", description="Compared area", unit="m^2")] = narrow["area"]
    return {"compared": compared}
`;

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
  writeFileSync(join(directory, 'invalid_axis.cso.py'), invalidAxis);
  writeFileSync(join(directory, 'rows_publish.cso.py'), rowPublication);
  writeFileSync(join(directory, 'sketch.png'), png);
  writeFileSync(join(directory, 'margin.cso.py'), margin);
  writeFileSync(join(directory, 'panel.cso.py'), panel);
  writeFileSync(join(directory, 'panel_compare.cso.py'), panelCompare);
  writeFileSync(join(directory, 'panel_publish.cso.py'), panelCompare);
  writeFileSync(join(directory, 'route.cso.py'), route);
  writeFileSync(join(directory, 'branch_compare.cso.py'), branchCompare);
  writeFileSync(join(directory, 'checked.cso.py'), checkedRectangle);
  writeFileSync(join(directory, 'checked_compare.cso.py'), checkedCompare);
  writeFileSync(join(directory, 'checked_hidden.cso.py'), checkedHidden);
  writeFileSync(join(directory, 'box.cso.py'), box);
  writeFileSync(join(directory, 'limit_compare.cso.py'), limitCompare);
  writeFileSync(join(directory, 'limit_hidden.cso.py'), limitHidden);
  writeFileSync(join(directory, 'limited_margin.cso.py'), limitedMargin);
  writeFileSync(join(directory, 'limited_panel.cso.py'), limitedPanel);
  writeFileSync(join(directory, 'limited_compare.cso.py'), limitedCompare);
  const wideRectangle = rectangle
    .replace(
      'from cso_python import CalculationResults, calculation, section, symbol',
      'from cso_python import CalculationResults, applicable, calculation, check, section, symbol',
    )
    .replace(
      'return {"area": area, "perimeter": perimeter}',
      `applicable(id="area-limit", targets=("area",), explanation="Area exceeds the method limit.", predicate=area <= 10)
    check(id="perimeter-check", targets=("perimeter",), explanation="Perimeter exceeds twelve metres.", predicate=perimeter <= 12)
    return {"area": area, "perimeter": perimeter}`,
    );
  writeFileSync(join(directory, 'wide_checked.cso.py'), wideRectangle);
  const wideCompare = compare
    .replace(
      'from _cso_bindings.rectangle import rectangle',
      'from _cso_bindings.wide_checked import rectangle',
    )
    .replace(
      'cases={"Case A": first_panel, "Case B": second_panel}',
      'cases={"Case A north": first_panel, "Case B south": second_panel, "Case C east": extra_panel}, column_cap=1',
    );
  const wideRows = wideCompare.replace(
    'column_cap=1)',
    'column_cap=1, cases_axis="rows")',
  );
  writeFileSync(join(directory, 'wide_compare.cso.py'), wideCompare);
  writeFileSync(join(directory, 'wide_rows.cso.py'), wideRows);
  writeFileSync(
    join(directory, 'wide_glyph.cso.py'),
    rectangle.replace('glyph="w"', `glyph="${'W'.repeat(180)}"`),
  );
  writeFileSync(
    join(directory, 'unfit_compare.cso.py'),
    compare.replace(
      'from _cso_bindings.rectangle import rectangle',
      'from _cso_bindings.wide_glyph import rectangle',
    ),
  );
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
  const failed = publish('pdf', 'invalid_axis.cso.py', 'compare', sentinelPath);
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

  const rowExecution = capture('rows_publish.cso.py', 'compare');
  expect(rowExecution.tables?.[0]?.casesAxis).toBe('rows');
  expect(rowExecution.tables?.[0]?.cells).toHaveLength(10);
  expect(verifyExecution({ execution: rowExecution }).ok).toBe(true);
  const rowDocument = prepareExecutionDocument({
    execution: rowExecution,
    assets: [],
  });
  const rowTable = rowDocument.sections[0]?.items.find(
    (item) => item.kind === 'table',
  );
  if (rowTable?.kind !== 'table') throw new Error('Missing row table');
  expect(rowTable.casesAxis).toBe('rows');
  expect(
    rowTable.groups.flatMap((group) =>
      group.rows.flatMap((row) => row.cells.map((cell) => cell.value)),
    ),
  ).toEqual([2, 1, 3, 6, 0, 0, 6, 6, 10, 14]);
  const rowHtmlPath = join(directory, 'rows.html');
  const rowHtml = publish(
    'html',
    'rows_publish.cso.py',
    'compare',
    rowHtmlPath,
    ['--check-layout'],
  );
  expect(rowHtml.status, rowHtml.stdout || rowHtml.stderr).toBe(0);
  const rowHtmlText = readFileSync(rowHtmlPath, 'utf8');
  expect(rowHtmlText).toContain('data-cases-axis="rows"');
  expect(rowHtmlText).toContain(
    'scope="row" data-comparison-label="" data-case-heading="Case A"',
  );
  expect(rowHtmlText).toContain('scope="col" data-quantity="area"');
  const rowPdfPath = join(directory, 'rows.pdf');
  const rowPdf = publish('pdf', 'rows_publish.cso.py', 'compare', rowPdfPath);
  expect(rowPdf.status, rowPdf.stdout || rowPdf.stderr).toBe(0);
  const rowInfo = spawnSync('pdfinfo', [rowPdfPath], { encoding: 'utf8' });
  expect(rowInfo.status, rowInfo.stderr).toBe(0);
  expect(rowInfo.stdout).toContain('Pages:           1');
}, 180_000);

test('publishes nested helper explanations without pruning authored context', async () => {
  const execution = capture('panel_compare.cso.py', 'compare');
  expect(verifyExecution({ execution }).ok).toBe(true);
  const assets = execution.assets.map((asset) => ({
    asset,
    dataUrl: `data:${asset.mediaType};base64,${png.toString('base64')}`,
  }));
  const first = prepareExecutionDocument({ execution, assets });
  const second = prepareExecutionDocument({ execution, assets });
  expect(second).toEqual(first);
  const method = first.sections[0]?.items.find(
    (item) => item.kind === 'method',
  );
  if (method?.kind !== 'method') throw new Error('Missing method');
  expect(method.helpers).toHaveLength(1);
  expect(method.helpers[0]?.function).toBe('margin');
  expect(
    method.content.flatMap((item) =>
      item.kind === 'call' ? [item.binding] : [],
    ),
  ).toEqual(['wider', 'taller']);
  expect(
    method.content.some(
      (item) => item.kind === 'quantity' && item.selectionName === 'product',
    ),
  ).toBe(true);
  const table = first.sections[0]?.items.find((item) => item.kind === 'table');
  if (table?.kind !== 'table') throw new Error('Missing table');
  expect(
    table.groups.flatMap((group) => group.rows).map((row) => row.quantity),
  ).toEqual(['area']);
  expect(
    first.sections[0]?.items
      .filter((item) => item.kind === 'text')
      .map((item) => (item.kind === 'text' ? item.text.content : '')),
  ).toEqual(['Case A is the narrow panel', 'Case B is the wide panel']);
  expect(
    first.sections.some(
      (section) => section.invocationId === 'root/first_panel',
    ),
  ).toBe(false);
  expect(
    execution.cso.sections.some(
      (section) => section.metadata?.invocationId === 'root/first_panel',
    ),
  ).toBe(true);

  const tampered = structuredClone(execution);
  const call = tampered.methods?.[0]?.content.find(
    (item) => item.kind === 'call',
  );
  if (call?.kind !== 'call') throw new Error('Missing call');
  const input = call.inputs[0];
  if (!input) throw new Error('Missing call input');
  input.name = 'width';
  expect(
    verifyExecution({ execution: tampered }).diagnostics.some(
      (item) => item.code === 'CALL_MAPPING_MISMATCH',
    ),
  ).toBe(true);
  const edited = structuredClone(execution);
  const helper = edited.methods?.[0]?.helpers[0];
  if (!helper) throw new Error('Missing helper');
  helper.sourceHash = 'b'.repeat(64);
  expect(
    verifyExecution({ execution: edited }).diagnostics.some(
      (item) => item.code === 'DEPENDENCY_SOURCE_MISMATCH',
    ),
  ).toBe(true);

  const htmlPath = join(directory, 'panel.html');
  const html = publish('html', 'panel_publish.cso.py', 'compare', htmlPath, [
    '--check-layout',
  ]);
  expect(html.status, html.stdout || html.stderr).toBe(0);
  const htmlText = readFileSync(htmlPath, 'utf8');
  expect(htmlText.match(/data-helper="margin"/g)).toHaveLength(1);
  expect(htmlText).toContain('data-call="wider"');
  expect(htmlText).toContain('data-call="taller"');
  expect(htmlText).toContain('length = w');
  expect(htmlText).toContain('length = h');
  expect(htmlText).toContain('The margin is one metre.');
  expect(htmlText).toContain('Panel sides are grown independently.');
  expect(htmlText).toContain('alt="A rectangle"');
  expect(htmlText).toContain('(wider.grown * taller.grown)');
  expect(htmlText).toContain('Case A is the narrow panel');
  expect(htmlText.match(/The margin is one metre\./g)).toHaveLength(1);

  const pdfPath = join(directory, 'panel.pdf');
  const pdf = publish('pdf', 'panel_publish.cso.py', 'compare', pdfPath);
  expect(pdf.status, pdf.stdout || pdf.stderr).toBe(0);
  const info = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  expect(info.status, info.stderr).toBe(0);
  expect(info.stdout).toContain('Pages:           2');
}, 180_000);

test('publishes verified conditional notes without rerunning dormant branches', async () => {
  const execution = capture('branch_compare.cso.py', 'compare');
  expect(verifyExecution({ execution }).ok).toBe(true);
  const method = execution.methods?.[0];
  if (!method) throw new Error('Missing method');
  const chosen = method.quantities.find(
    (item) => item.variableName === 'chosen',
  );
  const guarded = method.quantities.find(
    (item) => item.variableName === 'guarded',
  );
  expect(chosen?.formulaText).toBe('(w if w > h else h)');
  expect(guarded?.formulaText).toContain('else');
  const divide = guarded?.nodes.find(
    (node) => node.mode === 'FUNCTION' && node.funcSpec.id === 'fg.divide',
  );
  if (!divide) throw new Error('Missing dormant division');
  const outcomes = execution.branchOutcomes ?? [];
  expect(outcomes.map((item) => item.label)).toEqual(['w', 'w', 'h', 'w']);
  const guardedOutcomes = outcomes.filter((item) =>
    item.symbolId.includes('"guarded"'),
  );
  expect(guardedOutcomes).toHaveLength(2);
  for (const outcome of guardedOutcomes) {
    expect(outcome.usedKeys).not.toContain(divide.key);
  }
  expect(outcomes.some((item) => item.invocationId === 'root/spare')).toBe(
    false,
  );
  const document = prepareExecutionDocument({ execution, assets: [] });
  const table = document.sections[0]?.items.find(
    (item) => item.kind === 'table',
  );
  if (table?.kind !== 'table') throw new Error('Missing table');
  expect(table.casesAxis).toBe('rows');
  expect(table.branchNotes?.map((note) => note.label)).toEqual(['w', 'h']);
  expect(
    document.sections.some((section) => section.invocationId === 'root/spare'),
  ).toBe(true);
  expect(
    document.sections.some((section) => section.invocationId === 'root/narrow'),
  ).toBe(false);

  const flipped = structuredClone(execution);
  const first = flipped.branchOutcomes?.[0];
  if (!first) throw new Error('Missing branch outcome');
  first.value = !first.value;
  expect(
    verifyExecution({ execution: flipped }).diagnostics.some(
      (item) => item.code === 'BRANCH_OUTCOME_MISMATCH',
    ),
  ).toBe(true);
  const widened = structuredClone(execution);
  widened.branchOutcomes?.[0]?.usedKeys.push(divide.key);
  expect(
    verifyExecution({ execution: widened }).diagnostics.some(
      (item) => item.code === 'BRANCH_OUTCOME_MISMATCH',
    ),
  ).toBe(true);

  const htmlPath = join(directory, 'branch.html');
  const html = publish('html', 'branch_compare.cso.py', 'compare', htmlPath, [
    '--check-layout',
  ]);
  expect(html.status, html.stdout || html.stderr).toBe(0);
  const htmlText = readFileSync(htmlPath, 'utf8');
  expect(htmlText).toContain('data-cases-axis="rows"');
  expect(htmlText).toContain('data-branch-note="Narrow"');
  expect(htmlText).toContain('data-formula="w"');
  expect(htmlText).toContain('data-branch-note="Wide"');
  expect(htmlText).toContain('data-formula="h"');
  expect(htmlText.match(/otherwise\./g)).toHaveLength(4);
  expect(htmlText).toContain(
    'scope="row" data-comparison-label="" data-case-heading="Narrow"',
  );
  const pdfPath = join(directory, 'branch.pdf');
  const pdf = publish('pdf', 'branch_compare.cso.py', 'compare', pdfPath);
  expect(pdf.status, pdf.stdout || pdf.stderr).toBe(0);
  const info = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  expect(info.status, info.stderr).toBe(0);
  expect(info.stdout).toContain('Pages:           2');
}, 180_000);

test('keeps a failed engineering check beside the unchanged number', async () => {
  const execution = capture('checked_compare.cso.py', 'compare');
  expect(verifyExecution({ execution }).ok).toBe(true);
  const areaLimit = (execution.checkOutcomes ?? []).filter(
    (item) => item.checkId === 'area-limit',
  );
  expect(areaLimit.map((item) => item.value)).toEqual([true, false, false]);
  const document = prepareExecutionDocument({ execution, assets: [] });
  const table = document.sections[0]?.items.find(
    (item) => item.kind === 'table',
  );
  if (table?.kind !== 'table') throw new Error('Missing table');
  const area = table.groups
    .flatMap((group) => group.rows)
    .find((row) => row.quantity === 'area');
  expect(area?.cells.map((cell) => cell.value)).toEqual([6, 24]);
  expect(
    table.engineeringChecks?.find((item) => item.id === 'area-limit')?.results,
  ).toEqual([
    { heading: 'Case A', invocationId: 'root/first_panel', value: true },
    { heading: 'Case B', invocationId: 'root/second_panel', value: false },
  ]);
  const spare = document.sections.find(
    (section) => section.invocationId === 'root/extra_panel',
  );
  expect(spare?.engineeringChecks?.map((item) => item.value)).toEqual([
    false,
    true,
  ]);

  const flipped = structuredClone(execution);
  const failed = flipped.checkOutcomes?.find((item) => item.value === false);
  if (!failed) throw new Error('Missing failed check');
  failed.value = true;
  expect(
    verifyExecution({ execution: flipped }).diagnostics.some(
      (item) => item.code === 'CHECK_OUTCOME_MISMATCH',
    ),
  ).toBe(true);

  const hidden = capture('checked_hidden.cso.py', 'compare');
  expect(verifyExecution({ execution: hidden }).ok).toBe(true);
  const hiddenDocument = prepareExecutionDocument({
    execution: hidden,
    assets: [],
  });
  const hiddenTable = hiddenDocument.sections[0]?.items.find(
    (item) => item.kind === 'table',
  );
  if (hiddenTable?.kind !== 'table') throw new Error('Missing hidden table');
  expect(
    hiddenTable.groups
      .flatMap((group) => group.rows)
      .some((row) => row.quantity === 'area'),
  ).toBe(false);
  expect(
    hiddenTable.engineeringChecks?.some(
      (item) =>
        item.id === 'area-limit' &&
        item.results.some((result) => result.value === false),
    ),
  ).toBe(true);

  const htmlPath = join(directory, 'checked.html');
  const html = publish('html', 'checked_compare.cso.py', 'compare', htmlPath, [
    '--check-layout',
  ]);
  expect(html.status, html.stdout || html.stderr).toBe(0);
  const htmlText = readFileSync(htmlPath, 'utf8');
  expect(htmlText).toContain('data-cases-axis="rows"');
  expect(htmlText).toContain('data-check="area-limit"');
  expect(htmlText).toContain('data-check-result="fail"');
  expect(htmlText).toContain('data-check-result="pass"');
  expect(htmlText).toContain('Area exceeds 20 square metres.');
  expect(htmlText).toContain('>24<');
  const pdfPath = join(directory, 'checked.pdf');
  const pdf = publish('pdf', 'checked_compare.cso.py', 'compare', pdfPath);
  expect(pdf.status, pdf.stdout || pdf.stderr).toBe(0);
  const info = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  expect(info.status, info.stderr).toBe(0);
  expect(info.stdout).toMatch(/Pages:\s+[12]/);
}, 180_000);

test('marks results outside their applicability without changing the number', async () => {
  const execution = capture('limit_compare.cso.py', 'compare');
  const again = capture('limit_compare.cso.py', 'compare');
  expect(again.applicabilityOutcomes).toEqual(execution.applicabilityOutcomes);
  expect(verifyExecution({ execution }).ok).toBe(true);
  const areaOutcomes = (execution.applicabilityOutcomes ?? []).filter(
    (item) => item.applicabilityId === 'area-limit',
  );
  expect(areaOutcomes.map((item) => item.value)).toEqual([true, false, false]);
  const document = prepareExecutionDocument({ execution, assets: [] });
  expect(prepareExecutionDocument({ execution, assets: [] })).toEqual(document);
  const table = document.sections[0]?.items.find(
    (item) => item.kind === 'table',
  );
  if (table?.kind !== 'table') throw new Error('Missing table');
  const cell = (quantity: string, heading: string) => {
    const row = table.groups
      .flatMap((group) => group.rows)
      .find((item) => item.quantity === quantity);
    return row?.cells.find((item) => item.heading === heading);
  };
  expect(cell('area', 'Case A')?.value).toBe(6);
  expect(cell('area', 'Case A')?.applicability).toBeUndefined();
  expect(cell('area', 'Case B')).toMatchObject({
    value: 24,
    applicability: {
      state: 'not-applicable',
      reasons: [
        'Area exceeds the method limit.',
        'Area also exceeds the second limit.',
      ],
    },
  });
  expect(cell('volume', 'Case B')?.value).toBe(48);
  expect(cell('volume', 'Case B')?.applicability?.reasons).toEqual([
    'Area exceeds the method limit.',
    'Area also exceeds the second limit.',
  ]);
  expect(cell('depth', 'Case B')?.applicability).toBeUndefined();
  expect(cell('chosen', 'Case B')?.value).toBe(8);
  expect(cell('chosen', 'Case B')?.applicability).toBeUndefined();
  expect(cell('guard', 'Case B')?.applicability?.state).toBe('not-applicable');
  expect(
    table.engineeringChecks
      ?.find((item) => item.id === 'volume-check')
      ?.results.map((result) => ({
        heading: result.heading,
        value: result.value,
        reasons: result.reasons,
      })),
  ).toEqual([
    { heading: 'Case A', value: true, reasons: undefined },
    {
      heading: 'Case B',
      value: true,
      reasons: [
        'Area exceeds the method limit.',
        'Area also exceeds the second limit.',
      ],
    },
  ]);
  const extra = document.sections.find(
    (section) => section.invocationId === 'root/extra_panel',
  );
  const extraSymbol = (description: string) =>
    extra?.items.find(
      (item) =>
        item.kind === 'symbol' && item.symbol.description === description,
    );
  const chosen = extraSymbol('Chosen side');
  const guard = extraSymbol('Guard');
  if (chosen?.kind !== 'symbol' || guard?.kind !== 'symbol') {
    throw new Error('Missing ordinary symbols');
  }
  expect(chosen.applicability?.state).toBe('not-applicable');
  expect(guard.applicability).toBeUndefined();

  const checked = capture('checked_compare.cso.py', 'compare');
  expect(checked.applicabilityOutcomes).toBeUndefined();
  const checkedDocument = prepareExecutionDocument({
    execution: checked,
    assets: [],
  });
  const checkedTable = checkedDocument.sections[0]?.items.find(
    (item) => item.kind === 'table',
  );
  if (checkedTable?.kind !== 'table') throw new Error('Missing checked table');
  expect(
    checkedTable.groups
      .flatMap((group) => group.rows)
      .flatMap((row) => row.cells)
      .every((item) => item.applicability === undefined),
  ).toBe(true);

  const flipped = structuredClone(execution);
  const failed = flipped.applicabilityOutcomes?.find(
    (item) => item.value === false,
  );
  if (!failed) throw new Error('Missing applicability outcome');
  failed.value = true;
  expect(
    verifyExecution({ execution: flipped }).diagnostics.some(
      (item) => item.code === 'APPLICABILITY_OUTCOME_MISMATCH',
    ),
  ).toBe(true);

  const hidden = capture('limit_hidden.cso.py', 'compare');
  const hiddenDocument = prepareExecutionDocument({
    execution: hidden,
    assets: [],
  });
  const hiddenTable = hiddenDocument.sections[0]?.items.find(
    (item) => item.kind === 'table',
  );
  if (hiddenTable?.kind !== 'table') throw new Error('Missing hidden table');
  expect(
    hiddenTable.groups
      .flatMap((group) => group.rows)
      .some((row) => row.quantity === 'area'),
  ).toBe(false);
  expect(
    hiddenTable.applicabilityNotes?.some(
      (item) =>
        item.id === 'area-limit' &&
        item.results.some((result) => result.value === false),
    ),
  ).toBe(true);

  const nested = capture('limited_compare.cso.py', 'compare');
  expect(verifyExecution({ execution: nested }).ok).toBe(true);
  const nestedAssets = nested.assets.map((asset) => ({
    asset,
    dataUrl: `data:${asset.mediaType};base64,${png.toString('base64')}`,
  }));
  const derived = deriveApplicability(nested);
  const grownOutcomes = nested.invocations
    .filter((item) => item.function === 'margin')
    .flatMap((item) => {
      const grown = item.symbols.find(
        (symbol) => symbol.variableName === 'grown',
      );
      return grown && derived.reasonsBySymbolId.has(grown.symbolId)
        ? [item.resolvedInputs.length]
        : [];
    });
  expect(grownOutcomes).toEqual([8]);
  const nestedDocument = prepareExecutionDocument({
    execution: nested,
    assets: nestedAssets,
  });
  const nestedTable = nestedDocument.sections[0]?.items.find(
    (item) => item.kind === 'table',
  );
  if (nestedTable?.kind !== 'table') throw new Error('Missing nested table');
  const areas = nestedTable.groups
    .flatMap((group) => group.rows)
    .find((row) => row.quantity === 'area');
  expect(areas?.cells.map((item) => item.value)).toEqual([12, 36]);
  expect(areas?.cells.map((item) => item.applicability?.state)).toEqual([
    undefined,
    'not-applicable',
  ]);
  expect(areas?.cells[1]?.applicability?.reasons).toEqual([
    'Length exceeds the margin limit.',
  ]);

  const htmlPath = join(directory, 'applicability.html');
  const html = publish('html', 'limit_compare.cso.py', 'compare', htmlPath, [
    '--check-layout',
  ]);
  expect(html.status, html.stdout || html.stderr).toBe(0);
  const htmlText = readFileSync(htmlPath, 'utf8');
  expect(htmlText).toContain('data-cases-axis="rows"');
  expect(htmlText).toContain('data-applicability="not-applicable"');
  expect(htmlText).toContain('Not applicable');
  expect(htmlText).toContain('data-value="24"');
  expect(htmlText).toContain('data-check-result="not-applicable"');
  expect(htmlText).toContain('data-check-result="pass"');
  expect(htmlText).toContain('Area exceeds the method limit.');
  const pdfPath = join(directory, 'applicability.pdf');
  const pdf = publish('pdf', 'limit_compare.cso.py', 'compare', pdfPath);
  expect(pdf.status, pdf.stdout || pdf.stderr).toBe(0);
  const info = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  expect(info.status, info.stderr).toBe(0);
  expect(info.stdout).toMatch(/Pages:\s+[12]/);
}, 180_000);

test('continues a wide comparison across measured column groups', () => {
  const execution = capture('wide_compare.cso.py', 'compare');
  expect(execution.tables?.[0]?.columnCap).toBe(1);
  expect(execution.tables?.[0]?.cells).toHaveLength(15);
  const prepared = prepareExecutionDocument({ execution, assets: [] });
  const table = prepared.sections
    .flatMap((section) => section.items)
    .find((item) => item.kind === 'table');
  expect(table?.kind === 'table' ? table.columnCap : undefined).toBe(1);

  const htmlPath = join(directory, 'wide.html');
  const html = publish('html', 'wide_compare.cso.py', 'compare', htmlPath);
  expect(html.status, html.stdout || html.stderr).toBe(0);
  const htmlText = readFileSync(htmlPath, 'utf8');
  expect(htmlText).toContain('data-comparison-scroll');
  expect(htmlText).toContain('data-comparison-label');
  expect(htmlText).toContain('data-column-cap="1"');

  const pdfPath = join(directory, 'wide.pdf');
  const pdf = publish('pdf', 'wide_compare.cso.py', 'compare', pdfPath);
  expect(pdf.status, pdf.stdout || pdf.stderr).toBe(0);
  const text = spawnSync('pdftotext', ['-layout', pdfPath, '-'], {
    encoding: 'utf8',
  });
  expect(text.status, text.stderr).toBe(0);
  expect(text.stdout).toContain('Part 1 of 3');
  expect(text.stdout).toContain('Part 3 of 3');
  expect(text.stdout).toContain('Not applicable');
  expect(text.stdout).toContain('Perimeter exceeds twelve metres.');
  expect(text.stdout).toContain('m2');
  expect(text.stdout.match(/Width/g)?.length).toBeGreaterThan(1);

  const rowsPdf = join(directory, 'wide-rows.pdf');
  const rows = publish('pdf', 'wide_rows.cso.py', 'compare', rowsPdf);
  expect(rows.status, rows.stdout || rows.stderr).toBe(0);
  const rowsText = spawnSync('pdftotext', ['-layout', rowsPdf, '-'], {
    encoding: 'utf8',
  });
  expect(rowsText.status, rowsText.stderr).toBe(0);
  expect(rowsText.stdout).toContain('Part 1 of');
  expect(rowsText.stdout).toContain('Not applicable');
  expect(rowsText.stdout.match(/Case A/g)?.length).toBeGreaterThan(1);

  const sentinel = join(directory, 'unfit-sentinel.pdf');
  writeFileSync(sentinel, 'keep');
  const unfit = publish('pdf', 'unfit_compare.cso.py', 'compare', sentinel);
  expect(unfit.status).not.toBe(0);
  expect(unfit.stdout).toContain('DOCUMENT_LAYOUT_OVERFLOW');
  expect(readFileSync(sentinel, 'utf8')).toBe('keep');
}, 180_000);
