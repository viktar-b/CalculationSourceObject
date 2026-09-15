import { AsciiMathView } from '../ascii-math/AsciiMathView.tsx';
import type { MathMathMLAttributes } from './attributes.ts';
import { MATHML_FONT_SIZE } from './constants.ts';
import { defaultMathBlockProps } from './props.ts';
import { SymbolValueMathmlView } from './symbol-value/SymbolValueMathmlView.tsx';
import type { SheetDocument, SheetSymbol } from '@cs-object/core';
import type { HTMLAttributes, ReactElement } from 'react';

interface IProps {
  readonly sheet: SheetDocument;
  readonly symbol: SheetSymbol;
  // TODO: review type
  readonly mathProps?: MathMathMLAttributes;
  readonly showGlyph?: boolean;
  readonly showSymbolic?: boolean;
  readonly showNumeric?: boolean;
}

export const SymbolValueMathBlock = ({
  sheet,
  symbol,
  mathProps,
  showGlyph,
  showSymbolic,
  showNumeric,
}: IProps): ReactElement => {
  const baseMathProps: MathMathMLAttributes = {
    ...defaultMathBlockProps,
    ...mathProps,
    // Use MathML display attribute (not CSS) for cross-browser compatibility
    display: 'inline',
    style: {
      ...defaultMathBlockProps.style,
      ...mathProps?.style,
      // Remove CSS display since we're using MathML display attribute
      display: undefined,
      fontSize:
        defaultMathBlockProps.style?.fontSize ||
        mathProps?.style?.fontSize ||
        MATHML_FONT_SIZE,
    },
  };

  const divProps: HTMLAttributes<HTMLDivElement> = {
    style: {
      display: 'inline-flex',
      alignItems: 'flex-start',
      margin: '5px 0px',
      minWidth: '0',
      flexShrink: '0',
    },
  };

  // Safari and Firefox don't support CSS flexbox on MathML elements (mrow)
  // Use HTML divs for flexbox layout, with each formula section in its own math element
  return (
    <div>
      {showGlyph && (
        <div {...divProps}>
          <math {...baseMathProps}>
            <mrow>
              <AsciiMathView expression={symbol.glyph} />
            </mrow>
          </math>
        </div>
      )}

      {showSymbolic && showGlyph && (
        <div {...divProps}>
          <math {...baseMathProps}>
            <mrow>
              <mo className="px-1 py-2">=</mo>
            </mrow>
          </math>
        </div>
      )}

      {showSymbolic && (
        <div {...divProps}>
          <math {...baseMathProps}>
            <mrow>
              <SymbolValueMathmlView
                sheet={sheet}
                valueTree={symbol.valueTree}
                noRootContainer={true}
                viewOptions={{ literalsAsDrafts: true }}
              />
            </mrow>
          </math>
        </div>
      )}

      {showNumeric && (showGlyph || showSymbolic) && (
        <div {...divProps}>
          <math {...baseMathProps}>
            <mrow>
              <mo className="px-1 py-2">=</mo>
            </mrow>
          </math>
        </div>
      )}

      {showNumeric && (
        <div {...divProps}>
          <math {...baseMathProps}>
            <mrow>
              <SymbolValueMathmlView
                sheet={sheet}
                valueTree={symbol.valueTree}
                noRootContainer={true}
                viewOptions={{ numerical: true, literalsAsDrafts: true }}
              />
            </mrow>
          </math>
        </div>
      )}
    </div>
  );
};
