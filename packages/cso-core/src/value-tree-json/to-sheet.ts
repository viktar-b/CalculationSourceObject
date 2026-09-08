import { SheetDocumentSchema } from '../sheet-model/schema.ts';
import type {
  SheetSection,
  SheetSymbol,
  SheetValueNode,
  SheetValueTree,
} from '../sheet-model/types.ts';
import {
  emptyLiteral,
  sheetLiteralFromJsonValue,
  sheetLiteralToDraft,
} from '../sheet-model/literals.ts';
import { deriveGlyphCodeName } from '../sheet-model/glyphCodeName.ts';
import { parseValueTreeJson } from './parse.ts';
import type {
  ValueTreeJsonDocument,
  ValueTreeJsonLiteral,
  ValueTreeJsonNode,
  ValueTreeJsonSection,
  ValueTreeJsonSymbol,
} from './types.ts';

import type {
  ValueTreeSheet,
  ValueTreeSheetOptions,
} from '../sheet-model/conversion.ts';
export type {
  Calculation,
  CalculationOptions,
  ValueTreeSheet,
  ValueTreeSheetDiagnostics,
  ValueTreeSheetOptions,
} from '../sheet-model/conversion.ts';

type ConversionContext = {
  readonly sourceId: string;
  readonly symbolIdByReference: ReadonlyMap<string, string>;
};

const safeIdPart = (value: string, fallback: string): string => {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || fallback;
};

const symbolIdFromJson = ({
  sourceId,
  sectionIndex,
  symbolIndex,
  symbol,
}: {
  readonly sourceId: string;
  readonly sectionIndex: number;
  readonly symbolIndex: number;
  readonly symbol: ValueTreeJsonSymbol;
}): string => {
  if (symbol.id) {
    return symbol.id;
  }

  return symbol.varname
    ? `${sourceId}-symbol-${sectionIndex}-${symbolIndex}-${safeIdPart(
        symbol.varname,
        'symbol',
      )}`
    : `${sourceId}-symbol-${sectionIndex}-${symbolIndex}`;
};

const buildSymbolIdByReference = (
  sections: readonly ValueTreeJsonSection[],
  sourceId: string,
): ReadonlyMap<string, string> => {
  const symbolIdByReference = new Map<string, string>();

  sections.forEach((section, sectionIndex) => {
    section.symbols.forEach((symbol, symbolIndex) => {
      const symbolId = symbolIdFromJson({
        sourceId,
        sectionIndex,
        symbolIndex,
        symbol,
      });

      if (symbol.id) {
        symbolIdByReference.set(symbol.id, symbolId);
      }

      if (symbol.varname) {
        symbolIdByReference.set(symbol.varname, symbolId);
      }
    });
  });

  return symbolIdByReference;
};

const jsonNodeKey = (
  node: ValueTreeJsonNode,
  nodeIndex: number,
  symbolId: string,
): string => node.key.trim() || `${symbolId}-node-${nodeIndex}`;

const literalNode = (
  key: string,
  literalValue: ValueTreeJsonLiteral | undefined,
): SheetValueNode => {
  const value = sheetLiteralFromJsonValue(literalValue ?? null);

  return {
    kind: 'literal',
    key,
    value,
    draft: sheetLiteralToDraft(value),
  };
};

const convertValueTreeNodeMetadata = (
  node: ValueTreeJsonNode,
): Pick<SheetValueNode, 'result' | 'tags'> => ({
  ...(node.result !== undefined
    ? { result: sheetLiteralFromJsonValue(node.result) }
    : {}),
  ...(node.tags !== undefined ? { tags: node.tags } : {}),
});

const convertValueTreeNode = ({
  context,
  node,
  nodeIndex,
  symbolId,
}: {
  readonly context: ConversionContext;
  readonly node: ValueTreeJsonNode;
  readonly nodeIndex: number;
  readonly symbolId: string;
}): SheetValueNode => {
  const key = jsonNodeKey(node, nodeIndex, symbolId);

  if (node.function) {
    return {
      kind: 'function',
      key,
      functionId: node.function,
      argKeys: node.arguments ?? [],
      ...convertValueTreeNodeMetadata(node),
    };
  }

  if (node.symbol) {
    const symbolId = context.symbolIdByReference.get(node.symbol);

    if (!symbolId) {
      throw new Error(`Unresolved symbol reference '${node.symbol}'`);
    }

    return {
      kind: 'symbol',
      key,
      symbolId,
      ...convertValueTreeNodeMetadata(node),
    };
  }

  return {
    ...literalNode(key, node.literal),
    ...convertValueTreeNodeMetadata(node),
  };
};

const convertValueTree = ({
  context,
  nodes: jsonNodes,
  explicitResult,
  symbolId,
}: {
  readonly context: ConversionContext;
  readonly nodes: readonly ValueTreeJsonNode[];
  readonly explicitResult: ValueTreeJsonLiteral | undefined;
  readonly symbolId: string;
}): SheetValueTree => {
  const nodes = jsonNodes.map((node, nodeIndex) =>
    convertValueTreeNode({ context, node, nodeIndex, symbolId }),
  );
  const rootNode = nodes[0];
  const result =
    explicitResult !== undefined
      ? sheetLiteralFromJsonValue(explicitResult)
      : rootNode?.kind === 'literal'
        ? rootNode.value
        : emptyLiteral();

  if (!rootNode) {
    throw new Error(`Symbol '${symbolId}' does not contain a root value node`);
  }

  return {
    rootKey: rootNode.key,
    result,
    nodes,
  };
};

const convertSection = ({
  context,
  section,
  sectionIndex,
}: {
  readonly context: ConversionContext;
  readonly section: ValueTreeJsonSection;
  readonly sectionIndex: number;
}): {
  readonly section: SheetSection;
  readonly symbols: readonly SheetSymbol[];
} => {
  const symbols = section.symbols.map((symbol, symbolIndex): SheetSymbol => {
    const symbolId = symbolIdFromJson({
      sourceId: context.sourceId,
      sectionIndex,
      symbolIndex,
      symbol,
    });

    return {
      id: symbolId,
      glyph: symbol.glyph ?? `s_{${sectionIndex}_${symbolIndex}}`,
      glyphCodeName: deriveGlyphCodeName({
        id: symbolId,
        glyph: symbol.glyph,
        glyphPlaintext: symbol.glyphPlaintext,
      }),
      description: symbol.description ?? '',
      unit: symbol.unit ?? '',
      comment: symbol.comment ?? '',
      valueTree: convertValueTree({
        context,
        nodes: symbol.valueTree,
        explicitResult: symbol.result,
        symbolId,
      }),
    };
  });

  return {
    section: {
      id: section.id?.trim() || `${context.sourceId}-section-${sectionIndex}`,
      title: section.title ?? `Section ${sectionIndex + 1}`,
      items: symbols.map((symbol) => ({ kind: 'symbol', id: symbol.id })),
    },
    symbols,
  };
};

const countFormulaSymbols = (symbols: readonly SheetSymbol[]): number =>
  symbols.filter((symbol) => {
    const rootNode = symbol.valueTree.nodes.find(
      (node) => node.key === symbol.valueTree.rootKey,
    );

    return rootNode?.kind === 'function';
  }).length;

export const createSheetFromValueTreeDocument = (
  document: ValueTreeJsonDocument,
  options: ValueTreeSheetOptions,
): ValueTreeSheet => {
  const sourceId = safeIdPart(options.id, 'value-tree');
  const rootSectionId = options.sheetId ?? `${sourceId}-sheet`;
  const context: ConversionContext = {
    sourceId,
    symbolIdByReference: buildSymbolIdByReference(document.sections, sourceId),
  };
  const convertedSections = document.sections.map((section, sectionIndex) =>
    convertSection({ context, section, sectionIndex }),
  );
  const childSections = convertedSections.map((entry) => entry.section);
  const symbols = convertedSections.flatMap((entry) => entry.symbols);
  const rootSection: SheetSection = {
    id: rootSectionId,
    title: document.title || options.label,
    items:
      options.flattenSingleSection && childSections.length === 1
        ? childSections[0].items
        : childSections.map((section) => ({ kind: 'section', id: section.id })),
  };
  const sheet = SheetDocumentSchema.parse({
    id: rootSectionId,
    title: document.title || options.label,
    rootSectionId,
    sections:
      options.flattenSingleSection && childSections.length === 1
        ? [rootSection]
        : [rootSection, ...childSections],
    symbols,
  });

  return {
    id: options.id,
    label: options.label,
    description:
      options.description ??
      `${document.sections.length} sections, ${symbols.length} symbols`,
    sheet,
    diagnostics: {
      compactSections: document.sections.length,
      compactSymbols: symbols.length,
      formulaCount: countFormulaSymbols(symbols),
      unresolvedReferences: 0,
      unsupportedFunctions: 0,
    },
  };
};

export const createSheetFromValueTreeJson = (
  source: unknown,
  options: ValueTreeSheetOptions,
): ValueTreeSheet =>
  createSheetFromValueTreeDocument(
    parseValueTreeJson(source, options.description ?? options.label),
    options,
  );

export const createCalculationFromValueTreeDocument =
  createSheetFromValueTreeDocument;

export const createCalculationFromValueTreeJson = createSheetFromValueTreeJson;
