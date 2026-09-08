import type { CalculationSourceSymbol } from '@viktar-b/cso-core';

// Follow only nodes reachable from each root; inactive records remain evidence.
export const activeSymbolIds = (
  initialIds: Iterable<string>,
  definitionsById: ReadonlyMap<string, CalculationSourceSymbol>,
): Set<string> => {
  const reachableSymbolIds = new Set(initialIds);
  for (const id of reachableSymbolIds) {
    const symbol = definitionsById.get(id);
    if (!symbol) continue;
    const nodes = new Map(
      symbol.valueTree.nodes.map((node) => [node.key, node]),
    );
    const pending = [symbol.valueTree.rootKey];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const key = pending.pop();
      if (key === undefined || visited.has(key)) continue;
      visited.add(key);
      const node = nodes.get(key);
      if (node?.mode === 'SYMBOL' && node.symbol) {
        reachableSymbolIds.add(node.symbol.id);
      } else if (node?.mode === 'FUNCTION') {
        pending.push(...(node.funcArgs ?? []).map((argument) => argument.key));
      }
    }
  }
  return reachableSymbolIds;
};
