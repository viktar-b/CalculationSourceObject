import {
  safeParseCalculationSourceJson,
} from '@cs-object/core';
import { describe, expect, test } from 'vitest';

type MutableSourceLiteral = Record<string, unknown>;

type MutableSourceNode = Record<string, unknown> & {
  key: string;
  mode: 'LITERAL' | 'SYMBOL' | 'FUNCTION';
};

type MutableSourceSymbol = {
  id: string;
  glyph: string;
  valueTree: {
    rootKey: string;
    result?: MutableSourceLiteral;
    nodes: MutableSourceNode[];
  };
};

type MutableSourceSectionItem =
  | { kind: 'section'; id: string }
  | { kind: 'symbol'; symbol: MutableSourceSymbol }
  | { kind: 'symbolRef'; id: string }
  | { kind: 'figure'; id: string; figure?: Record<string, unknown> }
  | { kind: 'text'; id: string; text?: Record<string, unknown> }
  | { kind: 'unknown'; id?: string; sourceType?: string };

type MutableSourceDetachedItem =
  | { kind: 'symbol'; symbol: MutableSourceSymbol }
  | { kind: 'figure'; id: string; figure: Record<string, unknown> }
  | { kind: 'text'; id: string; text: Record<string, unknown> }
  | { kind: 'unknown'; id?: string; sourceType?: string };

type MutableSource = {
  schemaVersion: '1.0.0';
  title: string;
  source: { id: string; metadata: Record<string, unknown> };
  rootSectionIds: string[];
  sections: {
    id: string;
    title: string;
    items: MutableSourceSectionItem[];
  }[];
  detachedItems?: MutableSourceDetachedItem[];
};

const firstSection = (
  source: MutableSource,
): MutableSource['sections'][number] => {
  const section = source.sections[0];

  if (!section) {
    throw new Error('Expected first section');
  }

  return section;
};

const firstSymbol = (source: MutableSource): MutableSourceSymbol => {
  const item = firstSection(source).items[0];

  if (item?.kind !== 'symbol') {
    throw new Error('Expected first item to be a symbol');
  }

  return item.symbol;
};

const minimalSource = (): MutableSource => ({
  schemaVersion: '1.0.0',
  title: 'Minimal source',
  source: { id: 'source', metadata: {} },
  rootSectionIds: ['root'],
  sections: [
    {
      id: 'root',
      title: 'Root',
      items: [
        {
          kind: 'symbol',
          symbol: {
            id: 'a',
            glyph: 'a',
            valueTree: {
              rootKey: 'root',
              nodes: [
                {
                  key: 'root',
                  mode: 'LITERAL',
                  literal: { kind: 'number', value: 1 },
                },
              ],
            },
          },
        },
      ],
    },
  ],
});

const invalidSourceMessage = (source: unknown): string => {
  const result = safeParseCalculationSourceJson(source);

  if (result.success) {
    throw new Error('Expected calculation source to be invalid');
  }

  return result.error.message;
};

describe('calculation source schema hardening', () => {
  test('rejects unsupported function ids at the source boundary', () => {
    const source = minimalSource();
    const symbol = firstSymbol(source);

    symbol.valueTree.nodes[0] = {
      key: 'root',
      mode: 'FUNCTION',
      funcSpec: { id: 'fg.does-not-exist' },
      funcArgs: [],
    };

    expect(invalidSourceMessage(source)).toContain(
      "Unsupported value function 'fg.does-not-exist'",
    );
  });

  test('rejects extra keys in strict reference and function payloads', () => {
    const cases = [
      {
        label: 'funcSpec',
        mutate: () => {
          const source = minimalSource();
          firstSymbol(source).valueTree.nodes[0] = {
            key: 'root',
            mode: 'FUNCTION',
            funcSpec: { id: 'fg.add', extra: true },
            funcArgs: [],
          };
          return source;
        },
      },
      {
        label: 'funcArgs',
        mutate: () => {
          const source = minimalSource();
          firstSymbol(source).valueTree.nodes[0] = {
            key: 'root',
            mode: 'FUNCTION',
            funcSpec: { id: 'fg.add' },
            funcArgs: [{ key: 'root', extra: true }],
          };
          return source;
        },
      },
      {
        label: 'symbol reference',
        mutate: () => {
          const source = minimalSource();
          firstSymbol(source).valueTree.nodes = [
            {
              key: 'root',
              mode: 'SYMBOL',
              symbol: { id: 'b', extra: true },
            },
          ];
          firstSection(source).items.push({
            kind: 'symbol',
            symbol: {
              id: 'b',
              glyph: 'b',
              valueTree: {
                rootKey: 'b-root',
                nodes: [
                  {
                    key: 'b-root',
                    mode: 'LITERAL',
                    literal: { kind: 'number', value: 2 },
                  },
                ],
              },
            },
          });
          return source;
        },
      },
    ] as const;

    for (const { label, mutate } of cases) {
      const result = safeParseCalculationSourceJson(mutate(), label);

      expect(result.success).toBe(false);

      if (result.success) {
        throw new Error(`Expected ${label} case to be invalid`);
      }

      expect(result.error.message).toContain('Unrecognized key');
      expect(result.error.message).toContain('extra');
    }
  });

  test('keeps preserved figure and text payloads extensible', () => {
    const source = minimalSource();

    firstSection(source).items.push({
      kind: 'figure',
      id: 'figure-1',
      figure: {
        id: 'figure-1',
        sourceType: 'Figure',
        figureURL: 'https://example.invalid/figure.png',
        width: 240,
      },
    });
    source.detachedItems = [
      {
        kind: 'text',
        id: 'text-1',
        text: {
          id: 'text-1',
          sourceType: 'Text',
          value: 'Preserved text payload',
        },
      },
    ];

    expect(safeParseCalculationSourceJson(source).success).toBe(true);
  });

  test('rejects duplicate document-level ids', () => {
    const duplicateSection = minimalSource();
    duplicateSection.sections.push({
      id: 'root',
      title: 'Duplicate root',
      items: [],
    });
    expect(invalidSourceMessage(duplicateSection)).toContain(
      "Duplicate section id 'root'",
    );

    const duplicateRoot = minimalSource();
    duplicateRoot.rootSectionIds.push('root');
    expect(invalidSourceMessage(duplicateRoot)).toContain(
      "Duplicate root section id 'root'",
    );

    const duplicateSymbol = minimalSource();
    firstSection(duplicateSymbol).items.push({
      kind: 'symbol',
      symbol: {
        id: 'a',
        glyph: 'a_2',
        valueTree: {
          rootKey: 'duplicate-root',
          nodes: [
            {
              key: 'duplicate-root',
              mode: 'LITERAL',
              literal: { kind: 'number', value: 2 },
            },
          ],
        },
      },
    });
    expect(invalidSourceMessage(duplicateSymbol)).toContain(
      "Duplicate symbol id 'a'",
    );

    const duplicateDetachedItem = minimalSource();
    duplicateDetachedItem.detachedItems = [
      { kind: 'figure', id: 'detached', figure: { sourceType: 'Figure' } },
      { kind: 'text', id: 'detached', text: { sourceType: 'Text' } },
    ];
    expect(invalidSourceMessage(duplicateDetachedItem)).toContain(
      "Duplicate detached item id 'detached'",
    );
  });

  test('validates symbolRef section items against canonical symbols', () => {
    const source = minimalSource();

    firstSection(source).items.push({ kind: 'symbolRef', id: 'a' });
    expect(safeParseCalculationSourceJson(source).success).toBe(true);

    const missingReference = minimalSource();
    firstSection(missingReference).items.push({
      kind: 'symbolRef',
      id: 'missing-symbol',
    });

    expect(invalidSourceMessage(missingReference)).toContain(
      "Symbol reference item 'missing-symbol' does not resolve",
    );
  });

  test('enforces value-node mode and payload consistency', () => {
    const literalWithFunctionSpec = minimalSource();
    firstSymbol(literalWithFunctionSpec).valueTree.nodes[0] = {
      key: 'root',
      mode: 'LITERAL',
      literal: { kind: 'number', value: 1 },
      funcSpec: { id: 'fg.add' },
    };
    expect(invalidSourceMessage(literalWithFunctionSpec)).toContain(
      'Only FUNCTION nodes may include a function spec',
    );

    const literalWithFunctionArgs = minimalSource();
    firstSymbol(literalWithFunctionArgs).valueTree.nodes[0] = {
      key: 'root',
      mode: 'LITERAL',
      literal: { kind: 'number', value: 1 },
      funcArgs: [{ key: 'root' }],
    };
    expect(invalidSourceMessage(literalWithFunctionArgs)).toContain(
      'Only FUNCTION nodes may include function arguments',
    );

    const literalWithSymbol = minimalSource();
    firstSymbol(literalWithSymbol).valueTree.nodes[0] = {
      key: 'root',
      mode: 'LITERAL',
      literal: { kind: 'number', value: 1 },
      symbol: { id: 'a' },
    };
    expect(invalidSourceMessage(literalWithSymbol)).toContain(
      'Only SYMBOL nodes may include a symbol reference',
    );

    const functionWithoutArgs = minimalSource();
    firstSymbol(functionWithoutArgs).valueTree.nodes[0] = {
      key: 'root',
      mode: 'FUNCTION',
      funcSpec: { id: 'fg.add' },
    };
    expect(invalidSourceMessage(functionWithoutArgs)).toContain(
      'FUNCTION nodes must include funcArgs',
    );
  });

  test('keeps null placeholders and empty non-function funcArgs compatible', () => {
    const source = minimalSource();

    firstSymbol(source).valueTree.nodes[0] = {
      key: 'root',
      mode: 'SYMBOL',
      draft: 'missing',
      symbol: null,
      funcSpec: null,
      funcArgs: [],
      literal: { kind: 'empty' },
    };

    expect(safeParseCalculationSourceJson(source).success).toBe(true);
  });

});
