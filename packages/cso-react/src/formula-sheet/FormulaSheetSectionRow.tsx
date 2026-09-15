import type { SheetSection } from '@cs-object/core';
import type { ReactElement } from 'react';
import { FormulaSheetItemIndex } from './FormulaSheetItemIndex.tsx';
import type { FormulaSheetRowProps } from './FormulaSheetRowProps.ts';

export type FormulaSheetSectionRowProps = FormulaSheetRowProps<SheetSection>;

export const FormulaSheetSectionRow = ({
  sheetItemIndex,
  item: section,
}: FormulaSheetSectionRowProps): ReactElement => {
  return (
    <div className="flex flex-col">
      <div className="block flex-1 border-t border-gray-300 px-[3mm] py-[5px] font-['Plus_Jakarta_Sans'] text-[13px] font-semibold text-black/80 min-md:px-0">
        <span>
          <FormulaSheetItemIndex index={sheetItemIndex} />{' '}
          {section.title || 'Untitled Section'}
        </span>
      </div>
    </div>
  );
};
