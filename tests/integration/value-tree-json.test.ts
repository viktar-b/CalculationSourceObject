import { getRootSectionItems } from '@cs-object/core';
import { safeParseValueTreeJson } from '@cs-object/core';
import { createSheetFromValueTreeJson } from '@cs-object/core';
import { describe, expect, test } from 'vitest';

const validMinimalDocument = {
  title: 'Minimal',
  sections: [
    {
      title: 'Inputs',
      symbols: [
        {
          id: 'a',
          glyph: 'a',
          result: 2,
          valueTree: [{ key: 'a-value', literal: 2 }],
        },
        {
          id: 'b',
          glyph: 'b',
          result: 4,
          valueTree: [
            {
              key: 'b-root',
              function: 'fg.add',
              arguments: ['b-a', 'b-one'],
            },
            { key: 'b-a', symbol: 'a' },
            { key: 'b-one', literal: 1 },
          ],
        },
      ],
    },
  ],
};

describe('value-tree JSON validation', () => {
  test('rejects documents without sections', () => {
    expect(safeParseValueTreeJson({ title: 'No sections' }).success).toBe(
      false,
    );
  });

  test('rejects nodes with more than one node kind', () => {
    const result = safeParseValueTreeJson({
      title: 'Invalid',
      sections: [
        {
          symbols: [
            {
              id: 'a',
              valueTree: [{ key: 'a-value', literal: 1, symbol: 'b' }],
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test('rejects function args that do not resolve inside their value tree', () => {
    const result = safeParseValueTreeJson({
      title: 'Invalid',
      sections: [
        {
          symbols: [
            {
              id: 'a',
              valueTree: [
                {
                  key: 'root',
                  function: 'fg.add',
                  arguments: ['missing'],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test('rejects symbol references that do not resolve in the document', () => {
    const result = safeParseValueTreeJson({
      title: 'Invalid',
      sections: [
        {
          symbols: [
            {
              id: 'a',
              valueTree: [{ key: 'a-value', symbol: 'missing-symbol' }],
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test('converts validated JSON into a sheet document', () => {
    const example = createSheetFromValueTreeJson(validMinimalDocument, {
      id: 'minimal',
      label: 'Minimal',
    });

    expect(example.sheet.id).toBe('minimal-sheet');
    expect(example.sheet.rootSectionId).toBe('minimal-sheet');
    expect(example.sheet.symbols.map((symbol) => symbol.id)).toEqual([
      'a',
      'b',
    ]);
    expect(example.sheet.symbols[1]?.valueTree.nodes[0]).toEqual({
      kind: 'function',
      key: 'b-root',
      functionId: 'fg.add',
      argKeys: ['b-a', 'b-one'],
    });
  });

  test('preserves node-level tags and results in sheet value trees', () => {
    const example = createSheetFromValueTreeJson(
      {
        title: 'Node metadata',
        sections: [
          {
            symbols: [
              {
                id: 'base',
                glyph: 'b',
                result: 10,
                valueTree: [
                  {
                    key: 'base-root',
                    literal: 10,
                    result: 10,
                    tags: ['input'],
                  },
                ],
              },
              {
                id: 'total',
                glyph: 't',
                result: 12,
                valueTree: [
                  {
                    key: 'total-root',
                    function: 'fg.add',
                    arguments: ['base-ref', 'offset'],
                    result: 12,
                    tags: ['derived', 'checked'],
                  },
                  {
                    key: 'base-ref',
                    symbol: 'base',
                    result: 10,
                    tags: ['dependency'],
                  },
                  {
                    key: 'offset',
                    literal: 2,
                    result: 2,
                    tags: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'node-metadata',
        label: 'Node metadata',
      },
    );

    const total = example.sheet.symbols.find((symbol) => symbol.id === 'total');

    expect(total?.valueTree.nodes).toEqual([
      {
        kind: 'function',
        key: 'total-root',
        functionId: 'fg.add',
        argKeys: ['base-ref', 'offset'],
        result: { kind: 'number', value: 12 },
        tags: ['derived', 'checked'],
      },
      {
        kind: 'symbol',
        key: 'base-ref',
        symbolId: 'base',
        result: { kind: 'number', value: 10 },
        tags: ['dependency'],
      },
      {
        kind: 'literal',
        key: 'offset',
        value: { kind: 'number', value: 2 },
        draft: '2',
        result: { kind: 'number', value: 2 },
        tags: [],
      },
    ]);
  });

  test('keeps missing value-tree symbol descriptions empty in sheet rows', () => {
    const example = createSheetFromValueTreeJson(
      {
        title: 'Missing description',
        sections: [
          {
            title: 'Calculations',
            symbols: [
              {
                id: 'area',
                glyph: 'A',
                result: 12,
                valueTree: [{ key: 'area-root', literal: 12 }],
              },
            ],
          },
        ],
      },
      {
        id: 'missing-value-tree-description',
        label: 'Missing description',
      },
    );

    expect(example.sheet.symbols[0]?.description).toBe('');
  });

  test('flattens nested sections into renderable sheet rows', () => {
    const example = createSheetFromValueTreeJson(
      {
        title: 'Nested',
        sections: [
          {
            title: 'Inputs',
            symbols: [
              {
                id: 'width',
                glyph: 'b',
                result: 300,
                valueTree: [{ key: 'width-value', literal: 300 }],
              },
            ],
          },
          {
            title: 'Derived',
            symbols: [
              {
                id: 'double-width',
                glyph: 'b_2',
                result: 600,
                valueTree: [
                  {
                    key: 'double-root',
                    function: 'fg.multiply',
                    arguments: ['width-ref', 'two'],
                  },
                  { key: 'width-ref', symbol: 'width' },
                  { key: 'two', literal: 2 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'nested',
        label: 'Nested',
      },
    );
    const renderItems = getRootSectionItems(example.sheet);

    expect(renderItems.length).toBeGreaterThan(example.sheet.symbols.length);
    expect(renderItems.some((item) => item.kind === 'section')).toBe(true);
    expect(renderItems.some((item) => item.kind === 'symbol')).toBe(true);
  });
});
