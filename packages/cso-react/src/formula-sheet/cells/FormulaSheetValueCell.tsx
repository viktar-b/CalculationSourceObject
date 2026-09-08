import type { ReactElement, ReactNode } from 'react';
import {
  FORMULA_SHEET_VALUE_CELL_BASE_CLASS,
  FORMULA_SHEET_VALUE_CELL_HEADER_CLASS,
  FORMULA_SHEET_VALUE_CELL_VALUE_CLASS,
} from '../tokens.ts';

export interface FormulaSheetValueCellProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly initColumn?: boolean;
}

export const FormulaSheetValueCell = ({
  children,
  className = '',
  initColumn = false,
}: FormulaSheetValueCellProps): ReactElement => {
  const variantClass = initColumn
    ? FORMULA_SHEET_VALUE_CELL_HEADER_CLASS
    : FORMULA_SHEET_VALUE_CELL_VALUE_CLASS;

  return (
    <div
      className={`${FORMULA_SHEET_VALUE_CELL_BASE_CLASS} ${variantClass} ${className}`}
    >
      {children}
    </div>
  );
};
