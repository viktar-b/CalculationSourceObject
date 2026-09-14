import type { NotationIdentifier, NotationOperator } from './types.ts';

type NotationAlias = NotationIdentifier | NotationOperator;

const alias = (
  kind: NotationAlias['kind'],
  value: string,
  spellings: readonly string[],
): readonly [NotationAlias, readonly string[]] => [{ kind, value }, spellings];

const aliasGroups = [
  alias('operator', '+', ['+']),
  alias('operator', '−', ['-']),
  alias('operator', '⋅', ['*', 'cdot']),
  alias('operator', '*', ['**', 'ast']),
  alias('operator', '⋆', ['***', 'star']),
  alias('operator', '/', ['//']),
  alias('operator', '\\', ['\\\\', 'backslash', 'setminus']),
  alias('operator', '×', ['xx', 'times']),
  alias('operator', '÷', ['-:', 'div']),
  alias('operator', '⋉', ['|><', 'ltimes']),
  alias('operator', '⋊', ['><|', 'rtimes']),
  alias('operator', '⋈', ['|><|', 'bowtie']),
  alias('operator', '∘', ['@', 'circ']),
  alias('operator', '⊕', ['o+', 'oplus']),
  alias('operator', '⊗', ['ox', 'otimes']),
  alias('operator', '⊙', ['o.', 'odot']),
  alias('operator', '∑', ['sum']),
  alias('operator', '∏', ['prod']),
  alias('operator', '∧', ['^^', 'wedge']),
  alias('operator', '⋀', ['^^^', 'bigwedge']),
  alias('operator', '∨', ['vv', 'vee']),
  alias('operator', '⋁', ['vvv', 'bigvee']),
  alias('operator', '∩', ['nn', 'cap']),
  alias('operator', '⋂', ['nnn', 'bigcap']),
  alias('operator', '∪', ['uu', 'cup']),
  alias('operator', '⋃', ['uuu', 'bigcup']),
  alias('operator', '∫', ['int']),
  alias('operator', '∮', ['oint']),
  alias('operator', '∂', ['del', 'partial']),
  alias('operator', '∇', ['grad', 'nabla']),
  alias('operator', '±', ['+-', 'pm']),
  alias('operator', '∅', ['O/', 'emptyset']),
  alias('operator', '∞', ['oo', 'infty']),
  alias('identifier', 'ℵ', ['aleph']),
  alias('operator', '∴', [':.', 'therefore']),
  alias('operator', '∵', [":'", 'because']),
  alias('operator', '|...|', ['|...|', '|ldots|']),
  alias('operator', '|⋯|', ['|cdots|']),
  alias('operator', '⋮', ['vdots']),
  alias('operator', '⋱', ['ddots']),
  alias('operator', '∠', ['/_', 'angle']),
  alias('operator', '⌢', ['frown']),
  alias('operator', '△', ['/_\\', 'triangle']),
  alias('operator', '⋄', ['diamond']),
  alias('operator', '□', ['square']),
  alias('operator', '⌊', ['|__', 'lfloor']),
  alias('operator', '⌋', ['__|', 'rfloor']),
  alias('operator', '⌈', ['|~', 'lceiling']),
  alias('operator', '⌉', ['~|', 'rceiling']),
  alias('identifier', 'ℂ', ['CC']),
  alias('identifier', 'ℕ', ['NN']),
  alias('identifier', 'ℚ', ['QQ']),
  alias('identifier', 'ℝ', ['RR']),
  alias('identifier', 'ℤ', ['ZZ']),
  alias('operator', '=', ['=']),
  alias('operator', '≠', ['!=', 'ne']),
  alias('operator', '<', ['<', 'lt']),
  alias('operator', '>', ['>', 'gt']),
  alias('operator', '≤', ['<=', 'le']),
  alias('operator', '≥', ['>=', 'ge']),
  alias('operator', '≪', ['mlt', 'll']),
  alias('operator', '≫', ['mgt', 'gg']),
  alias('operator', '≺', ['-<', 'prec']),
  alias('operator', '⪯', ['-<=', 'preceq']),
  alias('operator', '≻', ['>-', 'succ']),
  alias('operator', '⪰', ['>-=', 'succeq']),
  alias('operator', '∈', ['in']),
  alias('operator', '∉', ['!in', 'notin']),
  alias('operator', '⊂', ['sub', 'subset']),
  alias('operator', '⊃', ['sup', 'supset']),
  alias('operator', '⊆', ['sube', 'subseteq']),
  alias('operator', '⊇', ['supe', 'supseteq']),
  alias('operator', '≡', ['-=', 'equiv']),
  alias('operator', '≅', ['~=', 'cong']),
  alias('operator', '≈', ['~~', 'approx']),
  alias('operator', '∝', ['prop', 'propto']),
  alias('operator', 'and', ['and']),
  alias('operator', 'or', ['or']),
  alias('operator', '¬', ['not', 'neg']),
  alias('operator', '⇒', ['=>', 'implies']),
  alias('operator', 'if', ['if']),
  alias('operator', '⇔', ['<=>', 'iff']),
  alias('operator', '∀', ['AA', 'forall']),
  alias('operator', '∃', ['EE', 'exists']),
  alias('operator', '⊥', ['_|_', 'bot']),
  alias('operator', '⊤', ['TT', 'top']),
  alias('operator', '⊢', ['|--', 'vdash']),
  alias('operator', '⊨', ['|==', 'models']),
  alias('operator', '↑', ['uarr', 'uparrow']),
  alias('operator', '↓', ['darr', 'downarrow']),
  alias('operator', '→', ['rarr', 'rightarrow', '->', 'to']),
  alias('operator', '↣', ['>->', 'rightarrowtail']),
  alias('operator', '↠', ['->>', 'twoheadrightarrow']),
  alias('operator', '⤖', ['>->>', 'twoheadrightarrowtail']),
  alias('operator', '↦', ['|->', 'mapsto']),
  alias('operator', '←', ['larr', 'leftarrow']),
  alias('operator', '↔', ['harr', 'leftrightarrow']),
  alias('operator', '⇒', ['rArr', 'Rightarrow']),
  alias('operator', '⇐', ['lArr', 'Leftarrow']),
  alias('operator', '⇔', ['hArr', 'Leftrightarrow']),
] as const;

const greekNames =
  'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega'.split(
    ' ',
  );
const greekLetters = [...'αβγδεɛζηθϑικλμνξπρστυϕφχψωΓΔΘΛΞΠΣΦΨΩ'];

export const notationAliases = new Map<string, NotationAlias>();
for (const [resolved, spellings] of aliasGroups) {
  for (const spelling of spellings) notationAliases.set(spelling, resolved);
}
for (const [index, name] of greekNames.entries()) {
  const value = greekLetters[index];
  if (value !== undefined)
    notationAliases.set(name, { kind: 'identifier', value });
}

export const backslashNotationAliases = new Set(greekNames);

export const punctuationNotationAliases = [...notationAliases.keys()]
  .filter((spelling) => !/^[A-Za-z]+$/.test(spelling))
  .sort((left, right) => right.length - left.length);

export const canonicalNotationScalars = new Map<string, NotationAlias>();
for (const resolved of notationAliases.values()) {
  if ([...resolved.value].length === 1)
    canonicalNotationScalars.set(resolved.value, resolved);
}
