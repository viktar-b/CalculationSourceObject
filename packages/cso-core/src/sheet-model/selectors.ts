import type {
  SheetDocument,
  SheetSection,
  SheetSectionItem,
  SheetSymbol,
  SheetValueNode,
  SheetValueTree,
} from './types.ts';

export type SheetRenderableItem =
  | {
      readonly kind: 'section';
      readonly section: SheetSection;
    }
  | {
      readonly kind: 'symbol';
      readonly symbol: SheetSymbol;
    };

export const getRootSection = (sheet: SheetDocument): SheetSection => {
  const section = getSectionById(sheet, sheet.rootSectionId);

  if (!section) {
    throw new Error(`Root section '${sheet.rootSectionId}' not found`);
  }

  return section;
};

export const getSectionById = (
  sheet: SheetDocument,
  sectionId: string,
): SheetSection | undefined =>
  sheet.sections.find((section) => section.id === sectionId);

export const getSymbolById = (
  sheet: SheetDocument,
  symbolId: string,
): SheetSymbol | undefined =>
  sheet.symbols.find((symbol) => symbol.id === symbolId);

export const getValueNodeByKeyOrUndefined = (
  valueTree: SheetValueTree,
  nodeKey: string,
): SheetValueNode | undefined =>
  valueTree.nodes.find((node) => node.key === nodeKey);

export const getValueNodeByKey = (
  valueTree: SheetValueTree,
  nodeKey: string,
): SheetValueNode => {
  const node = getValueNodeByKeyOrUndefined(valueTree, nodeKey);

  if (!node) {
    throw new Error(`Value-tree node '${nodeKey}' not found`);
  }

  return node;
};

export const getSectionItems = (
  sheet: SheetDocument,
  sectionId: string,
): readonly SheetRenderableItem[] =>
  getSectionItemsInternal(sheet, sectionId, new Set());

export const getRootSectionItems = (
  sheet: SheetDocument,
): readonly SheetRenderableItem[] =>
  getSectionItems(sheet, sheet.rootSectionId);

const getSectionItemsInternal = (
  sheet: SheetDocument,
  sectionId: string,
  visitedSectionIds: Set<string>,
): readonly SheetRenderableItem[] => {
  const section = getSectionById(sheet, sectionId);

  if (!section) {
    throw new Error(`Section '${sectionId}' not found`);
  }

  if (visitedSectionIds.has(sectionId)) {
    throw new Error(
      `Section '${sectionId}' creates a recursive sheet reference`,
    );
  }

  visitedSectionIds.add(sectionId);

  return section.items.flatMap((item) => {
    const resolvedItem = resolveSectionItem(sheet, item);

    if (resolvedItem.kind === 'symbol') {
      return [resolvedItem];
    }

    return [
      resolvedItem,
      ...getSectionItemsInternal(
        sheet,
        resolvedItem.section.id,
        new Set(visitedSectionIds),
      ),
    ];
  });
};

export const resolveSectionItem = (
  sheet: SheetDocument,
  item: SheetSectionItem,
): SheetRenderableItem => {
  if (item.kind === 'section') {
    const section = getSectionById(sheet, item.id);

    if (!section) {
      throw new Error(`Section item '${item.id}' not found`);
    }

    return { kind: 'section', section };
  }

  const symbol = getSymbolById(sheet, item.id);

  if (!symbol) {
    throw new Error(`Symbol item '${item.id}' not found`);
  }

  return { kind: 'symbol', symbol };
};
