/**
 * Structured MathML renderers for special value-tree functions.
 *
 * Most functions can render as binary operators or plain function calls. The
 * helpers in this file cover the functions whose notation needs real MathML
 * structure: fractions, powers, square roots, unary minus, and condition tables.
 */
import { MATHML_FONT_SIZE } from './constants.ts';
import type { ReactElement, ReactNode } from 'react';

interface SpecialValueFunctionRenderProps {
  readonly functionId: string;
  readonly argReactNodes: readonly ReactNode[];
}

interface ConditionalFunctionMathmlProps {
  readonly argCnd: ReactNode;
  readonly argTrue: ReactNode;
  readonly argFalse: ReactNode;
}

const baseStyle = { fontSize: MATHML_FONT_SIZE, textAlign: 'left' as const };
const fontSizeStyle = { fontSize: MATHML_FONT_SIZE };

const ConditionalFunctionMathml = ({
  argCnd,
  argTrue,
  argFalse,
}: ConditionalFunctionMathmlProps): ReactElement => {
  return (
    <mrow style={baseStyle}>
      <mo style={fontSizeStyle}>{'{'}</mo>
      <mtable columnalign={'left'} style={baseStyle}>
        <mtr style={fontSizeStyle}>
          <mtd style={baseStyle}>{argTrue}</mtd>
          <mtd style={baseStyle}>
            <mtext style={fontSizeStyle}>{'if '}</mtext>
            <mspace width={'5px'} />
            {argCnd}
          </mtd>
        </mtr>
        <mtr style={fontSizeStyle}>
          <mtd style={baseStyle}>{argFalse}</mtd>
          <mtd style={baseStyle}>
            <mtext style={fontSizeStyle}>otherwise.</mtext>
          </mtd>
        </mtr>
      </mtable>
    </mrow>
  );
};

const FractionFunctionMathml = ({
  numerator,
  denominator,
}: {
  readonly numerator: ReactNode;
  readonly denominator: ReactNode;
}): ReactElement => {
  return (
    <mfrac>
      <mstyle style={{ fontSize: MATHML_FONT_SIZE }}>{numerator}</mstyle>
      <mstyle style={{ fontSize: MATHML_FONT_SIZE }}>{denominator}</mstyle>
    </mfrac>
  );
};

const PowerFunctionMathml = ({
  base,
  exponent,
}: {
  readonly base: ReactNode;
  readonly exponent: ReactNode;
}): ReactElement => {
  return (
    <msup>
      <mstyle style={{ fontSize: MATHML_FONT_SIZE }}>{base}</mstyle>
      <mstyle style={{ scale: '0.8' }}>{exponent}</mstyle>
    </msup>
  );
};

const SquareRootFunctionMathml = ({
  value,
}: {
  readonly value: ReactNode;
}): ReactElement => {
  return (
    <msqrt>
      <mstyle style={{ padding: '3px', fontSize: MATHML_FONT_SIZE }}>
        {value}
      </mstyle>
    </msqrt>
  );
};

const UnaryMinusFunctionMathml = ({
  value,
}: {
  readonly value: ReactNode;
}): ReactElement => {
  return (
    <mrow style={{ fontSize: MATHML_FONT_SIZE }}>
      <mo style={{ fontSize: MATHML_FONT_SIZE }}>{'-'}</mo>
      {value}
    </mrow>
  );
};

export const renderSpecialValueFunction = ({
  functionId,
  argReactNodes,
}: SpecialValueFunctionRenderProps): ReactElement | undefined => {
  if (functionId === 'fg.sqrt' && argReactNodes.length === 1) {
    return <SquareRootFunctionMathml value={argReactNodes[0]} />;
  }

  if (functionId === 'fg.uminus' && argReactNodes.length === 1) {
    return <UnaryMinusFunctionMathml value={argReactNodes[0]} />;
  }

  if (functionId === 'fg.cnd' && argReactNodes.length === 3) {
    return (
      <ConditionalFunctionMathml
        argCnd={argReactNodes[0]}
        argTrue={argReactNodes[1]}
        argFalse={argReactNodes[2]}
      />
    );
  }

  if (functionId === 'fg.divide' && argReactNodes.length === 2) {
    return (
      <FractionFunctionMathml
        numerator={argReactNodes[0]}
        denominator={argReactNodes[1]}
      />
    );
  }

  if (functionId === 'fg.pow' && argReactNodes.length === 2) {
    return (
      <PowerFunctionMathml
        base={argReactNodes[0]}
        exponent={argReactNodes[1]}
      />
    );
  }

  return undefined;
};
