import type { SheetDocument } from '@cs-object/core';

export interface FormulaSheetRowProps<TItem> {
  readonly sheet: SheetDocument;
  readonly sheetItemIndex: number;
  readonly item: TItem;
}
