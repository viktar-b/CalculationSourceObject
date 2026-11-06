const bareScriptPattern = /[_^]([A-Za-z0-9]+)/g;
const scriptOpeners = new Set(['(', '{', '[']);
const scriptClosers = new Set([')', '}', ']']);

const replaceGroupedScripts = (value: string): string => {
  const parts: string[] = [];
  let unchangedStart = 0;
  let index = 0;

  while (index < value.length) {
    const char = value[index];
    if (
      (char !== '_' && char !== '^') ||
      !scriptOpeners.has(value.charAt(index + 1))
    ) {
      index += 1;
      continue;
    }

    const contentStart = index + 2;
    let end = contentStart;
    while (end < value.length && !scriptClosers.has(value[end])) {
      end += 1;
    }

    // No later group can close either. Preserve the remaining input without
    // rescanning each opening delimiter in an unmatched suffix.
    if (end === value.length) break;

    // Match the former regex: groups need content, and any closer ends them,
    // even when delimiters are mismatched or the content contains openers.
    if (end === contentStart) {
      index += 1;
      continue;
    }

    parts.push(
      value.slice(unchangedStart, index),
      '_',
      value.slice(contentStart, end),
    );
    index = end + 1;
    unchangedStart = index;
  }

  parts.push(value.slice(unchangedStart));
  return parts.join('');
};

const removeNonAscii = (value: string): string =>
  [...value].filter((char) => char.charCodeAt(0) <= 127).join('');

const toAsciiCodeName = (value: string): string =>
  replaceGroupedScripts(removeNonAscii(value).trim().normalize('NFKD'))
    .replace(bareScriptPattern, '_$1')
    .replace(/[{}()[\]]+/g, '_')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

export const deriveGlyphCodeName = ({
  glyph,
  glyphPlaintext,
  id,
}: {
  readonly glyph?: string;
  readonly glyphPlaintext?: string;
  readonly id: string;
}): string =>
  toAsciiCodeName(glyphPlaintext ?? '') ||
  toAsciiCodeName(glyph ?? '') ||
  toAsciiCodeName(id) ||
  'symbol';
