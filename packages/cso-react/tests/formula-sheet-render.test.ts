import type { SheetDocument } from '@cs-object/core';
import { FormulaSheet } from '@cs-object/react';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

(
  globalThis as typeof globalThis & {
    React?: typeof React;
  }
).React = React;

const literalValue = {
  kind: 'number',
  value: 50,
} as const;

const sheet: SheetDocument = {
  id: 'render-test',
  title: 'Render test',
  rootSectionId: 'root',
  sections: [
    {
      id: 'root',
      title: 'Square',
      items: [
        { kind: 'section', id: 'square' },
        { kind: 'symbol', id: 'side-length' },
      ],
    },
    {
      id: 'square',
      title: 'Square',
      items: [],
    },
  ],
  symbols: [
    {
      id: 'side-length',
      glyph: 'a_t',
      description: 'Side length',
      unit: 'mm',
      valueTree: {
        rootKey: 'side-length-value',
        result: literalValue,
        nodes: [
          {
            kind: 'literal',
            key: 'side-length-value',
            value: literalValue,
          },
        ],
      },
    },
  ],
};

const htmlText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('FormulaSheet rendering', () => {
  test('renders item indexes inline with the description text', () => {
    const html = renderToStaticMarkup(createElement(FormulaSheet, { sheet }));
    const text = htmlText(html);

    expect(text).toContain('0. Square');
    expect(text).toContain('1. Side length');
    expect(html).toContain('data-formula-sheet-item-index="true"');
  });

  test('renders repeated symbol references as separate rows', () => {
    const repeatedSheet: SheetDocument = {
      ...sheet,
      sections: [
        {
          id: 'root',
          title: 'Square',
          items: [
            { kind: 'symbol', id: 'side-length' },
            { kind: 'symbol', id: 'side-length' },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(FormulaSheet, { sheet: repeatedSheet }),
    );
    const text = htmlText(html);

    expect(text).toContain('0. Side length');
    expect(text).toContain('1. Side length');
  });
});
