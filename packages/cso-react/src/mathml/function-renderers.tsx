/**
 * Structured MathML renderers for special value-tree functions.
 *
 * Most functions can render as binary operators or plain function calls. The
 * helpers in this file cover the functions whose notation needs real MathML
 * structure: fractions, powers, square roots, unary minus, and condition tables.
 */

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

const baseStyle = { textAlign: 'left' as const };
const branchStyle = { ...baseStyle, paddingBlock: '0.4em' };

const ConditionalFunctionMathml = ({
  argCnd,
  argTrue,
  argFalse,
}: ConditionalFunctionMathmlProps): ReactElement => {
  return (
    <mrow style={baseStyle}>
      <mo>{'{'}</mo>
      <mtable columnalign={'left'} style={baseStyle}>
        <mtr>
          <mtd style={{ ...branchStyle, paddingRight: '0.5em' }}>{argTrue}</mtd>
          <mtd style={branchStyle}>
            <mtext>{'if '}</mtext>
            <mspace width={'5px'} />
            {argCnd}
          </mtd>
        </mtr>
        <mtr>
          <mtd style={{ ...branchStyle, paddingRight: '0.5em' }}>
            {argFalse}
          </mtd>
          <mtd style={branchStyle}>
            <mtext>otherwise.</mtext>
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
      <mrow>{numerator}</mrow>
      <mrow>{denominator}</mrow>
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
      <mrow>{base}</mrow>
      <mrow>{exponent}</mrow>
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
      <mstyle style={{ padding: '0.2em' }}>{value}</mstyle>
    </msqrt>
  );
};

const AbsoluteValueFunctionMathml = ({
  value,
}: {
  readonly value: ReactNode;
}): ReactElement => {
  return (
    <mrow>
      <mo fence="true" stretchy="true">
        |
      </mo>
      {value}
      <mo fence="true" stretchy="true">
        |
      </mo>
    </mrow>
  );
};

const UnaryMinusFunctionMathml = ({
  value,
}: {
  readonly value: ReactNode;
}): ReactElement => {
  return (
    <mrow>
      <mo>{'-'}</mo>
      {value}
    </mrow>
  );
};

export const renderSpecialValueFunction = ({
  functionId,
  argReactNodes,
}: SpecialValueFunctionRenderProps): ReactElement | undefined => {
  if (functionId === 'fg.abs' && argReactNodes.length === 1) {
    return <AbsoluteValueFunctionMathml value={argReactNodes[0]} />;
  }

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
