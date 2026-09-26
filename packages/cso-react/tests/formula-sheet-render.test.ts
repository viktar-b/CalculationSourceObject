import {
  SheetDocumentSchema,
  type SheetDocument,
  type SheetValueNode,
} from '@cs-object/core';
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
            result: { kind: 'number', value: functionId === 'fg.pow' ? 4 : -2 },
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
    const formulas = (
      markup.match(/<math\b[^>]*>[\s\S]*?<\/math>/g) ?? []
    ).filter((math) => htmlText(math).includes('5.00'));
    expect(formulas.length).toBeGreaterThan(0);
    for (const formula of formulas) {
      expect(htmlText(formula)).toContain(
        functionId === 'fg.pow'
          ? '( 5.00 - 3.00 ) 2.00'
          : '- ( 5.00 - 3.00 )',
      );
      expect(formula.match(/<mo fence="true">\(<\/mo>/g)).toHaveLength(1);
      expect(formula.match(/<mo fence="true">\)<\/mo>/g)).toHaveLength(1);
    }
  },
);

test.each([
  { name: 'literal', value: -2, draft: undefined, expected: '( -2.00 ) 2.00' },
  { name: 'draft', value: 2, draft: '-2', expected: '( -2 ) 2.00' },
])('fences a negative $name power base', ({ value, draft, expected }) => {
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
              value: { kind: 'number', value },
              draft,
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
  ).toContain(expected);
});

describe.each([
  { functionId: 'fg.multiply', operator: '⋅' },
  { functionId: 'fg.subtract', operator: '-' },
  { functionId: 'fg.add', operator: '+' },
])('$functionId signed operands', ({ functionId, operator }) => {
  const cases: {
    name: string;
    right: SheetValueNode;
    left: number;
    referencedValue?: number;
    expected: string[];
    fences: number[];
  }[] = [
    {
      name: 'negative literal',
      right: {
        kind: 'literal',
        key: 'right',
        value: { kind: 'number', value: -2 },
      },
      left: 5,
      expected: [`5.00 ${operator} ( -2.00 )`],
      fences: [1],
    },
    {
      name: 'negative draft with positive backing',
      right: {
        kind: 'literal',
        key: 'right',
        value: { kind: 'number', value: 2 },
        draft: '  -2',
      },
      left: 5,
      expected: [`5.00 ${operator} ( -2 )`],
      fences: [1],
    },
    {
      name: 'negative draft with empty backing',
      right: {
        kind: 'literal',
        key: 'right',
        value: { kind: 'empty' },
        draft: '-2',
      },
      left: 5,
      expected: [`5.00 ${operator} ( -2 )`],
      fences: [1],
    },
    {
      name: 'positive draft with negative backing',
      right: {
        kind: 'literal',
        key: 'right',
        value: { kind: 'number', value: -2 },
        draft: '2',
      },
      left: 5,
      expected: [`5.00 ${operator} 2`],
      fences: [0],
    },
    {
      name: 'empty draft keeps negative numeric value',
      right: {
        kind: 'literal',
        key: 'right',
        value: { kind: 'number', value: -2 },
        draft: '',
      },
      left: 5,
      expected: [`5.00 ${operator} ( -2.00 )`],
      fences: [1],
    },
    {
      name: 'Unicode minus draft',
      right: {
        kind: 'literal',
        key: 'right',
        value: { kind: 'number', value: 2 },
        draft: '−2',
      },
      left: 5,
      expected: [`5.00 ${operator} ( −2 )`],
      fences: [1],
    },
    {
      name: 'negative zero literal',
      right: {
        kind: 'literal',
        key: 'right',
        value: { kind: 'number', value: -0 },
      },
      left: 5,
      expected: [`5.00 ${operator} ( 0 )`],
      fences: [1],
    },
    {
      name: 'negative substitution',
      right: { kind: 'symbol', key: 'right', symbolId: 'operand' },
      left: 5,
      referencedValue: -2,
      expected: [`5.00 ${operator} b`, `5.00 ${operator} ( -2.00 )`],
      fences: [0, 1],
    },
    {
      name: 'negative zero substitution',
      right: { kind: 'symbol', key: 'right', symbolId: 'operand' },
      left: 5,
      referencedValue: -0,
      expected: [`5.00 ${operator} b`, `5.00 ${operator} ( 0 )`],
      fences: [0, 1],
    },
    {
      name: 'explicit unary minus',
      right: {
        kind: 'function',
        key: 'right',
        functionId: 'fg.uminus',
        argKeys: ['magnitude'],
      },
      left: 5,
      expected: [`5.00 ${operator} ( - 2.00 )`],
      fences: [1],
    },
    {
      name: 'positive literal',
      right: {
        kind: 'literal',
        key: 'right',
        value: { kind: 'number', value: 2 },
      },
      left: 5,
      expected: [`5.00 ${operator} 2.00`],
      fences: [0],
    },
    {
      name: 'positive substitution',
      right: { kind: 'symbol', key: 'right', symbolId: 'operand' },
      left: 5,
      referencedValue: 2,
      expected: [`5.00 ${operator} b`, `5.00 ${operator} 2.00`],
      fences: [0, 0],
    },
    {
      name: 'negative left operand',
      right: {
        kind: 'literal',
        key: 'right',
        value: { kind: 'number', value: 2 },
      },
      left: -5,
      expected: [`-5.00 ${operator} 2.00`],
      fences: [0],
    },
    {
      name: 'compound right operand',
      right: {
        kind: 'function',
        key: 'right',
        functionId: 'fg.subtract',
        argKeys: ['magnitude', 'one'],
      },
      left: 5,
      expected: [`5.00 ${operator} ( 2.00 - 1.00 )`],
      fences: [1],
    },
  ];

  test.each(cases)(
    '$name',
    ({ right, left, referencedValue, expected, fences }) => {
      const operandSheet = SheetDocumentSchema.parse({
        ...sheet,
        symbols: [
          {
            ...sheet.symbols[0],
            valueTree: {
              rootKey: 'root',
              result: { kind: 'number', value: 0 },
              nodes: [
                {
                  kind: 'function',
                  key: 'root',
                  functionId,
                  argKeys: ['left', 'right'],
                },
                {
                  kind: 'literal',
                  key: 'left',
                  value: { kind: 'number', value: left },
                },
                right,
                {
                  kind: 'literal',
                  key: 'magnitude',
                  value: { kind: 'number', value: 2 },
                },
                {
                  kind: 'literal',
                  key: 'one',
                  value: { kind: 'number', value: 1 },
                },
              ],
            },
          },
          ...(referencedValue === undefined
            ? []
            : [
                {
                  id: 'operand',
                  glyph: 'b',
                  description: 'Operand',
                  valueTree: {
                    rootKey: 'value',
                    result: { kind: 'number', value: referencedValue },
                    nodes: [
                      {
                        kind: 'literal',
                        key: 'value',
                        value: { kind: 'number', value: referencedValue },
                      },
                    ],
                  },
                },
              ]),
        ],
      });
      const markup = renderToStaticMarkup(
        createElement(FormulaSheet, { sheet: operandSheet }),
      );
      const formulas = (
        markup.match(/<math\b[^>]*>[\s\S]*?<\/math>/g) ?? []
      ).filter((math) => htmlText(math).includes('5.00'));

      expect(formulas.map(htmlText)).toEqual(expected);
      expect(
        formulas.map(
          (math) => (math.match(/<mo fence="true">\(<\/mo>/g) ?? []).length,
        ),
      ).toEqual(fences);
      expect(
        formulas.map(
          (math) => (math.match(/<mo fence="true">\)<\/mo>/g) ?? []).length,
        ),
      ).toEqual(fences);
    },
  );
});

test.each([
  { name: 'literal', value: -2, draft: undefined, expected: '+ ( -2.00 )' },
  { name: 'draft', value: 2, draft: '-2', expected: '+ ( -2 )' },
])(
  'groups negative $name continuation terms in long sums without fencing the first term',
  ({ value, draft, expected }) => {
    const terms: SheetValueNode[] = [
      { kind: 'literal', key: 'first', value: { kind: 'number', value: -5 } },
      {
        kind: 'literal',
        key: 'negative',
        value: { kind: 'number', value },
        draft,
      },
      { kind: 'symbol', key: 'reference', symbolId: 'operand' },
      {
        kind: 'function',
        key: 'unary',
        functionId: 'fg.uminus',
        argKeys: ['positive'],
      },
      { kind: 'literal', key: 'positive', value: { kind: 'number', value: 2 } },
      {
        kind: 'function',
        key: 'compound',
        functionId: 'fg.subtract',
        argKeys: ['positive', 'one'],
      },
    ];
    const sums: SheetValueNode[] = terms.slice(1).map((term, index) => ({
      kind: 'function',
      key: `sum${index + 1}`,
      functionId: 'fg.add',
      argKeys: [index === 0 ? 'first' : `sum${index}`, term.key],
    }));
    const longSum = SheetDocumentSchema.parse({
      ...sheet,
      symbols: [
        {
          ...sheet.symbols[0],
          glyph: 's',
          valueTree: {
            rootKey: 'sum5',
            result: { kind: 'number', value: -9 },
            nodes: [
              ...terms,
              ...sums,
              {
                kind: 'literal',
                key: 'one',
                value: { kind: 'number', value: 1 },
              },
            ],
          },
        },
        {
          id: 'operand',
          glyph: 'b',
          description: 'Operand',
          valueTree: {
            rootKey: 'value',
            result: { kind: 'number', value: -3 },
            nodes: [
              {
                kind: 'literal',
                key: 'value',
                value: { kind: 'number', value: -3 },
              },
            ],
          },
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(FormulaSheet, { sheet: longSum }),
    );
    const formulas = (markup.match(/<math\b[^>]*>[\s\S]*?<\/math>/g) ?? [])
      .map(htmlText)
      .filter((formula) => /[+=]/.test(formula));

    expect(formulas).toEqual([
      's = -5.00',
      expected,
      '+ b',
      '+ ( - 2.00 )',
      '+ 2.00',
      '+ ( 2.00 - 1.00 )',
      's = -5.00',
      expected,
      '+ ( -3.00 )',
      '+ ( - 2.00 )',
      '+ 2.00',
      '+ ( 2.00 - 1.00 )',
    ]);
  },
);
