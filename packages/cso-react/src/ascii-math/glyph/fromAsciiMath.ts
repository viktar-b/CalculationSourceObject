import type {
  AsciiMathExpression,
  AsciiMathExpressionDivision,
  AsciiMathExpressionSequence,
  AsciiMathExpressionSimple,
  AsciiMathGroup,
  AsciiMathNumber,
  AsciiMathString,
  AsciiMathSubscriptSuperscript,
} from '../parser/types.ts';
import {
  processGlyphBracket,
  processKnownGlyphString,
} from './known-symbols.ts';
import type {
  AsciiGlyphDivision,
  AsciiGlyphGroup,
  AsciiGlyphItem,
  AsciiGlyphPrimitive,
  AsciiGlyphSubSup,
  AsciiGlyphV,
} from './types.ts';

const assertNever = (value: never): never => {
  throw new Error(`Unhandled ASCII math node: ${JSON.stringify(value)}`);
};

const glyphDivision = (
  numerator: AsciiGlyphSubSup,
  denominator: AsciiGlyphSubSup,
): AsciiGlyphDivision => ({
  __typename: 'AsciiGlyphDivision',
  numerator,
  denominator,
});

const glyphGroup = (
  items: readonly AsciiGlyphItem[],
  lb: string,
  rb: string,
): AsciiGlyphGroup => ({
  __typename: 'AsciiGlyphGroup',
  items,
  lb,
  rb,
});

const glyphSubSup = (
  base: AsciiGlyphPrimitive,
  subscript: AsciiGlyphPrimitive | undefined,
  superscript: AsciiGlyphPrimitive | undefined,
): AsciiGlyphSubSup => ({
  __typename: 'AsciiGlyphSubSup',
  base,
  subscript,
  superscript,
});

const glyphValue = (value: string, knownString?: string): AsciiGlyphV => ({
  __typename: 'AsciiGlyphV',
  value,
  knownString,
});

export const glyphFromAsciiMath = (
  asciiMathParsed: AsciiMathExpression,
): readonly AsciiGlyphItem[] => {
  const parsedGlyph = glyphFromExpressionSequence(asciiMathParsed);
  return processParsedGlyph(parsedGlyph);
};

const glyphFromExpressionSequence = (
  asciiMathParsed: AsciiMathExpressionSequence,
): readonly AsciiGlyphItem[] => {
  const left =
    asciiMathParsed.left.type === 'SubscriptSuperscript'
      ? glyphFromSubscriptSuperscript(asciiMathParsed.left)
      : glyphFromDivision(asciiMathParsed.left);
  const right =
    asciiMathParsed.right && glyphFromExpressionSequence(asciiMathParsed.right);

  return right ? [left, ...right] : [left];
};

const glyphFromDivision = (
  asciiMathParsed: AsciiMathExpressionDivision,
): AsciiGlyphDivision => {
  return glyphDivision(
    glyphFromSubscriptSuperscript(asciiMathParsed.numerator),
    glyphFromSubscriptSuperscript(asciiMathParsed.denominator),
  );
};

const glyphFromSubscriptSuperscript = (
  asciiMathParsed: AsciiMathSubscriptSuperscript,
): AsciiGlyphSubSup => {
  return glyphSubSup(
    glyphFromSimpleExpression(asciiMathParsed.base),
    asciiMathParsed.subscript &&
      glyphFromSimpleExpression(asciiMathParsed.subscript, true),
    asciiMathParsed.superscript &&
      glyphFromSimpleExpression(asciiMathParsed.superscript, true),
  );
};

const glyphFromSimpleExpression = (
  asciiMathParsed: AsciiMathExpressionSimple,
  stripBrackets = false,
): AsciiGlyphPrimitive => {
  switch (asciiMathParsed.type) {
    case 'NumberFloat':
    case 'NumberInteger':
      return glyphFromNumber(asciiMathParsed);
    case 'StrVarname':
      return glyphFromVarname(asciiMathParsed);
    case 'StrChar':
    case 'StrLine':
      return glyphFromKnownString(asciiMathParsed);
    case 'StrQuoted':
      return glyphFromQuotedString(asciiMathParsed);
    case 'CmdGroup':
      return glyphFromGroup(asciiMathParsed, stripBrackets);
    default:
      return assertNever(asciiMathParsed);
  }
};

const glyphFromNumber = (asciiMathParsed: AsciiMathNumber): AsciiGlyphV => {
  return glyphValue(asciiMathParsed.value);
};

const glyphFromKnownString = (
  asciiMathParsed: AsciiMathString,
): AsciiGlyphV => {
  return glyphValue(asciiMathParsed.value, asciiMathParsed.value);
};

const glyphFromQuotedString = (
  asciiMathParsed: AsciiMathString,
): AsciiGlyphV => {
  const value = asciiMathParsed.value
    .substring(1, asciiMathParsed.value.length - 1)
    .replace(/(?:\\(.))/g, '$1');

  return glyphValue(value);
};

const glyphFromVarname = (asciiMathParsed: AsciiMathString): AsciiGlyphV => {
  return glyphValue(asciiMathParsed.value);
};

const glyphFromGroup = (
  asciiMathParsed: AsciiMathGroup,
  stripBrackets: boolean,
): AsciiGlyphGroup => {
  const expression = glyphFromExpressionSequence(asciiMathParsed.expression);
  const isStructuralBraceGroup =
    asciiMathParsed.lBracket === '{' && asciiMathParsed.rBracket === '}';

  return stripBrackets || isStructuralBraceGroup
    ? glyphGroup(expression, '', '')
    : glyphGroup(
        expression,
        asciiMathParsed.lBracket,
        asciiMathParsed.rBracket,
      );
};

const processParsedGlyph = (
  parsedGlyph: readonly AsciiGlyphItem[],
): readonly AsciiGlyphItem[] => {
  return parsedGlyph.map((glyphItem) => {
    switch (glyphItem.__typename) {
      case 'AsciiGlyphSubSup':
        return processParsedGlyphSubSup(glyphItem);
      case 'AsciiGlyphDivision':
        return processParsedGlyphDivision(glyphItem);
      default:
        return assertNever(glyphItem);
    }
  });
};

const processParsedGlyphSubSup = (
  glyphItem: AsciiGlyphSubSup,
): AsciiGlyphSubSup => ({
  __typename: 'AsciiGlyphSubSup',
  base: processParsedGlyphPrimitive(glyphItem.base),
  subscript:
    glyphItem.subscript && processParsedGlyphPrimitive(glyphItem.subscript),
  superscript:
    glyphItem.superscript && processParsedGlyphPrimitive(glyphItem.superscript),
});

const processParsedGlyphDivision = (
  glyphItem: AsciiGlyphDivision,
): AsciiGlyphDivision => ({
  __typename: 'AsciiGlyphDivision',
  numerator: processParsedGlyphSubSup(glyphItem.numerator),
  denominator: processParsedGlyphSubSup(glyphItem.denominator),
});

const processParsedGlyphPrimitive = (
  glyphItem: AsciiGlyphPrimitive,
): AsciiGlyphPrimitive => {
  switch (glyphItem.__typename) {
    case 'AsciiGlyphGroup':
      return processParsedGlyphGroup(glyphItem);
    case 'AsciiGlyphV':
      return processParsedGlyphValue(glyphItem);
    default:
      return assertNever(glyphItem);
  }
};

const processParsedGlyphGroup = (
  glyphItem: AsciiGlyphGroup,
): AsciiGlyphGroup => ({
  __typename: 'AsciiGlyphGroup',
  items: processParsedGlyph(glyphItem.items),
  lb: glyphItem.lb && processGlyphBracket(glyphItem.lb),
  rb: glyphItem.rb && processGlyphBracket(glyphItem.rb),
});

const processParsedGlyphValue = (glyphItem: AsciiGlyphV): AsciiGlyphV => ({
  __typename: 'AsciiGlyphV',
  value: glyphItem.knownString
    ? processKnownGlyphString(glyphItem.knownString)
    : glyphItem.value,
  knownString: glyphItem.knownString,
});
