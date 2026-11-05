import { GlyphMathBlock } from '../mathml/GlyphMathBlock.tsx';
import { UnitMathBlock } from '../mathml/UnitMathBlock.tsx';
import { getValueNodeByKey } from '@cs-object/core';
import type { NumericKind, SheetSymbol } from '@cs-object/core';
import type { ReactElement, ReactNode } from 'react';
import { FormulaSheetCommentCell } from './cells/FormulaSheetCommentCell.tsx';
import { FormulaSheetDescriptionCell } from './cells/FormulaSheetDescriptionCell.tsx';
import { FormulaSheetSpacerCell } from './cells/FormulaSheetSpacerCell.tsx';
import { FormulaSheetSymbolCell } from './cells/FormulaSheetSymbolCell.tsx';
import { FormulaSheetUnitCell } from './cells/FormulaSheetUnitCell.tsx';
import { FormulaSheetItemIndex } from './FormulaSheetItemIndex.tsx';
import type { FormulaSheetRowProps } from './FormulaSheetRowProps.ts';
import { FormulaSheetResultCell } from './FormulaSheetResultCell.tsx';
import { FormulaSheetValueTree } from './FormulaSheetValueTree.tsx';
import { FormulaSheetValueCell } from './cells/FormulaSheetValueCell.tsx';

export type FormulaSheetSymbolRowProps = FormulaSheetRowProps<SheetSymbol> & {
  readonly symbolicOnly?: boolean;
  readonly showFormula?: boolean;
  readonly numericKind?: NumericKind;
  readonly compactBinding?: boolean;
  readonly bindingOrigin?: ReactNode;
};

export const bindingOrigin = ({
  sheet,
  symbol,
  label,
  computedReference = false,
}: {
  sheet: FormulaSheetRowProps<SheetSymbol>['sheet'];
  symbol: SheetSymbol;
  label?: string;
  computedReference?: boolean;
}): ReactNode => {
  const root = getValueNodeByKey(symbol.valueTree, symbol.valueTree.rootKey);
  const source =
    root.kind === 'symbol'
      ? sheet.symbols.find((item) => item.id === root.symbolId)
      : computedReference && root.kind === 'function'
        ? symbol
        : undefined;
  if (root.kind === 'symbol' && !source)
    throw new Error(`Missing binding origin '${root.symbolId}'`);
  if (source)
    return (
      <span data-binding-origin={source.id} data-binding-call={label}>
        {label ? `${label}: ` : ''}From <GlyphMathBlock glyph={source.glyph} />
      </span>
    );
  if (root.kind === 'literal' && root.value.kind === 'number')
    return (
      <span data-binding-origin="literal" data-binding-call={label}>
        {label ? `${label}: ` : ''}Given{' '}
        {root.draft ||
          (Object.is(root.value.value, -0) ? '-0' : String(root.value.value))}
      </span>
    );
  return undefined;
};

export const FormulaSheetSymbolRow = ({
  sheet,
  sheetItemIndex,
  item: symbol,
  symbolicOnly = false,
  showFormula = true,
  numericKind,
  compactBinding = false,
  bindingOrigin: suppliedOrigin,
}: FormulaSheetSymbolRowProps): ReactElement => {
  const { glyph: symbolGlyph } = symbol;
  const symbolUnit = symbol.unit ?? '';
  const symbolDescription = symbol.description;
  const symbolComment = symbol.comment ?? '';
  const rootNode = getValueNodeByKey(
    symbol.valueTree,
    symbol.valueTree.rootKey,
  );
  const symbolIsSolidLiteral = rootNode.kind === 'literal';
  const origin =
    suppliedOrigin ??
    (compactBinding ? bindingOrigin({ sheet, symbol }) : undefined);

  return (
    <div className="cso-symbol-row flex min-w-0 flex-col">
      <div className="min-w-0">
        <div className="flex min-w-0 border-t border-gray-300">
          <FormulaSheetSpacerCell />
          <FormulaSheetDescriptionCell>
            <span>
              <FormulaSheetItemIndex index={sheetItemIndex} />{' '}
              {symbolDescription}
            </span>
          </FormulaSheetDescriptionCell>

          <FormulaSheetSymbolCell>
            <GlyphMathBlock
              glyph={symbolGlyph}
              mathProps={{ className: 'shrink-0' }}
            />
          </FormulaSheetSymbolCell>

          {symbolicOnly ? (
            <FormulaSheetValueCell>
              <span
                className="cso-symbolic-value"
                role="img"
                aria-label="Value not yet defined"
              >
                ×
              </span>
            </FormulaSheetValueCell>
          ) : (
            <FormulaSheetResultCell
              literal={symbol.valueTree.result}
              numericKind={numericKind}
            />
          )}

          <FormulaSheetUnitCell>
            <UnitMathBlock unit={symbolUnit} optional={true} />
          </FormulaSheetUnitCell>
          <FormulaSheetCommentCell>
            {origin ? <div>{origin}</div> : null}
            {symbolComment || ' '}
          </FormulaSheetCommentCell>
        </div>

        {showFormula &&
          !origin &&
          (!symbolIsSolidLiteral ||
            (symbolicOnly &&
              rootNode.kind === 'literal' &&
              rootNode.value.kind !== 'empty')) && (
            <div className="flex min-w-0" data-derivation="true">
              <div className="w-full min-w-0 overflow-visible border-t border-gray-300 text-[14px]">
                <div className="my-2 flex min-w-0">
                  <FormulaSheetSpacerCell />
                  <div className="min-w-0 max-w-full flex-1 overflow-visible">
                    <FormulaSheetValueTree
                      sheet={sheet}
                      symbol={symbol}
                      symbolicOnly={symbolicOnly}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};
