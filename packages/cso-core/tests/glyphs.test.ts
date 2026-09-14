import { expect, it } from 'vitest';
import { glyphIdentity, scopedGlyph } from '../src/contracts/glyphs.ts';
it('preserves existing scripts and distinguishes full nested call paths', () => {
  expect(scopedGlyph('A_s', 'a,child')).toBe('A_{s,a,child}');
  expect(scopedGlyph('A_{s}', 'b,child')).toBe('A_{s,b,child}');
  expect(scopedGlyph('A^2', 'a')).toBe('{A^2}_{a}');
  expect(scopedGlyph('A_{rectangle}', 'first_panel')).toBe('A_{rectangle,fp}');
  expect(scopedGlyph('A_{rectangle}', 'frame,second_panel')).toBe(
    'A_{rectangle,frame,sp}',
  );
  expect(scopedGlyph('R', '𐐀_panel')).toBe('R_{𐐀p}');
  expect(glyphIdentity(' A_{a} ')).toBe(glyphIdentity('A_a'));
  expect(glyphIdentity('\\rho')).toBe(glyphIdentity('rho'));
  expect(glyphIdentity('rho')).toBe(glyphIdentity('ρ'));
  expect(glyphIdentity('A_{ab}')).toBe(glyphIdentity('A_ab'));
  expect(glyphIdentity('A_{ab}')).not.toBe(glyphIdentity('A_a b'));
});

it('uses resolved display structure for glyph identity', () => {
  expect(glyphIdentity('times')).toBe(glyphIdentity('xx'));
  expect(glyphIdentity('emptyset')).toBe(glyphIdentity('O/'));
  expect(glyphIdentity('!index')).not.toBe(glyphIdentity('notin dex'));
  expect(glyphIdentity('A_{rect}')).toBe(glyphIdentity('A_{"rect"}'));
  expect(glyphIdentity('"x"')).not.toBe(glyphIdentity('x'));
  expect(glyphIdentity('"alpha"')).not.toBe(glyphIdentity('"α"'));
  expect(glyphIdentity('{a+b}/c')).not.toBe(glyphIdentity('a+b/c'));
  expect(glyphIdentity('A_(rect)')).not.toBe(glyphIdentity('A_{rect}'));
  expect(glyphIdentity('{a {b c}}')).toBe(glyphIdentity('{a b c}'));
});

it('normalizes selected mathematical presentation letters without erasing symbols', () => {
  expect(glyphIdentity('𝛼')).toBe(glyphIdentity('α'));
  expect(glyphIdentity('ℝ')).not.toBe(glyphIdentity('R'));
  expect(glyphIdentity('"𝛼"')).not.toBe(glyphIdentity('"α"'));
});
