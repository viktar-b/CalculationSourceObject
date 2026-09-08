import { type SheetDocument, SheetDocumentSchema } from '@viktar-b/cso-core';
import { describe, expect, test } from 'vitest';

const minimalSheet = {
  id: 'minimal-sheet',
  title: 'Minimal sheet',
  rootSectionId: 'root',
  sections: [
    {
      id: 'root',
      title: 'Calculations',
      items: [{ kind: 'symbol', id: 'a' }],
    },
  ],
  symbols: [
    {
      id: 'a',
      glyph: 'a',
      description: 'Input value',
      unit: 'mm',
      comment: '',
      valueTree: {
        rootKey: 'a-value',
        result: { kind: 'number', value: 12 },
        nodes: [
          {
            kind: 'literal',
            key: 'a-value',
            value: { kind: 'number', value: 12 },
            draft: '12',
          },
        ],
      },
    },
  ],
} satisfies SheetDocument;

describe('SheetDocumentSchema', () => {
  test('validates the minimal render contract', () => {
    const parsed: SheetDocument = SheetDocumentSchema.parse(minimalSheet);

    expect(parsed.id).toBe('minimal-sheet');
    expect(parsed.sections[0]?.items).toEqual([{ kind: 'symbol', id: 'a' }]);
    expect(parsed.symbols[0]?.valueTree.result).toEqual({
      kind: 'number',
      value: 12,
    });
  });

  test('rejects backend and GraphQL-shaped fields', () => {
    const result = SheetDocumentSchema.safeParse({
      ...minimalSheet,
      __typename: 'BackendWorkspace',
      owner: { id: 'owner' },
      acl: null,
      visibility: 'VISIBLE',
    });

    expect(result.success).toBe(false);
  });

  test('rejects value tree nodes with stale workspace metadata', () => {
    const result = SheetDocumentSchema.safeParse({
      ...minimalSheet,
      symbols: [
        {
          ...minimalSheet.symbols[0],
          valueTree: {
            ...minimalSheet.symbols[0].valueTree,
            nodes: [
              {
                ...minimalSheet.symbols[0].valueTree.nodes[0],
                __typename: 'BackendValueTreeNode',
                mode: 'LITERAL',
                auxMeta: { items: [] },
              },
            ],
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  test('accepts function ids used by source fixtures', () => {
    const functionIds = [
      'fg.or',
      'fg.and',
      'fg.stub',
      'fg.ceil',
      'fg.round',
      'fg.deg',
    ];
    const result = SheetDocumentSchema.safeParse({
      ...minimalSheet,
      symbols: functionIds.map((functionId) => ({
        id: functionId.replace('.', '-'),
        glyph: functionId,
        description: functionId,
        unit: '',
        comment: '',
        valueTree: {
          rootKey: 'root',
          result: { kind: 'empty' },
          nodes: [
            {
              kind: 'function',
              key: 'root',
              functionId,
              argKeys: [],
            },
          ],
        },
      })),
      sections: [
        {
          id: 'root',
          title: 'Calculations',
          items: functionIds.map((functionId) => ({
            kind: 'symbol',
            id: functionId.replace('.', '-'),
          })),
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
