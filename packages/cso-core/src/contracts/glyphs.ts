import { notationIdentity } from '../notation/identity.ts';
import { parseNotation } from '../notation/parse.ts';

const subscriptPattern = /^([^_^]+)_(?:\{([^{}]+)\}|([A-Za-z0-9]+))$/;
const basePattern = /^(?:[A-Za-z0-9]+|\\[A-Za-z]+)$/;

/** Return display identity for already validated glyph notation. */
export const glyphIdentity = (glyph: string): string => {
  const parsed = parseNotation(glyph);
  return parsed.ok
    ? notationIdentity(parsed.value)
    : JSON.stringify(['invalid-notation', glyph]);
};

export const scopedGlyph = (glyph: string, scope: string): string => {
  // Keep full binding names in evidence and compact initials in the document.
  const displayScope = scope
    .split(',')
    .map((binding) => {
      const words = binding.split('_').filter(Boolean);
      return words.length > 1
        ? words.map((word) => [...word][0]).join('')
        : binding;
    })
    .join(',');
  const subscript = subscriptPattern.exec(glyph);
  if (subscript) {
    return `${subscript[1]}_{${subscript[2] ?? subscript[3]},${displayScope}}`;
  }
  const base = basePattern.test(glyph) ? glyph : `{${glyph}}`;
  return `${base}_{${displayScope}}`;
};
