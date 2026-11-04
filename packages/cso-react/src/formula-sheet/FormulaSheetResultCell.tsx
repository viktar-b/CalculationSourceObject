import {
  isSheetLiteralEmpty,
  sheetLiteralToDisplayString,
} from '@cs-object/core';
import type { NumericKind, SheetLiteral } from '@cs-object/core';
import type { ReactElement } from 'react';
import { FormulaSheetValueCell } from './cells/FormulaSheetValueCell.tsx';
import { NumericalValue } from './NumericalValue.tsx';

export interface FormulaSheetResultCellProps {
  readonly literal: SheetLiteral;
  readonly numericKind?: NumericKind;
}

export const FormulaSheetResultCell = ({
  literal,
  numericKind,
}: FormulaSheetResultCellProps): ReactElement => {
  const formattedValue =
    literal.kind === 'number' ? (
      <NumericalValue value={literal.value} numericKind={numericKind} />
    ) : (
      sheetLiteralToDisplayString(literal)
    );

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
