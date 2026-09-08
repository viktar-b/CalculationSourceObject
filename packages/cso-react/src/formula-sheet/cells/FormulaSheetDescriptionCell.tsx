import type { ReactElement, ReactNode } from 'react';
import { FORMULA_SHEET_DESCRIPTION_CELL_CLASS } from '../tokens.ts';

export interface FormulaSheetDescriptionCellProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export const FormulaSheetDescriptionCell = ({
  children,
  className = '',
}: FormulaSheetDescriptionCellProps): ReactElement => {
  return (
    <div className={`${FORMULA_SHEET_DESCRIPTION_CELL_CLASS} ${className}`}>
      {children}
    </div>
  );
};
