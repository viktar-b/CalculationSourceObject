import {
  existsSync,
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CalculationSourceObjectSchema,
  ExecutionResponseSchema,
} from '@viktar-b/cso-core';
import { createSheetFromCalculationSourceObject } from '@viktar-b/cso-core';
import { prepareExecutionDocument } from '@viktar-b/cso-react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  parseCliArgs,
  renderFormulaSheetHtml,
  renderPdfFromHtml,
  runPythonExporter,
} from '../../apps/cso-cli/src/development.ts';
import { renderPreparedPdf } from '../../apps/cso-cli/src/pdf-rendering.ts';

const repoRoot = new URL('../..', import.meta.url).pathname;
let sourcePath: string;
const functionName = 'rectangle';
const tempDirectories: string[] = [];

const createTempDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'formula-sheet-pdf-'));
  tempDirectories.push(directory);

  return directory;
};

beforeEach(() => {
  sourcePath = join(createTempDirectory(), 'rectangle.cso.py');
  copyFileSync(
    join(repoRoot, 'tests/integration/installed/fixtures/geometry.cso.py.txt'),
    sourcePath,
  );
});

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('annotated Python PDF renderer', () => {
  test('rejects a glyph wider than its symbol cell before writing a PDF', async () => {
    const response = ExecutionResponseSchema.parse(
      JSON.parse(
        readFileSync(
          join(repoRoot, 'tests/fixtures/contract-cases/single-success.json'),
          'utf8',
        ),
      ),
    );
    if (!response.ok) throw new Error('Expected successful fixture');
    const document = prepareExecutionDocument({
      execution: response.execution,
      assets: [],
    });
    const item = document.sections
      .flatMap((section) => section.items)
      .find((entry) => entry.kind === 'symbol');
    if (!item) throw new Error('Expected a symbol row');
    item.symbol.glyph = 'A_{rectangle,second,panel}';
    item.symbol.glyphPlaintext = item.symbol.glyph;

    await expect(renderPreparedPdf(document)).rejects.toThrow(
      'Mathematical notation overflows its cell',
    );
  }, 30_000);

  test('parses generic annotated Python PDF CLI options', () => {
    expect(
      parseCliArgs([
        '--source',
        sourcePath,
        '--function',
        functionName,
        '--input',
        'width=2',
        '--input',
        'height=3',
        '--out',
        'output/rectangle.pdf',
      ]),
    ).toMatchObject({
      functionName,
      inputs: { width: 2, height: 3 },
      outPath: expect.stringContaining('output/rectangle.pdf'),
      sourcePath,
    });
    expect(() =>
      parseCliArgs([
        '--source',
        sourcePath,
        '--function',
        functionName,
        '--input',
        'invalid-name=2',
        '--input',
        'height=3',
        '--out',
        'output/rectangle.pdf',
      ]),
    ).toThrow(/valid Python parameter/);
  });

  test('runs the Python exporter and validates CalculationSourceObject output', () => {
    const source = runPythonExporter({
      functionName,
      inputs: { width: 2, height: 3 },
      sourcePath,
    });
    const parsed = CalculationSourceObjectSchema.parse(source);
    const symbols = parsed.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.kind === 'symbol' ? [item.symbol] : [],
      ),
    );
    const width = symbols.find((symbol) => symbol.glyph === 'w');
    const area = symbols.find((symbol) => symbol.glyph === 'A');

    expect(symbols).toHaveLength(4);
    expect(width?.valueTree.result).toEqual({
      kind: 'number',
      value: 2,
    });
    expect(area?.valueTree.result).toEqual({ kind: 'number', value: 6 });
  });

  test('generates a non-empty PDF file from server-rendered FormulaSheet HTML', async () => {
    const source = CalculationSourceObjectSchema.parse(
      runPythonExporter({
        functionName,
        inputs: { width: 2, height: 3 },
        sourcePath,
      }),
    );
    const calculation = createSheetFromCalculationSourceObject(source, {
      id: 'synthetic-rectangle',
      label: source.title,
    });
    const html = renderFormulaSheetHtml(calculation.sheet, {
      css: 'body { background: white; }',
      title: 'Synthetic rectangle',
    });
    const outputPath = join(createTempDirectory(), 'rectangle.pdf');

    await renderPdfFromHtml(html, outputPath);

    const bytes = readFileSync(outputPath);

    expect(existsSync(outputPath)).toBe(true);
    expect(bytes.subarray(0, 4).toString('utf8')).toBe('%PDF');
    expect(statSync(outputPath).size).toBeGreaterThan(10_000);
  }, 30_000);
});
