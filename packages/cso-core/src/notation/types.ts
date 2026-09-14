export type NotationParseDiagnosticCode =
  | 'EMPTY_EXPRESSION'
  | 'EMPTY_GROUP'
  | 'INVALID_CONTROL_CHARACTER'
  | 'INVALID_UNICODE'
  | 'MISSING_FRACTION_DENOMINATOR'
  | 'NOTATION_DEPTH_LIMIT'
  | 'NOTATION_NODE_LIMIT'
  | 'NOTATION_SOURCE_LIMIT'
  | 'UNCLOSED_GROUP'
  | 'UNCLOSED_QUOTE'
  | 'UNEXPECTED_CLOSING_GROUP';

export interface NotationDiagnostic {
  readonly code: NotationParseDiagnosticCode;
  readonly offset: number;
  readonly message: string;
}

export type NotationParseResult =
  | { readonly ok: true; readonly value: NotationExpression }
  | { readonly ok: false; readonly diagnostic: NotationDiagnostic };

export type NotationExpression = readonly NotationNode[];

export type NotationNode =
  | NotationIdentifier
  | NotationNumber
  | NotationOperator
  | NotationText
  | NotationGroup
  | NotationFraction
  | NotationSubscript
  | NotationSuperscript
  | NotationSubsup;

export interface NotationIdentifier {
  readonly kind: 'identifier';
  readonly value: string;
}

export interface NotationNumber {
  readonly kind: 'number';
  readonly value: string;
}

export interface NotationOperator {
  readonly kind: 'operator';
  readonly value: string;
}

export interface NotationText {
  readonly kind: 'text';
  readonly value: string;
}

export interface NotationGroup {
  readonly kind: 'group';
  readonly fence: 'none' | 'round' | 'square';
  readonly body: NotationExpression;
}

export interface NotationFraction {
  readonly kind: 'fraction';
  readonly numerator: NotationNode;
  readonly denominator: NotationNode;
}

export interface NotationSubscript {
  readonly kind: 'subscript';
  readonly base: NotationNode;
  readonly subscript: NotationNode;
}

export interface NotationSuperscript {
  readonly kind: 'superscript';
  readonly base: NotationNode;
  readonly superscript: NotationNode;
}

export interface NotationSubsup {
  readonly kind: 'subsup';
  readonly base: NotationNode;
  readonly subscript: NotationNode;
  readonly superscript: NotationNode;
}
