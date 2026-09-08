export const SheetOperatorAssociativity = {
  Left: 'left',
  Right: 'right',
} as const;

export type SheetOperatorAssociativity =
  (typeof SheetOperatorAssociativity)[keyof typeof SheetOperatorAssociativity];

export const SheetOperatorPriority = {
  LogicalOr: 1,
  LogicalAnd: 2,
  Compare: 3,
  Equality: 4,
  AddSubtract: 5,
  MultiplyDivide: 6,
  Exponentiation: 7,
} as const;

export type SheetOperatorPriority =
  (typeof SheetOperatorPriority)[keyof typeof SheetOperatorPriority];

export interface SheetBinaryOperator {
  readonly id: string;
  readonly glyph: string;
  readonly glyphPlaintext: string;
  readonly priority: SheetOperatorPriority;
  readonly associativity: SheetOperatorAssociativity;
}

export interface SheetFunctionSpec {
  readonly id: string;
  readonly glyph: string;
  readonly operator?: SheetBinaryOperator;
}

const binaryOperator = (
  id: string,
  glyph: string,
  glyphPlaintext: string,
  priority: SheetOperatorPriority,
  associativity: SheetOperatorAssociativity = SheetOperatorAssociativity.Left,
): SheetBinaryOperator => ({
  id,
  glyph,
  glyphPlaintext,
  priority,
  associativity,
});

export const sheetFunctionSpecs = [
  {
    id: 'fg.add',
    glyph: '+',
    operator: binaryOperator(
      'fg.add',
      '+',
      '+',
      SheetOperatorPriority.AddSubtract,
    ),
  },
  {
    id: 'fg.and',
    glyph: 'and',
    operator: binaryOperator(
      'fg.and',
      'and',
      'and',
      SheetOperatorPriority.LogicalAnd,
    ),
  },
  { id: 'fg.ceil', glyph: 'ceil' },
  { id: 'fg.cnd', glyph: 'if' },
  { id: 'fg.deg', glyph: 'deg' },
  {
    id: 'fg.divide',
    glyph: '/',
    operator: binaryOperator(
      'fg.divide',
      '\u00F7',
      '/',
      SheetOperatorPriority.MultiplyDivide,
    ),
  },
  {
    id: 'fg.eq',
    glyph: '=',
    operator: binaryOperator(
      'fg.eq',
      '=',
      '==',
      SheetOperatorPriority.Equality,
    ),
  },
  { id: 'fg.exp', glyph: 'exp' },
  {
    id: 'fg.ge',
    glyph: '>=',
    operator: binaryOperator(
      'fg.ge',
      '\u2265',
      '>=',
      SheetOperatorPriority.Compare,
    ),
  },
  {
    id: 'fg.gt',
    glyph: '>',
    operator: binaryOperator('fg.gt', '>', '>', SheetOperatorPriority.Compare),
  },
  {
    id: 'fg.le',
    glyph: '<=',
    operator: binaryOperator(
      'fg.le',
      '\u2264',
      '<=',
      SheetOperatorPriority.Compare,
    ),
  },
  { id: 'fg.log', glyph: 'log' },
  {
    id: 'fg.lt',
    glyph: '<',
    operator: binaryOperator('fg.lt', '<', '<', SheetOperatorPriority.Compare),
  },
  { id: 'fg.max', glyph: 'max' },
  { id: 'fg.min', glyph: 'min' },
  {
    id: 'fg.multiply',
    glyph: '*',
    operator: binaryOperator(
      'fg.multiply',
      '\u22C5',
      '*',
      SheetOperatorPriority.MultiplyDivide,
    ),
  },
  {
    id: 'fg.ne',
    glyph: '!=',
    operator: binaryOperator(
      'fg.ne',
      '\u2260',
      '!=',
      SheetOperatorPriority.Equality,
    ),
  },
  { id: 'fg.noop', glyph: '' },
  {
    id: 'fg.or',
    glyph: 'or',
    operator: binaryOperator(
      'fg.or',
      'or',
      'or',
      SheetOperatorPriority.LogicalOr,
    ),
  },
  { id: 'fg.pi', glyph: 'pi' },
  {
    id: 'fg.pow',
    glyph: '^',
    operator: binaryOperator(
      'fg.pow',
      '^',
      '**',
      SheetOperatorPriority.Exponentiation,
      SheetOperatorAssociativity.Right,
    ),
  },
  { id: 'fg.round', glyph: 'round' },
  { id: 'fg.sqrt', glyph: 'sqrt' },
  { id: 'fg.stub', glyph: '' },
  {
    id: 'fg.subtract',
    glyph: '-',
    operator: binaryOperator(
      'fg.subtract',
      '-',
      '-',
      SheetOperatorPriority.AddSubtract,
    ),
  },
  { id: 'fg.uminus', glyph: '-' },
] as const satisfies readonly SheetFunctionSpec[];

export const sheetFunctionSpecsById = new Map<string, SheetFunctionSpec>(
  sheetFunctionSpecs.map((spec) => [spec.id, spec]),
);

export const supportedValueFunctionIds = new Set<string>(
  sheetFunctionSpecsById.keys(),
);

const functionIdPrefixPattern = /^fg\./;

export const getValueFunctionGlyph = (id: string): string =>
  sheetFunctionSpecsById.get(id)?.glyph ??
  id.replace(functionIdPrefixPattern, '');

export const getFunctionSpec = (id: string): SheetFunctionSpec | undefined =>
  sheetFunctionSpecsById.get(id);

export const getFunctionBinaryOperatorById = (
  id: string,
): SheetBinaryOperator | undefined => getFunctionSpec(id)?.operator;
