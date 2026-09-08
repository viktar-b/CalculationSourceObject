import { deriveGlyphCodeName } from '../sheet-model/glyphCodeName.ts';
import { emptyLiteral } from '../sheet-model/literals.ts';
import { SheetDocumentSchema } from '../sheet-model/schema.ts';
import type {
  SheetDocument,
  SheetLiteral,
  SheetSection,
  SheetSymbol,
  SheetValueNode,
} from '../sheet-model/types.ts';
import type {
  ValueTreeSheet,
  ValueTreeSheetDiagnostics,
  ValueTreeSheetOptions,
} from '../sheet-model/conversion.ts';
import type {
  CalculationSourceLiteral,
  CalculationSourceObject,
  CalculationSourceSectionItem,
  CalculationSourceSymbol,
  CalculationSourceValueNode,
} from './object-schema.ts';
import { parseCalculationSourceJson } from './parse.ts';

const sourceLiteralToSheetLiteral = (
  literal: CalculationSourceLiteral | null | undefined,
): SheetLiteral => {
  if (!literal) {
    return emptyLiteral();
  }

  return literal;
};

const convertSourceValueNode = (
  node: CalculationSourceValueNode,
): SheetValueNode => {
  const metadata: Pick<SheetValueNode, 'result' | 'tags'> = {
    ...(node.result !== undefined
      ? { result: sourceLiteralToSheetLiteral(node.result) }
      : {}),
    ...(node.tags !== undefined ? { tags: node.tags } : {}),
  };

  if (node.mode === 'FUNCTION') {
    if (!node.funcSpec) {
      throw new Error(`Function node '${node.key}' does not include funcSpec`);
    }

    return {
      kind: 'function',
      key: node.key,
      functionId: node.funcSpec.id,
      argKeys: (node.funcArgs ?? []).map((arg) => arg.key),
      ...metadata,
    };
  }

  if (node.mode === 'SYMBOL') {
    if (!node.symbol) {
      return {
        kind: 'literal',
        key: node.key,
        value: sourceLiteralToSheetLiteral(node.literal),
        ...(node.draft !== undefined ? { draft: node.draft } : {}),
        ...metadata,
      };
    }

    return {
      kind: 'symbol',
      key: node.key,
      symbolId: node.symbol.id,
      ...metadata,
    };
  }

  return {
    kind: 'literal',
    key: node.key,
    value: sourceLiteralToSheetLiteral(node.literal),
    ...(node.draft !== undefined ? { draft: node.draft } : {}),
    ...metadata,
  };
};

const convertSourceSymbol = (symbol: CalculationSourceSymbol): SheetSymbol => ({
  id: symbol.id,
  glyph: symbol.glyph,
  glyphCodeName: deriveGlyphCodeName({
    id: symbol.id,
    glyph: symbol.glyph,
    glyphPlaintext: symbol.glyphPlaintext,
  }),
  description: symbol.description ?? '',
  unit: symbol.unit ?? '',
  comment: symbol.comment ?? '',
  valueTree: {
    rootKey: symbol.valueTree.rootKey,
    result: sourceLiteralToSheetLiteral(symbol.valueTree.result),
    nodes: symbol.valueTree.nodes.map(convertSourceValueNode),
  },
});

const sectionItemToSheetItem = (
  item: CalculationSourceSectionItem,
): SheetSection['items'][number] | undefined => {
  if (item.kind === 'section') {
    return {
      kind: 'section',
      id: item.id,
    };
  }

  if (item.kind === 'symbol' || item.kind === 'symbolRef') {
    return {
      kind: 'symbol',
      id: item.kind === 'symbol' ? item.symbol.id : item.id,
    };
  }

  return undefined;
};

const buildRootSection = ({
  document,
  options,
}: {
  readonly document: CalculationSourceObject;
  readonly options: ValueTreeSheetOptions;
}): {
  readonly rootSectionId: string;
  readonly rootSection: SheetSection | undefined;
} => {
  if (document.rootSectionIds.length === 1) {
    return {
      rootSectionId: document.rootSectionIds[0] ?? options.id,
      rootSection: undefined,
    };
  }

  const rootSectionId = options.sheetId ?? `${document.source.id}-root-section`;

  return {
    rootSectionId,
    rootSection: {
      id: rootSectionId,
      title: document.title || options.label,
      items: document.rootSectionIds.map((id) => ({ kind: 'section', id })),
    },
  };
};

const collectSourceSymbolsById = (
  document: CalculationSourceObject,
): ReadonlyMap<string, CalculationSourceSymbol> => {
  const symbolsById = new Map<string, CalculationSourceSymbol>();

  for (const section of document.sections) {
    for (const item of section.items) {
      if (item.kind === 'symbol') {
        symbolsById.set(item.symbol.id, item.symbol);
      }
    }
  }

  for (const item of document.detachedItems ?? []) {
    if (item.kind === 'symbol') {
      symbolsById.set(item.symbol.id, item.symbol);
    }
  }

  return symbolsById;
};

const collectReferencedSymbolIds = (
  symbol: CalculationSourceSymbol,
): readonly string[] =>
  symbol.valueTree.nodes.flatMap((node) =>
    node.mode === 'SYMBOL' && node.symbol ? [node.symbol.id] : [],
  );

const collectRenderableSymbols = (
  document: CalculationSourceObject,
): readonly SheetSymbol[] => {
  const sourceSymbolsById = collectSourceSymbolsById(document);
  const includedSourceSymbolsById = new Map<string, CalculationSourceSymbol>();
  const pendingIds = document.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.kind === 'symbol'
        ? [item.symbol.id]
        : item.kind === 'symbolRef'
          ? [item.id]
          : [],
    ),
  );
  let pendingIndex = 0;

  while (pendingIndex < pendingIds.length) {
    const symbolId = pendingIds[pendingIndex];
    pendingIndex += 1;

    if (!symbolId || includedSourceSymbolsById.has(symbolId)) {
      continue;
    }

    const symbol = sourceSymbolsById.get(symbolId);

    if (!symbol) {
      continue;
    }

    includedSourceSymbolsById.set(symbolId, symbol);
    pendingIds.push(...collectReferencedSymbolIds(symbol));
  }

  return [...includedSourceSymbolsById.values()].map(convertSourceSymbol);
};

const countFormulaSymbols = (symbols: readonly SheetSymbol[]): number =>
  symbols.filter((symbol) => {
    const rootNode = symbol.valueTree.nodes.find(
      (node) => node.key === symbol.valueTree.rootKey,
    );

    return rootNode?.kind === 'function';
  }).length;

export const createSheetFromCalculationSourceObject = (
  document: CalculationSourceObject,
  options: ValueTreeSheetOptions,
): ValueTreeSheet => {
  const convertedSections = document.sections.map(
    (section): SheetSection => ({
      id: section.id,
      title: section.title,
      items: section.items.flatMap((item) => {
        const sheetItem = sectionItemToSheetItem(item);

        return sheetItem ? [sheetItem] : [];
      }),
    }),
  );
  const { rootSection, rootSectionId } = buildRootSection({
    document,
    options,
  });
  const symbols = collectRenderableSymbols(document);
  const sections = rootSection
    ? [rootSection, ...convertedSections]
    : convertedSections;
  const sheet: SheetDocument = SheetDocumentSchema.parse({
    id: options.sheetId ?? options.id,
    title: document.title || options.label,
    rootSectionId,
    sections,
    symbols,
  });
  const diagnostics: ValueTreeSheetDiagnostics = {
    compactSections: document.sections.length,
    compactSymbols: symbols.length,
    formulaCount: countFormulaSymbols(symbols),
    unresolvedReferences: 0,
    unsupportedFunctions: 0,
  };

  return {
    id: options.id,
    label: options.label,
    description:
      options.description ??
      `${document.sections.length} sections, ${symbols.length} symbols`,
    sheet,
    diagnostics,
  };
};

export const createSheetFromCalculationSourceJson = (
  source: unknown,
  options: ValueTreeSheetOptions,
): ValueTreeSheet =>
  createSheetFromCalculationSourceObject(
    parseCalculationSourceJson(source, options.description ?? options.label),
    options,
  );
