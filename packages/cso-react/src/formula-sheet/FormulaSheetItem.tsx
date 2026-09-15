import type { SheetRenderableItem } from '@cs-object/core';
import type { SheetDocument } from '@cs-object/core';
import type { ReactElement } from 'react';
import { FormulaSheetSectionRow } from './FormulaSheetSectionRow.tsx';
import { FormulaSheetSymbolRow } from './FormulaSheetSymbolRow.tsx';

export interface FormulaSheetItemProps {
  sheet: SheetDocument;
  item: SheetRenderableItem;
  sheetItemIndex: number;
}

export const FormulaSheetItem = ({
  sheet,
  item,
  sheetItemIndex,
}: FormulaSheetItemProps): ReactElement => {
  return (
    <div className="relative min-w-0">
      {item.kind === 'section' && (
        <FormulaSheetSectionRow
          sheet={sheet}
          sheetItemIndex={sheetItemIndex}
          item={item.section}
        />
      )}
      {item.kind === 'symbol' && (
        <FormulaSheetSymbolRow
          sheet={sheet}
          sheetItemIndex={sheetItemIndex}
          item={item.symbol}
        />
      )}
    </div>
  );
};
