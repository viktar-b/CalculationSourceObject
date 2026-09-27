import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PreparedFormulaSheet } from '@cs-object/react';
import type { PreparedDocument } from '@cs-object/core';

export function buildPreparedHtml(preparedDocument: PreparedDocument): string {
  const css = readFileSync(
    createRequire(import.meta.url).resolve('@cs-object/react/style.css'),
    'utf8',
  );
  const markup = renderToStaticMarkup(
    createElement(PreparedFormulaSheet, { document: preparedDocument }),
  );
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    renderToStaticMarkup(createElement('title', null, preparedDocument.title)),
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:">',
    `<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="formula-sheet-printing cso-standalone-report">`,
    `<div data-formula-sheet-print-root="true">${markup}</div></body></html>`,
  ].join('');
}
