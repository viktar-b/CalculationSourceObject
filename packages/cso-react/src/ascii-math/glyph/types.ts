export type AsciiGlyph = readonly AsciiGlyphItem[];

export interface AsciiGlyphGroup {
  readonly __typename: 'AsciiGlyphGroup';
  readonly items: readonly AsciiGlyphItem[];
  readonly lb: string;
  readonly rb: string;
}

export interface AsciiGlyphSubSup {
  readonly __typename: 'AsciiGlyphSubSup';
  readonly base: AsciiGlyphPrimitive;
  readonly subscript: AsciiGlyphPrimitive | undefined;
  readonly superscript: AsciiGlyphPrimitive | undefined;
}

export interface AsciiGlyphDivision {
  readonly __typename: 'AsciiGlyphDivision';
  readonly numerator: AsciiGlyphSubSup;
  readonly denominator: AsciiGlyphSubSup;
}

export type AsciiGlyphItem = AsciiGlyphSubSup | AsciiGlyphDivision;

export type AsciiGlyphPrimitive = AsciiGlyphV | AsciiGlyphGroup;

export interface AsciiGlyphV {
  readonly __typename: 'AsciiGlyphV';
  readonly value: string;
  readonly knownString?: string;
}
