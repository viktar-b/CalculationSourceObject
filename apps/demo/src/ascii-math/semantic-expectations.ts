// Reviewed expected parser semantics for every successfully rendered showcase input.
export const expectedNotationSemantics = new Map<string, string>([
  ['b', 'sequence(identifier("b"))'],
  ['M', 'sequence(identifier("M"))'],
  ['width', 'sequence(identifier("width"))'],
  ['Mcr', 'sequence(identifier("Mcr"))'],
  ['Delta c', 'sequence(identifier("Δ"),identifier("c"))'],
  ['x1', 'sequence(identifier("x"),number("1"))'],
  ['ccc', 'sequence(identifier("ccc"))'],
  ['"gross area"', 'sequence(text("gross area"))'],
  ['"quote \\"inside\\""', 'sequence(text("quote \\"inside\\""))'],
  ['%', 'sequence(text("%"))'],
  ['f-ck', 'sequence(identifier("f"),operator("−"),identifier("ck"))'],
  ['123', 'sequence(number("123"))'],
  ['3.14', 'sequence(number("3.14"))'],
  ['3.', 'sequence(number("3."))'],
  ['.5', 'sequence(number(".5"))'],
  ['-12', 'sequence(number("-12"))'],
  ['-0.5', 'sequence(number("-0.5"))'],
  ['0', 'sequence(number("0"))'],
  ['1e3', 'sequence(number("1"),identifier("e"),number("3"))'],
  ['NaN', 'sequence(identifier("NaN"))'],
  ['Infinity', 'sequence(identifier("Infinity"))'],
  ['f_ck', 'sequence(subscript(identifier("f"),identifier("ck")))'],
  ['mm^2', 'sequence(superscript(identifier("mm"),number("2")))'],
  ['x_i^2', 'sequence(subsup(identifier("x"),identifier("i"),number("2")))'],
  [
    'x^2_i',
    'sequence(superscript(identifier("x"),number("2")),text("_"),identifier("i"))',
  ],
  [
    'c_{min,dur}',
    'sequence(subscript(identifier("c"),group(none,sequence(identifier("min"),text(","),identifier("dur")))))',
  ],
  [
    'A^{alpha+1}',
    'sequence(superscript(identifier("A"),group(none,sequence(identifier("α"),operator("+"),number("1")))))',
  ],
  [
    'x_{a+b}^{n-1}',
    'sequence(subsup(identifier("x"),group(none,sequence(identifier("a"),operator("+"),identifier("b"))),group(none,sequence(identifier("n"),number("-1")))))',
  ],
  [
    'x_{{a+b}}',
    'sequence(subscript(identifier("x"),group(none,sequence(group(none,sequence(identifier("a"),operator("+"),identifier("b")))))))',
  ],
  [
    'Delta c_{dur,gamma}',
    'sequence(identifier("Δ"),subscript(identifier("c"),group(none,sequence(identifier("dur"),text(","),identifier("γ")))))',
  ],
  [
    '\\Delta c_{dur,\\gamma}',
    'sequence(identifier("Δ"),subscript(identifier("c"),group(none,sequence(identifier("dur"),text(","),identifier("γ")))))',
  ],
  [
    'x_ {i}',
    'sequence(subscript(identifier("x"),group(none,sequence(identifier("i")))))',
  ],
  ['x_', 'sequence(identifier("x"),text("_"))'],
  [
    'omega_(abc)',
    'sequence(identifier("ω"),text("_"),group(round,sequence(identifier("abc"))))',
  ],
  [
    'x_[abc]',
    'sequence(identifier("x"),text("_"),group(square,sequence(identifier("abc"))))',
  ],
  ['1/3', 'sequence(fraction(number("1"),number("3")))'],
  ['a/b', 'sequence(fraction(identifier("a"),identifier("b")))'],
  [
    '(a+b)',
    'sequence(group(round,sequence(identifier("a"),operator("+"),identifier("b"))))',
  ],
  [
    '[a+b]',
    'sequence(group(square,sequence(identifier("a"),operator("+"),identifier("b"))))',
  ],
  [
    'kN/m^2',
    'sequence(fraction(identifier("kN"),superscript(identifier("m"),number("2"))))',
  ],
  [
    '{a+b}/{c+d}',
    'sequence(fraction(group(none,sequence(identifier("a"),operator("+"),identifier("b"))),group(none,sequence(identifier("c"),operator("+"),identifier("d")))))',
  ],
  [
    '(M1+M2)/m_3',
    'sequence(fraction(group(round,sequence(identifier("M"),number("1"),operator("+"),identifier("M"),number("2"))),subscript(identifier("m"),number("3"))))',
  ],
  [
    '{M1+M2}/m_3',
    'sequence(fraction(group(none,sequence(identifier("M"),number("1"),operator("+"),identifier("M"),number("2"))),subscript(identifier("m"),number("3"))))',
  ],
  [
    '{M_cr+M_Rd}/M_Ed',
    'sequence(fraction(group(none,sequence(subscript(identifier("M"),identifier("cr")),operator("+"),subscript(identifier("M"),identifier("Rd")))),subscript(identifier("M"),identifier("Ed"))))',
  ],
  [
    'a/{b+c}',
    'sequence(fraction(identifier("a"),group(none,sequence(identifier("b"),operator("+"),identifier("c")))))',
  ],
  [
    '{b*h}/12',
    'sequence(fraction(group(none,sequence(identifier("b"),operator("⋅"),identifier("h"))),number("12")))',
  ],
  [
    '{{a+b}/c}/d',
    'sequence(fraction(group(none,sequence(fraction(group(none,sequence(identifier("a"),operator("+"),identifier("b"))),identifier("c")))),identifier("d")))',
  ],
  ['/a', 'sequence(operator("/"),identifier("a"))'],
  [
    'alpha beta gamma delta',
    'sequence(identifier("α"),identifier("β"),identifier("γ"),identifier("δ"))',
  ],
  [
    'zeta eta theta iota kappa',
    'sequence(identifier("ζ"),identifier("η"),identifier("θ"),identifier("ι"),identifier("κ"))',
  ],
  [
    'lambda mu nu xi pi rho sigma tau',
    'sequence(identifier("λ"),identifier("μ"),identifier("ν"),identifier("ξ"),identifier("π"),identifier("ρ"),identifier("σ"),identifier("τ"))',
  ],
  [
    'epsilon varepsilon vartheta phi varphi',
    'sequence(identifier("ε"),identifier("ɛ"),identifier("ϑ"),identifier("ϕ"),identifier("φ"))',
  ],
  [
    'upsilon chi psi omega',
    'sequence(identifier("υ"),identifier("χ"),identifier("ψ"),identifier("ω"))',
  ],
  [
    'Gamma Delta Theta Lambda Xi',
    'sequence(identifier("Γ"),identifier("Δ"),identifier("Θ"),identifier("Λ"),identifier("Ξ"))',
  ],
  [
    'Pi Sigma Phi Psi Omega',
    'sequence(identifier("Π"),identifier("Σ"),identifier("Φ"),identifier("Ψ"),identifier("Ω"))',
  ],
  [
    '\\alpha \\delta \\omega',
    'sequence(identifier("α"),identifier("δ"),identifier("ω"))',
  ],
  ['\\delta', 'sequence(identifier("δ"))'],
  ['\\Delta \\Omega', 'sequence(identifier("Δ"),identifier("Ω"))'],
  ['\\betaValue', 'sequence(identifier("\\\\betaValue"))'],
  [
    '* cdot ** ast *** star',
    'sequence(operator("⋅"),operator("⋅"),operator("*"),operator("*"),operator("⋆"),operator("⋆"))',
  ],
  [
    '// backslash setminus -: div',
    'sequence(operator("/"),operator("\\\\"),operator("\\\\"),operator("÷"),operator("÷"))',
  ],
  [
    'xx times |>< ><| |><|',
    'sequence(operator("×"),operator("×"),operator("⋉"),operator("⋊"),operator("⋈"))',
  ],
  [
    '@ circ o+ oplus ox otimes o. odot',
    'sequence(operator("∘"),operator("∘"),operator("⊕"),operator("⊕"),operator("⊗"),operator("⊗"),operator("⊙"),operator("⊙"))',
  ],
  [
    'sum prod int oint',
    'sequence(operator("∑"),operator("∏"),operator("∫"),operator("∮"))',
  ],
  [
    'del partial grad nabla',
    'sequence(operator("∂"),operator("∂"),operator("∇"),operator("∇"))',
  ],
  ['and', 'sequence(operator("and"))'],
  ['or', 'sequence(operator("or"))'],
  ['if', 'sequence(operator("if"))'],
  ['not neg', 'sequence(operator("¬"),operator("¬"))'],
  [
    'AA forall EE exists',
    'sequence(operator("∀"),operator("∀"),operator("∃"),operator("∃"))',
  ],
  ['_|_', 'sequence(operator("⊥"))'],
  ['bot', 'sequence(operator("⊥"))'],
  ['TT', 'sequence(operator("⊤"))'],
  ['top', 'sequence(operator("⊤"))'],
  [
    '=> implies <=> iff',
    'sequence(operator("⇒"),operator("⇒"),operator("⇔"),operator("⇔"))',
  ],
  [
    'nn cap nnn bigcap uu cup uuu bigcup',
    'sequence(operator("∩"),operator("∩"),operator("⋂"),operator("⋂"),operator("∪"),operator("∪"),operator("⋃"),operator("⋃"))',
  ],
  [
    'in !in notin sub subset sube subseteq',
    'sequence(operator("∈"),operator("∉"),operator("∉"),operator("⊂"),operator("⊂"),operator("⊆"),operator("⊆"))',
  ],
  [
    'sup supset supe supseteq',
    'sequence(operator("⊃"),operator("⊃"),operator("⊇"),operator("⊇"))',
  ],
  [
    '= != ne < lt > gt <= le >= ge',
    'sequence(operator("="),operator("≠"),operator("≠"),operator("<"),operator("<"),operator(">"),operator(">"),operator("≤"),operator("≤"),operator("≥"),operator("≥"))',
  ],
  [
    'll gg -< prec -<= preceq >- succ >-= succeq',
    'sequence(operator("≪"),operator("≫"),operator("≺"),operator("≺"),operator("⪯"),operator("⪯"),operator("≻"),operator("≻"),operator("⪰"),operator("⪰"))',
  ],
  [
    '-= equiv ~= cong ~~ approx prop propto',
    'sequence(operator("≡"),operator("≡"),operator("≅"),operator("≅"),operator("≈"),operator("≈"),operator("∝"),operator("∝"))',
  ],
  [
    '-> to rarr larr harr rArr lArr hArr',
    'sequence(operator("→"),operator("→"),operator("→"),operator("←"),operator("↔"),operator("⇒"),operator("⇐"),operator("⇔"))',
  ],
  [
    '>-> ->> >->> |->',
    'sequence(operator("↣"),operator("↠"),operator("⤖"),operator("↦"))',
  ],
  [
    '/_ angle /_\\ triangle diamond square frown',
    'sequence(operator("∠"),operator("∠"),operator("△"),operator("△"),operator("⋄"),operator("□"),operator("⌢"))',
  ],
  [
    '|__ lfloor |~ lceiling',
    'sequence(operator("⌊"),operator("⌊"),operator("⌈"),operator("⌈"))',
  ],
  [
    '__| rfloor ~| rceiling',
    'sequence(operator("⌋"),operator("⌋"),operator("⌉"),operator("⌉"))',
  ],
  [
    'CC NN QQ RR ZZ',
    'sequence(identifier("ℂ"),identifier("ℕ"),identifier("ℚ"),identifier("ℝ"),identifier("ℤ"))',
  ],
  [
    "oo infty aleph :. therefore :' because vdots ddots",
    'sequence(operator("∞"),operator("∞"),identifier("ℵ"),operator("∴"),operator("∴"),operator("∵"),operator("∵"),operator("⋮"),operator("⋱"))',
  ],
  ['mm', 'sequence(identifier("mm"))'],
  ['m^3', 'sequence(superscript(identifier("m"),number("3")))'],
  [
    'N/mm^2',
    'sequence(fraction(identifier("N"),superscript(identifier("mm"),number("2"))))',
  ],
  ['kN*m', 'sequence(identifier("kN"),operator("⋅"),identifier("m"))'],
  [
    'm/s^2',
    'sequence(fraction(identifier("m"),superscript(identifier("s"),number("2"))))',
  ],
  ['degC', 'sequence(identifier("degC"))'],
  ['a // b', 'sequence(identifier("a"),operator("/"),identifier("b"))'],
  ['a /_ b', 'sequence(identifier("a"),operator("∠"),identifier("b"))'],
  ['a /_\\ b', 'sequence(identifier("a"),operator("△"),identifier("b"))'],
  ['a ^^ b', 'sequence(identifier("a"),operator("∧"),identifier("b"))'],
  ['x _|_ y', 'sequence(identifier("x"),operator("⊥"),identifier("y"))'],
  ['oxygen', 'sequence(identifier("oxygen"))'],
  ['ooops', 'sequence(identifier("ooops"))'],
  ['xxValue', 'sequence(identifier("xxValue"))'],
  ['\\ox', 'sequence(identifier("\\\\ox"))'],
  [
    '123 + sum "x"',
    'sequence(number("123"),operator("+"),operator("∑"),text("x"))',
  ],
  ['𝛼', 'sequence(identifier("𝛼"))'],
  ['sqrt x', 'sequence(identifier("sqrt"),identifier("x"))'],
  ['\\sqrt x', 'sequence(identifier("\\\\sqrt"),identifier("x"))'],
  ['frac a b', 'sequence(identifier("frac"),identifier("a"),identifier("b"))'],
  ['root 3 x', 'sequence(identifier("root"),number("3"),identifier("x"))'],
  [
    'color red x',
    'sequence(identifier("color"),identifier("red"),identifier("x"))',
  ],
  ['bb x', 'sequence(identifier("bb"),identifier("x"))'],
  [
    '(:a+b:)',
    'sequence(group(round,sequence(text(":"),identifier("a"),operator("+"),identifier("b"),text(":"))))',
  ],
  [
    '{:a+b:}',
    'sequence(group(none,sequence(text(":"),identifier("a"),operator("+"),identifier("b"),text(":"))))',
  ],
  [
    'a,b:c',
    'sequence(identifier("a"),text(","),identifier("b"),text(":"),identifier("c"))',
  ],
]);
