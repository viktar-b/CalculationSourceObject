import { stringifyJson } from './json.ts';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, basename } from 'node:path';
import { chromium } from 'playwright';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormulaSheet } from '@cs-object/react';
import {
  CalculationSourceObjectSchema,
  createSheetFromCalculationSourceObject,
  type CalculationSourceObject,
  type SheetDocument,
} from '@cs-object/core';
import { UsageError, type DevelopmentOptions } from './arguments.ts';
export { parseCliArgs } from './arguments.ts';
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
export function isolatedEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  Reflect.deleteProperty(environment, 'NODE_PATH');
  Reflect.deleteProperty(environment, 'PYTHONPATH');
  Reflect.deleteProperty(environment, 'PYTHONHOME');
  return environment;
}
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
  const result = spawnSync(
    process.env.PYTHON ?? 'python3',
    [
      '-I',
      '-m',
      'cso_python',
      'export',
      sourcePath,
      '--function',
      functionName,
      '--inputs-json',
      stringifyJson(inputs),
    ],
    {
      encoding: 'utf8',
      env: isolatedEnvironment(),
      maxBuffer: 32 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const message = result.stderr.trim() || 'Python exporter failed';
    if (result.status === 2) throw new UsageError(message);
    throw new Error(message);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return CalculationSourceObjectSchema.parse(JSON.parse(result.stdout));
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
