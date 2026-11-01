import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import {
  type CalculationSourceObject,
  CalculationSourceObjectSchema,
  createSheetFromCalculationSourceObject,
  type SheetDocument,
} from '@cs-object/core';
import { FormulaSheet } from '@cs-object/react';
import { chromium } from 'playwright';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { type DevelopmentOptions, UsageError } from './arguments.ts';
import { stringifyJson } from './json.ts';
import { runPythonProcess } from './python-process.ts';

export { parseCliArgs } from './arguments.ts';
export { isolatedEnvironment } from './python-process.ts';
export type AnnotatedPythonPdfOptions = DevelopmentOptions;
export interface PythonExporterOptions {
  readonly functionName: string;
  readonly inputs: Record<string, unknown>;
  readonly sourcePath: string;
}
export interface FormulaSheetHtmlOptions {
  readonly css: string;
  readonly title: string;
}
const defaultCssPath = createRequire(import.meta.url).resolve(
  '@cs-object/react/style.css',
);
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
export function writeAtomically(
  outPath: string,
  bytes: string | Uint8Array,
): void {
  mkdirSync(dirname(outPath), { recursive: true });
  const temporary = join(
    dirname(outPath),
    `.${basename(outPath)}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(temporary, bytes, { flag: 'wx' });
    renameSync(temporary, outPath);
  } finally {
    rmSync(temporary, { force: true });
  }
}
export const runPythonExporter = ({
  functionName,
  inputs,
  sourcePath,
}: PythonExporterOptions): CalculationSourceObject => {
  const result = runPythonProcess({
    command: 'export',
    args: [
      sourcePath,
      '--function',
      functionName,
      '--inputs-json',
      stringifyJson(inputs),
    ],
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const message =
      result.stderr.toString('utf8').trim() || 'Python exporter failed';
    if (result.status === 2) throw new UsageError(message);
    throw new Error(message);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return CalculationSourceObjectSchema.parse(
    JSON.parse(result.stdout.toString('utf8')),
  );
};

export const renderFormulaSheetHtml = (
  sheet: SheetDocument,
  { css, title }: FormulaSheetHtmlOptions,
): string => {
  const sheetMarkup = renderToStaticMarkup(
    React.createElement(FormulaSheet, { sheet }),
  );
  const safeTitle = escapeHtml(title);

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${safeTitle}</title>`,
    '<style>',
    css,
    '</style>',
    '</head>',
    '<body class="formula-sheet-printing">',
    '<div data-formula-sheet-print-root="true">',
    sheetMarkup,
    '</div>',
    '</body>',
    '</html>',
  ].join('');
};

export const renderPdfFromHtml = async (
  html: string,
  outPath: string,
): Promise<void> => {
  mkdirSync(dirname(outPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: 'A4',
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
      printBackground: true,
    });

    writeAtomically(outPath, pdf);
  } finally {
    await browser.close();
  }
};

export const readCompiledFormulaSheetCss = (): string => {
  if (!existsSync(defaultCssPath)) {
    throw new Error(
      `Compiled stylesheet does not exist at ${defaultCssPath}. Run npm run build:css first.`,
    );
  }

  return readFileSync(defaultCssPath, 'utf8');
};

export const renderAnnotatedPythonPdf = async (
  options: AnnotatedPythonPdfOptions,
): Promise<void> => {
  const source = runPythonExporter(options);
  const omissions = new Map<string, number>();
  for (const item of [
    ...source.sections.flatMap((section) => section.items),
    ...(source.detachedItems ?? []),
  ]) {
    if (
      item.kind !== 'symbol' &&
      item.kind !== 'symbolRef' &&
      item.kind !== 'section'
    ) {
      omissions.set(item.kind, (omissions.get(item.kind) ?? 0) + 1);
    }
  }
  if (omissions.size > 0) {
    const counts = [...omissions]
      .map(([kind, count]) => `${kind}: ${count}`)
      .join(', ');
    process.stderr.write(
      `Warning: dev-render is a math-only preview and omits authored document content (${counts}). ` +
        'Use cso html or cso pdf to retain document content. Development output remains numerically unverified.\n',
    );
  }
  const calculation = createSheetFromCalculationSourceObject(source, {
    id: source.source.id,
    label: source.title,
  });
  const html = renderFormulaSheetHtml(calculation.sheet, {
    css: readCompiledFormulaSheetCss(),
    title: source.title,
  });

  await renderPdfFromHtml(html, options.outPath);
};
