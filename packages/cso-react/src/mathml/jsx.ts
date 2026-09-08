import type {
  FractionMathMLAttributes,
  IdentifierMathMLAttributes,
  MathMLTableAttributes,
  MathMLTokenAttributes,
  MathMathMLAttributes,
  OperatorMathMLAttributes,
  SpaceMathMLAttributes,
} from './attributes.ts';

declare module 'react' {
  // biome-ignore lint/style/noNamespace: <this is correct>
  namespace JSX {
    interface IntrinsicElements {
      math: MathMathMLAttributes;
      mi: IdentifierMathMLAttributes;
      mn: MathMLTokenAttributes;
      mo: OperatorMathMLAttributes;
      mtext: MathMLTokenAttributes;
      mspace: SpaceMathMLAttributes;
      mfrac: FractionMathMLAttributes;
      mroot: MathMathMLAttributes;
      mrow: MathMathMLAttributes;
      msqrt: MathMathMLAttributes;
      mtable: MathMLTableAttributes;
      mtr: MathMathMLAttributes;
      mtd: MathMathMLAttributes;
      msub: MathMathMLAttributes;
      msubsup: MathMathMLAttributes;
      msup: MathMathMLAttributes;
      mstyle: MathMathMLAttributes;
    }
  }
}
