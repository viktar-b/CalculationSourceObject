import { FormulaSheetHeader } from './formula-sheet/FormulaSheetHeader.tsx';
import { FormulaSheetItem } from './formula-sheet/FormulaSheetItem.tsx';
import {
  type SheetRenderableItem,
  getRootSectionItems,
} from '@viktar-b/cso-core';
import type { SheetDocument } from '@viktar-b/cso-core';
import type { ReactElement } from 'react';

export interface FormulaSheetProps {
  sheet: SheetDocument;
}

const getFormulaSheetItemKey = (
  item: SheetRenderableItem,
  sheetItemIndex: number,
): string =>
  `${sheetItemIndex}-${item.kind}-${
    item.kind === 'section' ? item.section.id : item.symbol.id
  }`;

export const FormulaSheet = ({ sheet }: FormulaSheetProps): ReactElement => {
  const sheetItems = getRootSectionItems(sheet);

  return (
    <article
      data-formula-sheet="true"
      className="flex min-h-[297mm] w-[210mm] min-w-[210mm] max-w-none flex-col items-stretch border border-gray-300 bg-white p-[5mm] [&_*:focus-visible]:outline-none"
    >
      <FormulaSheetHeader />

      {sheetItems.map((item, sheetItemIndex) => (
        <FormulaSheetItem
          sheet={sheet}
          key={getFormulaSheetItemKey(item, sheetItemIndex)}
          item={item}
          sheetItemIndex={sheetItemIndex}
        />
      ))}
    </article>
  );
};
