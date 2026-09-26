import { z } from 'zod';
import { notationIdentity } from '../notation/identity.ts';
import { parseNotation } from '../notation/parse.ts';

const subscriptPattern = /^([^_^]+)_(?:\{([^{}]+)\}|([A-Za-z0-9]+))$/;
const basePattern = /^(?:[A-Za-z0-9]+|\\[A-Za-z]+)$/;

/** Display identity travels with its quantity and authored scope. */
export const SymbolDisplaySchema = z
  .strictObject({
    id: z.string().min(1),
    glyph: z.string(),
    notationScope: z.string().min(1).optional(),
  })
  .superRefine((symbol, ctx) => {
    const parsed = parseNotation(symbol.glyph);
    if (!parsed.ok)
      ctx.addIssue({
        code: 'custom',
        path: ['glyph'],
        message: `Invalid glyph notation at offset ${parsed.diagnostic.offset}: ${parsed.diagnostic.message}`,
        params: { diagnosticCode: 'INVALID_NOTATION', symbolId: symbol.id },
      });
  });
type SymbolDisplay = z.infer<typeof SymbolDisplaySchema>;

export const symbolDisplayFrom = (symbol: SymbolDisplay): SymbolDisplay => ({
  id: symbol.id,
  glyph: symbol.glyph,
  ...(symbol.notationScope === undefined
    ? {}
    : { notationScope: symbol.notationScope }),
});

export const symbolDisplayIdentity = (
  symbol: Pick<SymbolDisplay, 'glyph' | 'notationScope'>,
): string => {
  const parsed = parseNotation(symbol.glyph);
  const identity = parsed.ok
    ? notationIdentity(parsed.value)
    : JSON.stringify(['invalid-notation', symbol.glyph]);
  return JSON.stringify([symbol.notationScope ?? null, identity]);
};

export const addSymbolDisplayIssues = (
  definitions: Iterable<{
    readonly symbol: SymbolDisplay;
    readonly path: readonly (string | number)[];
  }>,
  ctx: z.RefinementCtx,
): void => {
  const seen = new Map<string, string>();
  for (const { symbol, path } of definitions) {
    const identity = symbolDisplayIdentity(symbol);
    const previous = seen.get(identity);
    if (previous !== undefined && previous !== symbol.id)
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'glyph'],
        message: `Distinct quantities ${previous} and ${symbol.id} share glyph ${symbol.glyph}`,
        params: { diagnosticCode: 'DUPLICATE_GLYPH', symbolId: symbol.id },
      });
    seen.set(identity, symbol.id);
  }
};

export const scopedGlyph = (glyph: string, scope: string): string => {
  // Keep full binding names in evidence and compact initials in the document.
  const displayScope = scope
    .split(',')
    .map((binding) => {
      const words = binding.split('_').filter(Boolean);
      return words.length > 1
        ? words.map((word) => [...word][0]).join('')
        : binding;
    })
    .join(',');
  const subscript = subscriptPattern.exec(glyph);
  if (subscript) {
    return `${subscript[1]}_{${subscript[2] ?? subscript[3]},${displayScope}}`;
  }
  const base = basePattern.test(glyph) ? glyph : `{${glyph}}`;
  return `${base}_{${displayScope}}`;
};
