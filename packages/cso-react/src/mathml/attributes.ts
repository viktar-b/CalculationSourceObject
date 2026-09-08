import type {
  CSSProperties,
  DOMAttributes,
  ReactNode,
  RefAttributes,
} from 'react';

// MathML Display attribute type
export type MathMLAttributeMathDisplay = 'block' | 'inline';

// Global MathML attributes
// <https://w3c.github.io/mathml-core/#global-attributes>
// <https://developer.mozilla.org/en-US/docs/Web/MathML/Global_attributes>
export interface MathMLGlobalAttributes
  extends RefAttributes<MathMLElement>,
    DOMAttributes<MathMLElement> {
  // HTML: id, class, style, data-*, nonce, tabindex, dir
  className?: string | undefined;
  // TODO: data-*
  dir?: string | undefined;
  id?: string | undefined;
  nonce?: string | undefined;
  style?: CSSProperties | undefined;
  tabIndex?: number | undefined;

  // MathML: mathbackground, mathcolor, mathsize, scriptlevel, on* event handlers
  mathbackground?: string | undefined;
  mathcolor?: string | undefined;
}

// Token attributes (for mi, mn, mtext)
export interface MathMLTokenAttributes extends MathMLGlobalAttributes {
  children?: string | undefined;
}

// Identifier attributes (for mi)
export interface IdentifierMathMLAttributes extends MathMLTokenAttributes {}

// Operator attributes (for mo)
export interface OperatorMathMLAttributes extends MathMLTokenAttributes {
  fence?: 'true' | 'false' | undefined;
  separator?: 'true' | 'false' | undefined;
  stretchy?: 'true' | 'false' | undefined;
}

// Space attributes (for mspace)
export interface SpaceMathMLAttributes extends MathMLGlobalAttributes {
  width?: string;
}

// Math element attributes (for math, mrow, msqrt, etc.)
export interface MathMathMLAttributes extends MathMLGlobalAttributes {
  children?: ReactNode | undefined;
  display?: MathMLAttributeMathDisplay | undefined;
  xmlns?: string | undefined;
}

// Fraction attributes (for mfrac)
export interface FractionMathMLAttributes extends MathMLGlobalAttributes {
  children?: [ReactNode, ReactNode];
  linethickness?: undefined;
  numAlign?: 'left' | 'center' | 'right' | undefined;
}

// Table attributes (for mtable)
export interface MathMLTableAttributes extends MathMLGlobalAttributes {
  readonly columnalign?: string;
  readonly columnspacing?: string;
  readonly rowspacing?: string;
}
