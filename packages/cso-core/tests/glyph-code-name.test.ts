import { execFileSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { deriveGlyphCodeName } from '../src/sheet-model/glyphCodeName.ts';

test.each([
  ['K_(y_1)', 'K_y_1'],
  ['A^{2}', 'A_2'],
  ['A_[x]', 'A_x'],
  ['A_(x)B^{2}', 'A_xB_2'],
  ['A_(x]B', 'A_xB'],
  ['A_()B', 'A_B'],
  ['A_((x))B', 'A_x_B'],
  ['A_(x', 'A_x'],
  ['A_()_(x)', 'A_x'],
])('derives the code name for %s', (glyph, expected) => {
  expect(deriveGlyphCodeName({ glyph, id: 'fallback-id' })).toBe(expected);
});

test('handles long unmatched glyphs without repeatedly scanning their suffixes', () => {
  const moduleUrl = new URL(
    '../src/sheet-model/glyphCodeName.ts',
    import.meta.url,
  );
  // Run separately so a quadratic-time regression can be terminated even
  // though synchronous parsing would block the test runner's own timeout.
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
        import { deriveGlyphCodeName } from ${JSON.stringify(moduleUrl.href)};
        const malformed = '^(' + '^(('.repeat(100_000);
        process.stdout.write(JSON.stringify([
          deriveGlyphCodeName({ glyphPlaintext: malformed, glyph: 'A_(x)', id: 'fallback-id' }),
          deriveGlyphCodeName({ glyph: malformed, id: 'fallback-id' }),
          deriveGlyphCodeName({ id: malformed }),
          deriveGlyphCodeName({ glyph: 'A' + malformed + 'Z', id: 'fallback-id' }),
        ]));
      `,
    ],
    { encoding: 'utf8', timeout: 5_000 },
  );

  expect(JSON.parse(output)).toEqual(['A_x', 'fallback_id', 'symbol', 'A_Z']);
}, 10_000);
