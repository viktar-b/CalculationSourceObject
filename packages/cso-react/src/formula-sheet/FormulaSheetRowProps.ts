import type { SheetDocument } from '@viktar-b/cso-core';

export interface FormulaSheetRowProps<TItem> {
  readonly sheet: SheetDocument;
  readonly sheetItemIndex: number;
  readonly item: TItem;
}
