import { SheetDocumentSchema, type SheetDocument } from '@cs-object/core';
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

test.each(['fg.pow', 'fg.uminus'])(
  'preserves a compound operand in %s MathML',
  (functionId) => {
    const compound = SheetDocumentSchema.parse({
      ...sheet,
      symbols: [
        {
          ...sheet.symbols[0],
          valueTree: {
            rootKey: 'root',
            result: { kind: 'number', value: 4 },
            nodes: [
              {
                key: 'root',
                kind: 'function',
                functionId,
                argKeys:
                  functionId === 'fg.pow'
                    ? ['difference', 'exponent']
                    : ['difference'],
              },
              {
                key: 'difference',
                kind: 'function',
                functionId: 'fg.subtract',
                argKeys: ['left', 'right'],
              },
              {
                key: 'left',
                kind: 'literal',
                value: { kind: 'number', value: 5 },
              },
              {
                key: 'right',
                kind: 'literal',
                value: { kind: 'number', value: 3 },
              },
              {
                key: 'exponent',
                kind: 'literal',
                value: { kind: 'number', value: 2 },
              },
            ],
          },
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(FormulaSheet, { sheet: compound }),
    );
    expect(htmlText(markup)).toContain('( 5.00 - 3.00 )');
    expect(markup).toContain('<mo fence="true">(</mo>');
  },
);

test('fences a negative literal power base', () => {
  const negative = SheetDocumentSchema.parse({
    ...sheet,
    symbols: [
      {
        ...sheet.symbols[0],
        valueTree: {
          rootKey: 'root',
          result: { kind: 'number', value: 4 },
          nodes: [
            {
              key: 'root',
              kind: 'function',
              functionId: 'fg.pow',
              argKeys: ['base', 'exponent'],
            },
            {
              key: 'base',
              kind: 'literal',
              value: { kind: 'number', value: -2 },
            },
            {
              key: 'exponent',
              kind: 'literal',
              value: { kind: 'number', value: 2 },
            },
          ],
        },
      },
    ],
  });
  expect(
    htmlText(
      renderToStaticMarkup(createElement(FormulaSheet, { sheet: negative })),
    ),
  ).toContain('( -2.00 ) 2.00');
});
