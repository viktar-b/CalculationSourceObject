export type AsciiMathExpression = AsciiMathExpressionSequence;

export interface AsciiMathExpressionSequence {
  readonly type: 'ExpressionSequence';
  readonly left: AsciiMathSubscriptSuperscript | AsciiMathExpressionDivision;
  readonly right?: AsciiMathExpression | undefined;
}

export interface AsciiMathExpressionDivision {
  readonly type: 'ExpressionDivision';
  readonly numerator: AsciiMathSubscriptSuperscript;
  readonly denominator: AsciiMathSubscriptSuperscript;
}

export interface AsciiMathSubscriptSuperscript {
  readonly type: 'SubscriptSuperscript';
  readonly base: AsciiMathExpressionSimple;
  readonly subscript?: AsciiMathExpressionSimple | undefined;
  readonly superscript?: AsciiMathExpressionSimple | undefined;
}

export type AsciiMathExpressionSimple =
  | AsciiMathNumber
  | AsciiMathString
  | AsciiMathGroup;

export interface AsciiMathNumber {
  readonly type: 'NumberFloat' | 'NumberInteger';
  readonly value: string;
}

export interface AsciiMathString {
  readonly type: 'StrVarname' | 'StrChar' | 'StrLine' | 'StrQuoted';
  readonly value: string;
}

export interface AsciiMathGroup {
  readonly type: 'CmdGroup';
  readonly expression: AsciiMathExpressionSequence;
  readonly lBracket: string;
  readonly rBracket: string;
}
