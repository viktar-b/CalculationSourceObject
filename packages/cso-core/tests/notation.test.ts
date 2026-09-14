import { describe, expect, test } from 'vitest';
import {
  CalculationSourceObjectSchema,
  SheetDocumentSchema,
  notationIdentity,
  parseNotation,
} from '../src/index.ts';

const parsed = (source: string) => {
  const result = parseNotation(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.diagnostic.message);
  return result.value;
};

const valueTree = {
  rootKey: 'value',
  result: { kind: 'number', value: 1 },
  nodes: [
    {
      key: 'value',
      mode: 'LITERAL',
      literal: { kind: 'number', value: 1 },
      result: { kind: 'number', value: 1 },
    },
  ],
} as const;

describe('notation parser', () => {
  test('resolves complete aliases without stealing word prefixes', () => {
    expect(parsed('O/ o+ o.')).toEqual([
      { kind: 'operator', value: '∅' },
      { kind: 'operator', value: '⊕' },
      { kind: 'operator', value: '⊙' },
    ]);
    expect(parsed('oxygen ooops xxValue !index')).toEqual([
      { kind: 'identifier', value: 'oxygen' },
      { kind: 'identifier', value: 'ooops' },
      { kind: 'identifier', value: 'xxValue' },
      { kind: 'text', value: '!' },
      { kind: 'identifier', value: 'index' },
    ]);
  });

  test('classifies aliases before fraction and script syntax', () => {
    expect(parsed('a // b')).toEqual([
      { kind: 'identifier', value: 'a' },
      { kind: 'operator', value: '/' },
      { kind: 'identifier', value: 'b' },
    ]);
    expect(parsed('x _|_ y')).toEqual([
      { kind: 'identifier', value: 'x' },
      { kind: 'operator', value: '⊥' },
      { kind: 'identifier', value: 'y' },
    ]);
  });

  test('retains roles, groups, scripts, and complete Unicode scalars', () => {
    expect(parsed('123 + "x" 𝛼')).toEqual([
      { kind: 'number', value: '123' },
      { kind: 'operator', value: '+' },
      { kind: 'text', value: 'x' },
      { kind: 'identifier', value: '𝛼' },
    ]);
    expect(parsed('A_{rect}')).toMatchObject([
      {
        kind: 'subscript',
        base: { kind: 'identifier', value: 'A' },
        subscript: {
          kind: 'group',
          fence: 'none',
          body: [{ kind: 'identifier', value: 'rect' }],
        },
      },
    ]);
  });

  test('returns bounded diagnostics for malformed and excessive input', () => {
    expect(parseNotation('N/')).toMatchObject({
      ok: false,
      diagnostic: { code: 'MISSING_FRACTION_DENOMINATOR' },
    });
    for (const source of ['A}', 'A)', 'A]', 'a/]']) {
      expect(parseNotation(source)).toMatchObject({
        ok: false,
        diagnostic: { code: 'UNEXPECTED_CLOSING_GROUP' },
      });
    }
    expect(parseNotation('\ud800')).toMatchObject({
      ok: false,
      diagnostic: { code: 'INVALID_UNICODE', offset: 0 },
    });
    expect(parseNotation('A\0')).toMatchObject({
      ok: false,
      diagnostic: { code: 'INVALID_CONTROL_CHARACTER', offset: 1 },
    });
    expect(parseNotation('x'.repeat(32_769))).toMatchObject({
      ok: false,
      diagnostic: { code: 'NOTATION_SOURCE_LIMIT' },
    });
    expect(parseNotation('x'.repeat(65_537))).toMatchObject({
      ok: false,
      diagnostic: { code: 'NOTATION_SOURCE_LIMIT' },
    });
    expect(parseNotation('%'.repeat(16_385))).toMatchObject({
      ok: false,
      diagnostic: { code: 'NOTATION_NODE_LIMIT' },
    });
    expect(parseNotation(`${'{'.repeat(65)}x${'}'.repeat(65)}`)).toMatchObject({
      ok: false,
      diagnostic: { code: 'NOTATION_DEPTH_LIMIT' },
    });
  });

  test('derives identity from effective display style and structure', () => {
    expect(notationIdentity(parsed('A_{rect}'))).toBe(
      notationIdentity(parsed('A_{"rect"}')),
    );
    expect(notationIdentity(parsed('"x"'))).not.toBe(
      notationIdentity(parsed('x')),
    );
    expect(notationIdentity(parsed('{a {b c}}'))).toBe(
      notationIdentity(parsed('{a b c}')),
    );
    for (const [plain, italic] of [
      ['x', '𝑥'],
      ['h', 'ℎ'],
      ['β', '𝛽'],
      ['ϑ', '𝜗'],
    ]) {
      expect(notationIdentity(parsed(plain))).toBe(
        notationIdentity(parsed(italic)),
      );
    }
    expect(notationIdentity(parsed('x'))).not.toBe(
      notationIdentity(parsed('𝐱')),
    );
    expect(notationIdentity(parsed('R'))).not.toBe(
      notationIdentity(parsed('ℝ')),
    );
    expect(notationIdentity(parsed('Θ'))).not.toBe(
      notationIdentity(parsed('𝛳')),
    );
    expect(notationIdentity(parsed('θ'))).not.toBe(
      notationIdentity(parsed('𝜗')),
    );
    expect(notationIdentity(parsed('"𝑥"'))).not.toBe(
      notationIdentity(parsed('"x"')),
    );
    expect(parsed('࢏')).toEqual([{ kind: 'text', value: '࢏' }]);
  });

  test('returns independent alias nodes on every parse', () => {
    const first = parsed('alpha alpha') as { kind: string; value: string }[];
    expect(first[0]).not.toBe(first[1]);
    if (first[0] !== undefined) first[0].value = 'CORRUPTED';
    expect(first[1]).toEqual({ kind: 'identifier', value: 'α' });
    expect(parsed('alpha')).toEqual([{ kind: 'identifier', value: 'α' }]);
    expect(parsed('α')).toEqual([{ kind: 'identifier', value: 'α' }]);
  });
});

describe('notation contract boundaries', () => {
  test.each([
    ['glyph', 'N/', ''],
    ['control glyph', 'A\0', ''],
    ['unit', 'F', 'N/'],
    ['whitespace unit', 'F', '   '],
  ])('safe parsing reports invalid %s notation', (_, glyph, unit) => {
    const result = CalculationSourceObjectSchema.safeParse({
      schemaVersion: '1.0.0',
      title: 'Notation',
      source: { id: 'notation', metadata: {} },
      rootSectionIds: ['root'],
      sections: [
        {
          id: 'root',
          title: 'Notation',
          items: [
            {
              kind: 'symbol',
              symbol: {
                id: 'force',
                glyph,
                unit,
                valueTree,
              },
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'custom',
            params: expect.objectContaining({
              diagnosticCode: 'INVALID_NOTATION',
              symbolId: 'force',
            }),
          }),
        ]),
      );
  });

  test('accepts an absent unit and rejects distinct display-colliding symbols', () => {
    const symbol = (id: string, glyph: string) => ({
      id,
      glyph,
      description: id,
      unit: '',
      valueTree: {
        rootKey: `${id}-value`,
        result: { kind: 'number' as const, value: 1 },
        nodes: [
          {
            kind: 'literal' as const,
            key: `${id}-value`,
            value: { kind: 'number' as const, value: 1 },
          },
        ],
      },
    });
    const result = SheetDocumentSchema.safeParse({
      id: 'notation',
      title: 'Notation',
      rootSectionId: 'root',
      sections: [
        {
          id: 'root',
          title: 'Notation',
          items: [
            { kind: 'symbol', id: 'left' },
            { kind: 'symbol', id: 'right' },
          ],
        },
      ],
      symbols: [symbol('left', 'times'), symbol('right', 'xx')],
    });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            params: expect.objectContaining({
              diagnosticCode: 'DUPLICATE_GLYPH',
              symbolId: 'right',
            }),
          }),
        ]),
      );
  });
});
