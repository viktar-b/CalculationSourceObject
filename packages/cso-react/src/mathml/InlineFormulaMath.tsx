import { AsciiMathView } from '../ascii-math/AsciiMathView.tsx';
import { defaultMathBlockProps } from './props.ts';
import { SymbolValueMathmlView } from './symbol-value/SymbolValueMathmlView.tsx';
import type { SheetDocument, SheetSymbol } from '@cs-object/core';
import type { ReactElement } from 'react';

interface IProps {
  readonly sheet: SheetDocument;
  readonly symbol: SheetSymbol;
  readonly showGlyph?: boolean;
}

/** A symbolic formula that flows inside a line of text. */
export const InlineFormulaMath = ({
  sheet,
  symbol,
  showGlyph = true,
}: IProps): ReactElement => (
  <math
    {...defaultMathBlockProps}
    display="inline"
    style={{ ...defaultMathBlockProps.style, display: undefined }}
  >
    <mrow>
      {showGlyph ? (
        <>
          <AsciiMathView expression={symbol.glyph} />
          <mo>=</mo>
        </>
      ) : null}
      <SymbolValueMathmlView
        sheet={sheet}
        valueTree={symbol.valueTree}
        noRootContainer={true}
        viewOptions={{ literalsAsDrafts: true }}
      />
    </mrow>
  </math>
);
