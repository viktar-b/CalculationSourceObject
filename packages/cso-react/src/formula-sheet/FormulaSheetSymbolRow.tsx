import { GlyphMathBlock } from '../mathml/GlyphMathBlock.tsx';
import { UnitMathBlock } from '../mathml/UnitMathBlock.tsx';
import { getValueNodeByKey } from '@cs-object/core';
import type { SheetSymbol } from '@cs-object/core';
import type { ReactElement } from 'react';
import { FormulaSheetCommentCell } from './cells/FormulaSheetCommentCell.tsx';
import { FormulaSheetDescriptionCell } from './cells/FormulaSheetDescriptionCell.tsx';
import { FormulaSheetSpacerCell } from './cells/FormulaSheetSpacerCell.tsx';
import { FormulaSheetSymbolCell } from './cells/FormulaSheetSymbolCell.tsx';
import { FormulaSheetUnitCell } from './cells/FormulaSheetUnitCell.tsx';
import { FormulaSheetItemIndex } from './FormulaSheetItemIndex.tsx';
import type { FormulaSheetRowProps } from './FormulaSheetRowProps.ts';
import { FormulaSheetResultCell } from './FormulaSheetResultCell.tsx';
import { FormulaSheetValueTree } from './FormulaSheetValueTree.tsx';

export type FormulaSheetSymbolRowProps = FormulaSheetRowProps<SheetSymbol>;

export const FormulaSheetSymbolRow = ({
  sheet,
  sheetItemIndex,
  item: symbol,
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

          <FormulaSheetResultCell literal={symbol.valueTree.result} />

          <FormulaSheetUnitCell>
            <UnitMathBlock unit={symbolUnit} optional={true} />
          </FormulaSheetUnitCell>
          <FormulaSheetCommentCell>
            {symbolComment || ' '}
          </FormulaSheetCommentCell>
        </div>

        {!symbolIsSolidLiteral && (
          <div className="flex min-w-0">
            <div className="w-full min-w-0 overflow-visible border-t border-gray-300 text-[14px]">
              <div className="my-2 flex min-w-0">
                <FormulaSheetSpacerCell />
                <div className="min-w-0 max-w-full flex-1 overflow-visible">
                  <FormulaSheetValueTree sheet={sheet} symbol={symbol} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
