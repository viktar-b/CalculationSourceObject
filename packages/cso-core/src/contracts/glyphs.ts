const greekNames =
  "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega".split(
    " ",
  );
const greekLetters = [..."αβγδεɛζηθϑικλμνξπρστυϕφχψωΓΔΘΛΞΠΣΦΨΩ"];
const greek = new Map(
  greekNames.map((name, index) => [name, greekLetters[index]]),
);

const tokenPattern = /\\?[A-Za-z]+|[0-9]+|[^\s]/gu;
const subscriptPattern = /^([^_^]+)_(?:\{([^{}]+)\}|([A-Za-z0-9]+))$/;
const basePattern = /^(?:[A-Za-z0-9]+|\\[A-Za-z]+)$/;

/** Match producer normalization without flattening script structure. */
export const glyphIdentity = (glyph: string): string => {
  const tokens = [...glyph.normalize("NFKC").matchAll(tokenPattern)].map(
    ([token]) =>
      (
        greek.get(token.startsWith("\\") ? token.slice(1) : token) ?? token
      ).normalize("NFKC"),
  );
  let index = 0;
  while (index + 2 < tokens.length) {
    const middle = tokens[index + 1];
    if (
      tokens[index] === "{" &&
      tokens[index + 2] === "}" &&
      middle !== undefined &&
      middle !== "{" &&
      middle !== "}"
    ) {
      tokens.splice(index, 3, middle);
      index = Math.max(0, index - 1);
    } else {
      index += 1;
    }
  }
  return JSON.stringify(tokens);
};

export const scopedGlyph = (glyph: string, scope: string): string => {
  // Keep full binding names in evidence and compact initials in the document.
  const displayScope = scope
    .split(",")
    .map((binding) => {
      const words = binding.split("_").filter(Boolean);
      return words.length > 1 ? words.map((word) => word[0]).join("") : binding;
    })
    .join(",");
  const subscript = subscriptPattern.exec(glyph);
  if (subscript) {
    return `${subscript[1]}_{${subscript[2] ?? subscript[3]},${displayScope}}`;
  }
  const base = basePattern.test(glyph) ? glyph : `{${glyph}}`;
  return `${base}_{${displayScope}}`;
};
