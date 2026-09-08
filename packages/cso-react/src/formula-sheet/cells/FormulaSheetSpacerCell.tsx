import type { ReactElement } from 'react';
import { FORMULA_SHEET_SPACER_CELL_CLASS } from '../tokens.ts';

export interface FormulaSheetSpacerCellProps {
  readonly className?: string;
}

export const FormulaSheetSpacerCell = ({
  className = '',
}: FormulaSheetSpacerCellProps): ReactElement => {
  return <div className={`${FORMULA_SHEET_SPACER_CELL_CLASS} ${className}`} />;
};
