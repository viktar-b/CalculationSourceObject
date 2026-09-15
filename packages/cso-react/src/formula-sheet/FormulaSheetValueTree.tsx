import {
  type SheetDocument,
  SheetOperatorPriority,
  type SheetSymbol,
  type SheetValueTree,
  getFunctionBinaryOperatorById,
} from '@cs-object/core';
import type { ReactElement } from 'react';
import { AsciiMathView } from '../ascii-math/AsciiMathView.tsx';
import { SymbolValueMathBlock } from '../mathml/SymbolValueMathBlock.tsx';
import { SymbolValueMathmlView } from '../mathml/symbol-value/SymbolValueMathmlView.tsx';

interface FormulaSheetValueTreeProps {
  readonly sheet: SheetDocument;
  readonly symbol: SheetSymbol;
}

// Split only a left-associated addition chain. Each term keeps its original
// tree and grouping; subtraction and right-nested expressions stay intact.
const additionTerms = (
  tree: SheetValueTree,
  key: string,
  ancestors = new Set<string>(),
): string[] => {
  if (ancestors.has(key)) {
    throw new Error(`Recursive formula node '${key}'`);
  }
  const node = tree.nodes.find((node) => node.key === key);
  if (
    node?.kind !== 'function' ||
    node.functionId !== 'fg.add' ||
    node.argKeys.length !== 2
  ) {
    return [key];
  }
  const [left, right] = node.argKeys;
  if (!(left && right)) {
    return [key];
  }
  return [...additionTerms(tree, left, new Set([...ancestors, key])), right];
};

const hasActiveSymbol = (tree: SheetValueTree): boolean => {
  const nodes = new Map(tree.nodes.map((node) => [node.key, node]));
  const pending = [tree.rootKey];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const key = pending.pop();
    if (key === undefined || visited.has(key)) continue;
    visited.add(key);
    const node = nodes.get(key);
    if (node?.kind === 'symbol') return true;
    if (node?.kind === 'function') pending.push(...node.argKeys);
  }
  return false;
};

export const FormulaSheetValueTree = ({
  sheet,
  symbol,
}: FormulaSheetValueTreeProps): ReactElement => {
  const showSymbolic = hasActiveSymbol(symbol.valueTree);
  const terms = additionTerms(symbol.valueTree, symbol.valueTree.rootKey);
  if (terms.length > 4) {
    return (
      <div className="cso-long-formula">
        {(showSymbolic ? [false, true] : [true]).map((numerical) => (
          <div
            key={String(numerical)}
            className="cso-formula-terms"
            aria-label={numerical ? 'Substitution' : 'Formula'}
          >
            {terms.map((rootKey, index) => {
              const node = symbol.valueTree.nodes.find(
                (node) => node.key === rootKey,
              );
              const operator =
                node?.kind === 'function'
                  ? getFunctionBinaryOperatorById(node.functionId)
                  : undefined;
              const grouped =
                operator !== undefined &&
                (operator.priority < SheetOperatorPriority.AddSubtract ||
                  (index > 0 &&
                    operator.priority === SheetOperatorPriority.AddSubtract));
              return (
                <span className="cso-formula-term" key={`${index}-${rootKey}`}>
                  <math display="inline">
                    {index === 0 && <AsciiMathView expression={symbol.glyph} />}
                    <mo>{index === 0 ? '=' : '+'}</mo>
                    {grouped && <mo>(</mo>}
                    <SymbolValueMathmlView
                      sheet={sheet}
                      valueTree={{ ...symbol.valueTree, rootKey }}
                      noRootContainer={true}
                      viewOptions={{ numerical, literalsAsDrafts: true }}
                    />
                    {grouped && <mo>)</mo>}
                  </math>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
  return (
    <SymbolValueMathBlock
      sheet={sheet}
      symbol={symbol}
      showGlyph={true}
      showSymbolic={showSymbolic}
      showNumeric={true}
    />
  );
};
