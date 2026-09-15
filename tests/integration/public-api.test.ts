import {
  SheetDocumentSchema,
  createSheetFromValueTreeJson,
  parseValueTreeJson,
  safeParseValueTreeJson,
} from '@cs-object/core';
import { describe, expect, test } from 'vitest';

const minimalValueTreeDocument = {
  title: 'Minimal API sheet',
  sections: [
    {
      title: 'Calculations',
      symbols: [
        {
          id: 'area',
          glyph: 'A',
          unit: 'mm^2',
          description: 'Area',
          result: 12,
          valueTree: [{ key: 'area-value', literal: 12 }],
        },
      ],
    },
  ],
};

describe('public API', () => {
  test('converts value-tree JSON into a FormulaSheet render contract', () => {
    const parsed = parseValueTreeJson(minimalValueTreeDocument);
    const example = createSheetFromValueTreeJson(parsed, {
      id: 'minimal-api-sheet',
      label: 'Minimal API sheet',
      flattenSingleSection: true,
    });

    expect(SheetDocumentSchema.safeParse(example.sheet).success).toBe(true);
    expect(example.sheet.symbols[0]?.id).toBe('area');
    expect(example.diagnostics).toMatchObject({
      compactSections: 1,
      compactSymbols: 1,
      formulaCount: 0,
    });
  });

  test('rejects unknown value-tree function ids', () => {
    const result = safeParseValueTreeJson({
      sections: [
        {
          symbols: [
            {
              id: 'bad',
              valueTree: [
                { key: 'root', function: 'missing.fn', arguments: [] },
              ],
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
