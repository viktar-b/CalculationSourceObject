export type AsciiMathReviewStatus = 'supported' | 'literal' | 'error';

export type AsciiMathShowcaseExample = {
  readonly label: string;
  readonly expression: string;
  readonly note: string;
  readonly expected: string;
  readonly review: string;
  readonly status: AsciiMathReviewStatus;
};

export type AsciiMathShowcaseGroup = {
  readonly title: string;
  readonly description: string;
  readonly examples: readonly AsciiMathShowcaseExample[];
};

const supported = (
  label: string,
  expression: string,
  expected: string,
  review: string,
): AsciiMathShowcaseExample => ({
  label,
  expression,
  expected,
  review,
  note: expected,
  status: 'supported',
});

const literal = (
  label: string,
  expression: string,
  expected: string,
  review: string,
): AsciiMathShowcaseExample => ({
  label,
  expression,
  expected,
  review,
  note: expected,
  status: 'literal',
});

const errorCase = (
  label: string,
  expression: string,
  expected: string,
  review: string,
): AsciiMathShowcaseExample => ({
  label,
  expression,
  expected,
  review,
  note: expected,
  status: 'error',
});

export const asciiMathShowcaseGroups: readonly AsciiMathShowcaseGroup[] = [
  {
    title: 'Variables And Text',
    description:
      'Variable words, adjacent tokens, quoted labels, and literal punctuation.',
    examples: [
      supported(
        'Single lowercase',
        'b',
        'Plain variable token',
        'Base variable rendering',
      ),
      supported(
        'Single uppercase',
        'M',
        'Plain uppercase variable token',
        'Capital symbol names',
      ),
      supported(
        'Multi-letter word',
        'width',
        'One variable word',
        'Long variable labels',
      ),
      supported(
        'Mixed case word',
        'Mcr',
        'One mixed-case variable word',
        'Case preservation',
      ),
      supported(
        'Adjacent words',
        'Delta c',
        'Greek alias followed by variable',
        'Whitespace-separated sequences',
      ),
      supported(
        'Adjacent number',
        'x1',
        'Variable followed by integer',
        'Word and number boundary',
      ),
      supported(
        'Repeated token',
        'ccc',
        'One variable word',
        'No implicit splitting by letter',
      ),
      supported(
        'Quoted text',
        '"gross area"',
        'Quoted literal text',
        'Spaces inside labels',
      ),
      supported(
        'Escaped quote',
        '"quote \\"inside\\""',
        'Quoted text with escaped quotes',
        'Quoted-string escaping',
      ),
      literal(
        'Percent character',
        '%',
        'Unknown character rendered literally',
        'Fallback for unit punctuation',
      ),
      literal(
        'Hyphenated text',
        'f-ck',
        'Hyphen is an operator-like literal token',
        'Unexpected punctuation inside labels',
      ),
    ],
  },
  {
    title: 'Numbers',
    description: 'Integer, decimal, signed, and number-like strings.',
    examples: [
      supported('Integer', '123', 'Integer token', 'Whole-number labels'),
      supported('Decimal', '3.14', 'Float token', 'Decimal labels'),
      supported(
        'Trailing decimal',
        '3.',
        'Float token',
        'Decimal without fractional digits',
      ),
      supported(
        'Leading decimal',
        '.5',
        'Float token',
        'Decimal without leading zero',
      ),
      supported(
        'Negative integer',
        '-12',
        'Signed integer token',
        'Negative numeric labels',
      ),
      supported(
        'Negative decimal',
        '-0.5',
        'Signed float token',
        'Negative decimal labels',
      ),
      supported('Zero', '0', 'Integer zero', 'Zero labels'),
      literal(
        'Scientific notation text',
        '1e3',
        'Integer, variable, integer sequence',
        'Unsupported exponent notation',
      ),
      literal(
        'NaN text',
        'NaN',
        'Variable word',
        'Non-number text stays textual',
      ),
      literal(
        'Infinity text',
        'Infinity',
        'Variable word',
        'Infinity is not a numeric token',
      ),
    ],
  },
  {
    title: 'Subscripts And Superscripts',
    description:
      'Supported script order, grouped scripts, spacing, and intentional fallback syntax.',
    examples: [
      supported(
        'Subscript',
        'f_ck',
        'Single-token subscript',
        'Common engineering symbols',
      ),
      supported(
        'Superscript',
        'mm^2',
        'Single-token superscript',
        'Unit powers',
      ),
      supported(
        'Subscript and power',
        'x_i^2',
        'Subscript before superscript',
        'Supported combined script order',
      ),
      literal(
        'Power then subscript',
        'x^2_i',
        'Superscript renders; trailing subscript marker is literal',
        'Unsupported script order',
      ),
      supported(
        'Brace subscript',
        'c_{min,dur}',
        'Grouped multi-token subscript',
        'Comma-separated script text',
      ),
      supported(
        'Brace superscript',
        'A^{alpha+1}',
        'Grouped exponent',
        'Expression in exponent',
      ),
      supported(
        'Both grouped',
        'x_{a+b}^{n-1}',
        'Grouped subscript and superscript',
        'Multi-token scripts on both sides',
      ),
      supported(
        'Nested brace script',
        'x_{{a+b}}',
        'Nested brace groups are accepted and remain structural',
        'Invisible nested script grouping',
      ),
      supported(
        'Greek subscript',
        'Delta c_{dur,gamma}',
        'Plain Greek aliases in label and script',
        'Plain Greek in scripts',
      ),
      supported(
        'Backslash Greek script',
        '\\Delta c_{dur,\\gamma}',
        'Backslash Greek aliases in label and script',
        'Backslash Greek in scripts',
      ),
      supported(
        'Whitespace after marker',
        'x_ {i}',
        'Whitespace ignored before script argument',
        'Authoring tolerance',
      ),
      literal(
        'Dangling subscript marker',
        'x_',
        'Trailing marker renders literally',
        'Incomplete authoring fallback',
      ),
      literal(
        'Paren script fallback',
        'omega_(abc)',
        'Parentheses render visibly but are not consumed as a subscript',
        'Use braces for scripts',
      ),
      literal(
        'Square script fallback',
        'x_[abc]',
        'Square brackets render visibly but are not consumed as a subscript',
        'Use braces for scripts',
      ),
    ],
  },
  {
    title: 'Fractions And Groups',
    description:
      'Braces group invisibly; parentheses and square brackets group visibly.',
    examples: [
      supported(
        'Simple fraction',
        '1/3',
        'One item over one item',
        'Basic fraction rendering',
      ),
      supported(
        'Symbol fraction',
        'a/b',
        'Variable over variable',
        'Variable ratio',
      ),
      supported(
        'Visible paren group',
        '(a+b)',
        'Visible parentheses around grouped contents',
        'Common math grouping',
      ),
      supported(
        'Visible square group',
        '[a+b]',
        'Visible square brackets around grouped contents',
        'Bracketed grouping',
      ),
      supported(
        'Unit fraction',
        'kN/m^2',
        'Unit over powered unit',
        'Compound unit labels',
      ),
      supported(
        'Grouped fraction',
        '{a+b}/{c+d}',
        'Invisible brace groups expand both fraction sides',
        'Bare multi-token fraction sides',
      ),
      supported(
        'Visible numerator group',
        '(M1+M2)/m_3',
        'Parenthesized numerator stays visible and groups the fraction side',
        'Common numerator grouping',
      ),
      supported(
        'Invisible numerator group',
        '{M1+M2}/m_3',
        'Brace group expands the numerator without visible fences',
        'Authoring-only grouping',
      ),
      supported(
        'Grouped numerator',
        '{M_cr+M_Rd}/M_Ed',
        'Invisible grouped numerator',
        'Mixed scripts inside numerator',
      ),
      supported(
        'Grouped denominator',
        'a/{b+c}',
        'Invisible grouped denominator',
        'Expanded denominator',
      ),
      supported(
        'Grouped product',
        '{b*h}/12',
        'Invisible grouped numerator',
        'Operator tokens inside groups',
      ),
      supported(
        'Nested grouped fraction',
        '{{a+b}/c}/d',
        'Invisible outer group around a fraction numerator',
        'Nested group and fraction rendering',
      ),
      literal(
        'Leading slash',
        '/a',
        'Slash is literal text followed by variable',
        'No unary fraction syntax',
      ),
      errorCase(
        'Missing denominator',
        'a/',
        'Parser error rendered as red question mark',
        'Incomplete fraction input',
      ),
      errorCase(
        'Unclosed group',
        '{a+b',
        'Parser error rendered as red question mark',
        'Missing closing brace',
      ),
      errorCase(
        'Empty group',
        '{}',
        'Parser error rendered as red question mark',
        'Brace group must contain an item',
      ),
    ],
  },
  {
    title: 'Greek Letters',
    description: 'Plain and backslash-prefixed Greek aliases.',
    examples: [
      supported(
        'Lowercase core',
        'alpha beta gamma delta',
        'Lowercase Greek aliases',
        'Common lowercase letters',
      ),
      supported(
        'Lowercase extended',
        'zeta eta theta iota kappa',
        'More lowercase Greek aliases',
        'Lowercase coverage',
      ),
      supported(
        'Lowercase tail',
        'lambda mu nu xi pi rho sigma tau',
        'More lowercase Greek aliases',
        'Lowercase coverage',
      ),
      supported(
        'Lowercase variants',
        'epsilon varepsilon vartheta phi varphi',
        'Variant Greek aliases',
        'Variant glyph choices',
      ),
      supported(
        'Lowercase final',
        'upsilon chi psi omega',
        'Final lowercase Greek aliases',
        'Lowercase coverage',
      ),
      supported(
        'Uppercase core',
        'Gamma Delta Theta Lambda Xi',
        'Uppercase Greek aliases',
        'Uppercase coverage',
      ),
      supported(
        'Uppercase tail',
        'Pi Sigma Phi Psi Omega',
        'Uppercase Greek aliases',
        'Uppercase coverage',
      ),
      supported(
        'Backslash lowercase',
        '\\alpha \\delta \\omega',
        'Backslash lowercase Greek aliases',
        'Backslash Greek support',
      ),
      supported(
        'Single backslash Greek',
        '\\delta',
        'One backslash Greek alias',
        'Single-token backslash Greek support',
      ),
      supported(
        'Backslash uppercase',
        '\\Delta \\Omega',
        'Backslash uppercase Greek aliases',
        'Backslash Greek support',
      ),
      literal(
        'Unsupported backslash word',
        '\\betaValue',
        'Backslash renders literally before non-Greek command text',
        'Backslash command fallback',
      ),
    ],
  },
  {
    title: 'Known Alias Sweep',
    description:
      'Compact aliases for operators, sets, calculus, relations, logic, arrows, and shapes.',
    examples: [
      supported(
        'Products',
        '* cdot ** ast *** star',
        'Product and star aliases',
        'Operator alias coverage',
      ),
      supported(
        'Division aliases',
        '// backslash setminus -: div',
        'Slash, setminus, and division aliases',
        'Division-like symbols',
      ),
      supported(
        'Times aliases',
        'xx times |>< ><| |><|',
        'Times and join aliases',
        'Product variants',
      ),
      supported(
        'Circle operators',
        '@ circ o+ oplus ox otimes o. odot',
        'Circle and circled operator aliases',
        'Circle operator variants',
      ),
      supported(
        'Large operators',
        'sum prod int oint',
        'Summation, product, and integral aliases',
        'Large operator coverage',
      ),
      supported(
        'Calculus aliases',
        'del partial grad nabla',
        'Differential and gradient aliases',
        'Calculus symbols',
      ),
      supported(
        'And word',
        'and',
        'Textual logic word',
        'Word alias with no symbol substitution',
      ),
      supported(
        'Or word',
        'or',
        'Textual logic word',
        'Word alias with no symbol substitution',
      ),
      supported(
        'If word',
        'if',
        'Textual logic word',
        'Word alias with no symbol substitution',
      ),
      supported(
        'Negation aliases',
        'not neg',
        'Both aliases render as negation symbols',
        'Symbolic logic aliases',
      ),
      supported(
        'Logic quantifiers',
        'AA forall EE exists',
        'Quantifier aliases',
        'Logic quantifier coverage',
      ),
      supported(
        'Bottom symbol alias',
        '_|_',
        'Bottom truth symbol',
        'Symbolic false alias',
      ),
      supported(
        'Bottom word alias',
        'bot',
        'Bottom truth symbol',
        'Word false alias',
      ),
      supported(
        'Top symbol alias',
        'TT',
        'Top truth symbol',
        'Symbolic true alias',
      ),
      supported('Top word alias', 'top', 'Top truth symbol', 'Word true alias'),
      supported(
        'Implication aliases',
        '=> implies <=> iff',
        'Implication aliases',
        'Logical implication variants',
      ),
      supported(
        'Set aliases',
        'nn cap nnn bigcap uu cup uuu bigcup',
        'Set intersection and union aliases',
        'Set operation coverage',
      ),
      supported(
        'Membership aliases',
        'in !in notin sub subset sube subseteq',
        'Membership and subset aliases',
        'Set relation coverage',
      ),
      supported(
        'Superset aliases',
        'sup supset supe supseteq',
        'Superset aliases',
        'Superset relation coverage',
      ),
      supported(
        'Relation aliases',
        '= != ne < lt > gt <= le >= ge',
        'Equality and comparison aliases',
        'Comparison coverage',
      ),
      supported(
        'Advanced relations',
        'll gg -< prec -<= preceq >- succ >-= succeq',
        'Ordering relation aliases',
        'Relation variant coverage',
      ),
      supported(
        'Equivalence aliases',
        '-= equiv ~= cong ~~ approx prop propto',
        'Equivalence and proportional aliases',
        'Approximation coverage',
      ),
      supported(
        'Arrow aliases',
        '-> to rarr larr harr rArr lArr hArr',
        'Arrow aliases',
        'Arrow coverage',
      ),
      supported(
        'Advanced arrows',
        '>-> ->> >->> |->',
        'Tail, double-head, and mapsto arrows',
        'Special arrow coverage',
      ),
      supported(
        'Geometry aliases',
        '/_ angle /_\\ triangle diamond square frown',
        'Geometry aliases',
        'Shape coverage',
      ),
      supported(
        'Left floors and ceilings',
        '|__ lfloor |~ lceiling',
        'Left floor and ceiling aliases',
        'Fence-like aliases',
      ),
      supported(
        'Right floors and ceilings',
        '__| rfloor ~| rceiling',
        'Right floor and ceiling aliases',
        'Fence-like aliases',
      ),
      supported(
        'Number sets',
        'CC NN QQ RR ZZ',
        'Number set aliases',
        'Blackboard-style set names',
      ),
      supported(
        'Dots and constants',
        "oo infty aleph :. therefore :' because vdots ddots",
        'Constants, therefore, because, and dots',
        'Miscellaneous alias coverage',
      ),
    ],
  },
  {
    title: 'Units',
    description:
      'Common unit strings that use the same parser as variable glyphs.',
    examples: [
      supported('Length', 'mm', 'Plain unit word', 'Base unit display'),
      supported('Area', 'mm^2', 'Unit with power', 'Area unit display'),
      supported('Volume', 'm^3', 'Unit with power', 'Volume unit display'),
      supported(
        'Stress',
        'N/mm^2',
        'Fractional compound unit',
        'Stress unit display',
      ),
      supported(
        'Moment',
        'kN*m',
        'Unit product with operator token',
        'Moment unit display',
      ),
      supported(
        'Acceleration',
        'm/s^2',
        'Fractional powered unit',
        'Acceleration unit display',
      ),
      literal(
        'Percent unit',
        '%',
        'Percent character renders literally',
        'Percent fallback',
      ),
      literal(
        'Degree abbreviation',
        'degC',
        'Plain text abbreviation; no degree-symbol alias',
        'Temperature unit fallback',
      ),
    ],
  },
  {
    title: 'Intentional Literal Fallback',
    description:
      'Unsupported commands and legacy grouping forms render as text instead of becoming formula structure.',
    examples: [
      literal(
        'Command word',
        'sqrt x',
        'Command-looking word renders as text',
        'No unary command behavior',
      ),
      literal(
        'Backslash command',
        '\\sqrt x',
        'Backslash command renders as text',
        'Unsupported backslash commands',
      ),
      literal(
        'Binary command text',
        'frac a b',
        'Command-looking word renders as text',
        'No binary command behavior',
      ),
      literal(
        'Root command text',
        'root 3 x',
        'Command-looking word renders as text',
        'No root command behavior',
      ),
      literal(
        'Color command text',
        'color red x',
        'Command-looking words render as text',
        'No style command behavior',
      ),
      literal(
        'Font command text',
        'bb x',
        'Command-looking word renders as text',
        'No font command behavior',
      ),
      literal(
        'Old angle group',
        '(:a+b:)',
        'Colon markers render literally inside visible parentheses',
        'Legacy marker fallback',
      ),
      literal(
        'Old brace marker group',
        '{:a+b:}',
        'Brace group is structural; colon markers render literally',
        'Legacy grouping fallback',
      ),
      literal(
        'Comma sequence',
        'a,b:c',
        'Punctuation tokens render literally',
        'Punctuation display',
      ),
    ],
  },
  {
    title: 'Invalid Inputs',
    description: 'Inputs that should show the renderer error fallback.',
    examples: [
      errorCase(
        'Empty expression',
        '',
        'Empty input renders as red question mark',
        'Missing variable name',
      ),
      errorCase(
        'Unclosed quote',
        '"gross area',
        'Parser error rendered as red question mark',
        'Missing closing quote',
      ),
      errorCase(
        'Only open brace',
        '{',
        'Parser error rendered as red question mark',
        'Missing group content and closing brace',
      ),
      errorCase(
        'Only fraction numerator',
        'a/',
        'Parser error rendered as red question mark',
        'Missing denominator',
      ),
      errorCase(
        'Brace without expression',
        '{}/a',
        'Parser error rendered as red question mark',
        'Empty group before fraction',
      ),
    ],
  },
];
