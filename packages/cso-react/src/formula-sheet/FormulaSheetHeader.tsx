import type { ReactElement } from 'react';
import { FormulaSheetCommentCell } from './cells/FormulaSheetCommentCell.tsx';
import { FormulaSheetDescriptionCell } from './cells/FormulaSheetDescriptionCell.tsx';
import { FormulaSheetSpacerCell } from './cells/FormulaSheetSpacerCell.tsx';
import { FormulaSheetSymbolCell } from './cells/FormulaSheetSymbolCell.tsx';
import { FormulaSheetUnitCell } from './cells/FormulaSheetUnitCell.tsx';
import { FormulaSheetValueCell } from './cells/FormulaSheetValueCell.tsx';

export const FormulaSheetHeader = (): ReactElement => (
  <header className="min-w-0">
    <h2 className="text-[18px] font-semibold text-black">Calculations</h2>
    <div className="flex min-w-0 flex-row border-t border-gray-300">
      <FormulaSheetSpacerCell />
      <FormulaSheetDescriptionCell>Description</FormulaSheetDescriptionCell>
      <FormulaSheetSymbolCell initColumn={true}>
        Symbol Name
      </FormulaSheetSymbolCell>
      <FormulaSheetValueCell initColumn={true}>Value</FormulaSheetValueCell>
      <FormulaSheetUnitCell initColumn={true}>Unit</FormulaSheetUnitCell>
      <FormulaSheetCommentCell>Comment</FormulaSheetCommentCell>
    </div>
  </header>
);
