import { expect, it } from 'vitest';
import {
  CalculationSourceObjectSchema,
  SheetDocumentSchema,
} from '../src/index.ts';

it.each([
  {
    name: 'equivalent unscoped glyphs collide',
    scopes: [undefined, undefined],
    valid: false,
  },
  {
    name: 'equivalent glyphs in one scope collide',
    scopes: ['x', 'x'],
    valid: false,
  },
  {
    name: 'distinct scopes distinguish quantities',
    scopes: ['x', 'y'],
    valid: true,
  },
  {
    name: 'unscoped and scoped quantities differ',
    scopes: [undefined, 'x'],
    valid: true,
  },
])('$name in CSO and sheet contracts', ({ scopes, valid }) => {
  const symbols = ['Z_web', 'Z_{web}'].map((glyph, index) => ({
    id: `quantity-${index}`,
    glyph,
    description: 'Quantity',
    ...(scopes[index] === undefined ? {} : { notationScope: scopes[index] }),
  }));
  const cso = {
    schemaVersion: '1.0.0',
    title: 'Scoped quantities',
    source: { id: 'scopes', metadata: {} },
    rootSectionIds: ['root'],
    sections: [
      {
        id: 'root',
        title: 'Quantities',
        items: symbols.map((symbol) => ({
          kind: 'symbol',
          symbol: {
            ...symbol,
            valueTree: {
              rootKey: 'n',
              result: { kind: 'number', value: 1 },
              nodes: [
                {
                  key: 'n',
                  mode: 'LITERAL',
                  literal: { kind: 'number', value: 1 },
                },
              ],
            },
          },
        })),
      },
    ],
  };
  const sheet = {
    id: 'scopes',
    title: 'Scoped quantities',
    rootSectionId: 'root',
    sections: [
      {
        id: 'root',
        title: 'Quantities',
        items: symbols.map(({ id }) => ({ kind: 'symbol', id })),
      },
    ],
    symbols: symbols.map((symbol) => ({
      ...symbol,
      valueTree: {
        rootKey: 'n',
        result: { kind: 'number', value: 1 },
        nodes: [
          { key: 'n', kind: 'literal', value: { kind: 'number', value: 1 } },
        ],
      },
    })),
  };
  for (const result of [
    CalculationSourceObjectSchema.safeParse(cso),
    SheetDocumentSchema.safeParse(sheet),
  ]) {
    expect(result.success, JSON.stringify(result)).toBe(valid);
    if (!result.success)
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: expect.arrayContaining(['glyph']),
          params: { diagnosticCode: 'DUPLICATE_GLYPH', symbolId: 'quantity-1' },
        }),
      );
  }
});
