import type { ReactElement } from 'react';

export interface FormulaSheetItemIndexProps {
  index: number;
}

export const FormulaSheetItemIndex = ({
  index,
}: FormulaSheetItemIndexProps): ReactElement => {
  return (
    <span data-formula-sheet-item-index="true" className="tabular-nums">
      {index}.
    </span>
  );
};
