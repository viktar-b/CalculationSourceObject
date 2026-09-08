import type { ReactElement, ReactNode } from 'react';
import { FORMULA_SHEET_COMMENT_CELL_CLASS } from '../tokens.ts';

export interface FormulaSheetCommentCellProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export const FormulaSheetCommentCell = ({
  children,
  className = '',
}: FormulaSheetCommentCellProps): ReactElement => {
  return (
    <div className={`${FORMULA_SHEET_COMMENT_CELL_CLASS} ${className}`}>
      {children}
    </div>
  );
};
