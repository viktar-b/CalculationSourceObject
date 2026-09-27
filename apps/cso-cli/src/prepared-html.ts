import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PreparedFormulaSheet } from '@cs-object/react';
import type { PreparedDocument } from '@cs-object/core';

// Match print's 190mm content box while keeping standalone HTML visible on screen.
// Print pagination remains owned by the packaged stylesheet and PDF renderer.
const previewCss = `
@media screen {
  body.formula-sheet-printing [data-formula-sheet-print-root] {
    display: block; width: 190mm; margin: 10mm auto; background: white;
  }
  body.formula-sheet-printing [data-formula-sheet] {
    width: 190mm; min-width: 0; min-height: 0; padding: 0;
    margin: 0; border: none; display: block;
  }
}`;

export function buildPreparedHtml(
  preparedDocument: PreparedDocument,
  reviewNotice?: string,
): string {
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
    `<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}${previewCss}</style></head><body class="formula-sheet-printing">`,
    `<div data-formula-sheet-print-root="true">${reviewNotice ? renderToStaticMarkup(createElement('p', { 'data-cso-review-notice': true, style: { fontSize: '10pt', margin: '0 0 4mm', padding: '2mm', border: '1px solid #bbb' } }, reviewNotice)) : ''}${markup}</div></body></html>`,
  ].join('');
}
