import { createSheetFromCalculationSourceJson } from '@cs-object/core';
import { describe, expect, test } from 'vitest';

describe('calculation source object', () => {
  test('renders missing source symbol references as empty literals', () => {
    const source = {
      schemaVersion: '1.0.0',
      title: 'Missing symbol reference',
      source: {
        id: 'source-with-placeholder',
        metadata: {},
      },
      rootSectionIds: ['root'],
      sections: [
        {
          id: 'root',
          title: 'Calculations',
          items: [
            {
              kind: 'symbol',
              symbol: {
                id: 'placeholder',
                glyph: 'p',
                valueTree: {
                  rootKey: 'root',
                  result: { kind: 'empty' },
                  nodes: [
                    {
                      key: 'root',
                      mode: 'SYMBOL',
                      draft: '',
                      symbol: null,
                      result: { kind: 'empty' },
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };
    const example = createSheetFromCalculationSourceJson(source, {
      id: 'missing-symbol-reference',
      label: 'Missing symbol reference',
    });

    expect(example.sheet.symbols[0]?.valueTree.nodes[0]).toMatchObject({
      kind: 'literal',
      key: 'root',
      value: { kind: 'empty' },
      draft: '',
      result: { kind: 'empty' },
    });
  });

  test('keeps missing source symbol descriptions empty in sheet rows', () => {
    const source = {
      schemaVersion: '1.0.0',
      title: 'Missing description',
      source: {
        id: 'source-with-missing-description',
        metadata: {},
      },
      rootSectionIds: ['root'],
      sections: [
        {
          id: 'root',
          title: 'Calculations',
          items: [
            {
              kind: 'symbol',
              symbol: {
                id: 'area',
                glyph: 'A',
                valueTree: {
                  rootKey: 'root',
                  result: { kind: 'number', value: 12 },
                  nodes: [
                    {
                      key: 'root',
                      mode: 'LITERAL',
                      literal: { kind: 'number', value: 12 },
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    };
    const example = createSheetFromCalculationSourceJson(source, {
      id: 'missing-description',
      label: 'Missing description',
    });

    expect(example.sheet.symbols[0]?.description).toBe('');
  });
});
