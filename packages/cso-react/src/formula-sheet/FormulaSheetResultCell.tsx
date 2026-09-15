import {
  isSheetLiteralEmpty,
  sheetLiteralToDisplayString,
} from '@cs-object/core';
import type { SheetLiteral } from '@cs-object/core';
import type { ReactElement } from 'react';
import { FormulaSheetValueCell } from './cells/FormulaSheetValueCell.tsx';

export interface FormulaSheetResultCellProps {
  readonly literal: SheetLiteral;
}

export const FormulaSheetResultCell = ({
  literal,
}: FormulaSheetResultCellProps): ReactElement => {
  const formattedValue = sheetLiteralToDisplayString(literal);

  return (
    <FormulaSheetValueCell>
      {isSheetLiteralEmpty(literal) ? (
        <span className="rounded-sm bg-orange-500 px-1.5 py-0 text-black opacity-70">
          NaN
        </span>
      ) : (
        formattedValue
      )}
    </FormulaSheetValueCell>
  );
};
