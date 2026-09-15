import type { SheetDocument, SheetValueTree } from '@cs-object/core';
import type { ReactElement } from 'react';
import {
  type SymbolValueViewOptions,
  ValueTreeMathmlRenderer,
} from './ValueTreeMathmlRenderer.tsx';

interface SymbolValueMathmlViewProps {
  readonly sheet: SheetDocument;
  readonly valueTree: SheetValueTree;
  readonly viewOptions: SymbolValueViewOptions;
  readonly noRootContainer?: boolean;
}

export const SymbolValueMathmlView = ({
  sheet,
  valueTree,
  viewOptions,
  noRootContainer,
}: SymbolValueMathmlViewProps): ReactElement => {
  return (
    <ValueTreeMathmlRenderer
      sheet={sheet}
      valueTree={valueTree}
      viewOptions={viewOptions}
      noRootContainer={noRootContainer}
    />
  );
};
