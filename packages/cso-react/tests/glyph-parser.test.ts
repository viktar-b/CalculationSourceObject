import { describe, expect, test } from 'vitest';
import { glyphFromAsciiMathString } from '../src/ascii-math/glyph/fromAsciiMathString.ts';
import type {
  AsciiGlyph,
  AsciiGlyphPrimitive,
} from '../src/ascii-math/glyph/types.ts';

const flattenPrimitive = (primitive: AsciiGlyphPrimitive): string => {
  switch (primitive.__typename) {
    case 'AsciiGlyphGroup':
      return `${primitive.lb}${primitive.items.map(flattenGlyph).join('')}${primitive.rb}`;
    case 'AsciiGlyphV':
      return primitive.value;
    default:
      return '';
  }
};

const flattenGlyph = (glyph: AsciiGlyph[number]): string => {
  if (glyph.__typename === 'AsciiGlyphDivision') {
    return `${flattenGlyph(glyph.numerator)}/${flattenGlyph(glyph.denominator)}`;
  }

  return [
    flattenPrimitive(glyph.base),
    glyph.subscript ? flattenPrimitive(glyph.subscript) : '',
    glyph.superscript ? flattenPrimitive(glyph.superscript) : '',
  ].join('');
};

const flatten = (glyph: AsciiGlyph): string => glyph.map(flattenGlyph).join('');

describe('glyphFromAsciiMathString', () => {
  test('parses plain known symbols and brace grouped subscripts', () => {
    const glyph = glyphFromAsciiMathString('emptyset_{l1,tens}');

    expect(flatten(glyph)).toBe('∅l1,tens');
    expect(glyph[0]?.__typename).toBe('AsciiGlyphSubSup');
    const firstGlyph = glyph[0];
    expect(
      firstGlyph?.__typename === 'AsciiGlyphSubSup' &&
        firstGlyph.subscript?.__typename,
    ).toBe('AsciiGlyphGroup');
  });

  test('parses plain and backslash Greek names, plain text, and units with powers', () => {
    expect(flatten(glyphFromAsciiMathString('Delta c_{dur,gamma}'))).toBe(
      'Δcdur,γ',
    );
    expect(flatten(glyphFromAsciiMathString('\\Delta c_{dur,\\gamma}'))).toBe(
      'Δcdur,γ',
    );
    expect(flatten(glyphFromAsciiMathString('\\delta'))).toBe('δ');
    expect(flatten(glyphFromAsciiMathString('mm^2'))).toBe('mm2');
  });

  test('renders unsupported commands and unsupported grouping syntax as text', () => {
    expect(flatten(glyphFromAsciiMathString('sqrt x'))).toBe('sqrtx');
    expect(flatten(glyphFromAsciiMathString('\\sqrt x'))).toBe('\\sqrtx');
    expect(flatten(glyphFromAsciiMathString('omega_(abc)delta'))).toBe(
      'ω_(abc)δ',
    );
  });

  test('uses braces as invisible groups and parentheses as visible groups', () => {
    const braceGroupedFraction = glyphFromAsciiMathString('{M1+M2}/m_3');
    const parenGroupedFraction = glyphFromAsciiMathString('(M1+M2)/m_3');

    expect(flatten(braceGroupedFraction)).toBe('M1+M2/m3');
    expect(flatten(parenGroupedFraction)).toBe('(M1+M2)/m3');
    expect(braceGroupedFraction[0]?.__typename).toBe('AsciiGlyphDivision');
    expect(parenGroupedFraction[0]?.__typename).toBe('AsciiGlyphDivision');

    const braceNumerator =
      braceGroupedFraction[0]?.__typename === 'AsciiGlyphDivision'
        ? braceGroupedFraction[0].numerator.base
        : undefined;
    const parenNumerator =
      parenGroupedFraction[0]?.__typename === 'AsciiGlyphDivision'
        ? parenGroupedFraction[0].numerator.base
        : undefined;

    expect(braceNumerator?.__typename).toBe('AsciiGlyphGroup');
    expect(parenNumerator?.__typename).toBe('AsciiGlyphGroup');
    expect(
      braceNumerator?.__typename === 'AsciiGlyphGroup' && braceNumerator.lb,
    ).toBe('');
    expect(
      parenNumerator?.__typename === 'AsciiGlyphGroup' && parenNumerator.lb,
    ).toBe('(');
    const braceDenominator =
      braceGroupedFraction[0]?.__typename === 'AsciiGlyphDivision'
        ? braceGroupedFraction[0].denominator
        : undefined;
    const parenDenominator =
      parenGroupedFraction[0]?.__typename === 'AsciiGlyphDivision'
        ? parenGroupedFraction[0].denominator
        : undefined;

    expect(braceDenominator?.subscript).toMatchObject({
      __typename: 'AsciiGlyphV',
      value: '3',
    });
    expect(parenDenominator?.subscript).toMatchObject({
      __typename: 'AsciiGlyphV',
      value: '3',
    });
  });
});
