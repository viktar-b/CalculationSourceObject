import { expect, it } from 'vitest';
import { glyphIdentity, scopedGlyph } from '../src/contracts/glyphs.ts';
it("preserves existing scripts and distinguishes full nested call paths", () => {
  expect(scopedGlyph("A_s", "a,child")).toBe("A_{s,a,child}");
  expect(scopedGlyph("A_{s}", "b,child")).toBe("A_{s,b,child}");
  expect(scopedGlyph("A^2", "a")).toBe("{A^2}_{a}");
  expect(scopedGlyph("A_{rectangle}", "first_panel")).toBe("A_{rectangle,fp}");
  expect(scopedGlyph("A_{rectangle}", "frame,second_panel")).toBe(
    "A_{rectangle,frame,sp}",
  );
  expect(glyphIdentity(" A_{a} ")).toBe(glyphIdentity("A_a"));
  expect(glyphIdentity("\\rho")).toBe(glyphIdentity("rho"));
  expect(glyphIdentity("rho")).toBe(glyphIdentity("ρ"));
  expect(glyphIdentity("A_{ab}")).toBe(glyphIdentity("A_ab"));
  expect(glyphIdentity("A_{ab}")).not.toBe(glyphIdentity("A_a b"));
});
