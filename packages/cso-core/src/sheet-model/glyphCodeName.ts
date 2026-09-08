const groupedScriptPattern = /[_^][({[]([^)}\]]+)[)}\]]/g;
const bareScriptPattern = /[_^]([A-Za-z0-9]+)/g;

const removeNonAscii = (value: string): string =>
  [...value].filter((char) => char.charCodeAt(0) <= 127).join('');

const toAsciiCodeName = (value: string): string =>
  removeNonAscii(value)
    .trim()
    .normalize('NFKD')
    .replace(groupedScriptPattern, '_$1')
    .replace(bareScriptPattern, '_$1')
    .replace(/[{}()[\]]+/g, '_')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

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
