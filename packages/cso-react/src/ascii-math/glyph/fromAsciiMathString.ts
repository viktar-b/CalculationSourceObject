import { parseAsciiMath } from '../parser/parseAsciiMath.ts';
import { glyphFromAsciiMath } from './fromAsciiMath.ts';
import type { AsciiGlyph } from './types.ts';

export const glyphFromAsciiMathString = (
  asciiMathString: string,
): AsciiGlyph => {
  return glyphFromAsciiMath(parseAsciiMath(asciiMathString));
};
