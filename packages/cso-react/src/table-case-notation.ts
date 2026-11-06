import {
  type CalculationSourceSymbol,
  compactGlyphScope,
} from '@cs-object/core';

/**
 * Read a case's qualifier from captured notation, including quantities returned
 * directly by a nested helper. Unqualified quantities supply no suffix.
 */
export const tableCaseQualifier = (
  invocationId: string,
  symbols: readonly CalculationSourceSymbol[],
): string | undefined => {
  for (const symbol of symbols) {
    const owner = symbol.metadata?.invocationId;
    const scope = symbol.metadata?.glyphScope;
    if (typeof owner !== 'string' || typeof scope !== 'string') continue;
    if (owner !== invocationId && !owner.startsWith(`${invocationId}/`))
      continue;
    const nestedDepth =
      owner === invocationId
        ? 0
        : owner.slice(invocationId.length + 1).split('/').length;
    const bindings = scope.split(',');
    if (bindings.length <= nestedDepth) continue;
    return compactGlyphScope(
      bindings.slice(0, bindings.length - nestedDepth).join(','),
    );
  }
  return undefined;
};
