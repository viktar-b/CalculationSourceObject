import type { ReactElement, ReactNode } from 'react';
import {
  FORMULA_SHEET_SYMBOL_CELL_BASE_CLASS,
  FORMULA_SHEET_SYMBOL_CELL_HEADER_CLASS,
  FORMULA_SHEET_SYMBOL_CELL_VALUE_CLASS,
} from '../tokens.ts';

export interface FormulaSheetSymbolCellProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly initColumn?: boolean;
}

export const FormulaSheetSymbolCell = ({
  children,
  className = '',
  initColumn = false,
}: FormulaSheetSymbolCellProps): ReactElement => {
  const variantClass = initColumn
    ? FORMULA_SHEET_SYMBOL_CELL_HEADER_CLASS
    : FORMULA_SHEET_SYMBOL_CELL_VALUE_CLASS;

  return (
    <div
      className={`${FORMULA_SHEET_SYMBOL_CELL_BASE_CLASS} ${variantClass} ${className}`}
    >
      {children}
    </div>
  );
};
