import { z } from 'zod';
import { glyphIdentity } from '../contracts/glyphs.ts';
import { parseNotation } from '../notation/parse.ts';
import { supportedValueFunctionIds } from './functions.ts';

const IdSchema = z.string().min(1);

export const SheetLiteralSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('empty') }).strict(),
  z.object({ kind: z.literal('number'), value: z.number() }).strict(),
  z.object({ kind: z.literal('string'), value: z.string() }).strict(),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }).strict(),
]);

const SheetValueNodeMetadataSchema = {
  result: SheetLiteralSchema.optional(),
  tags: z.array(z.unknown()).optional(),
};

export const SheetValueNodeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('literal'),
      key: IdSchema,
      value: SheetLiteralSchema,
      draft: z.string().optional(),
      ...SheetValueNodeMetadataSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('symbol'),
      key: IdSchema,
      symbolId: IdSchema,
      ...SheetValueNodeMetadataSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('function'),
      key: IdSchema,
      functionId: IdSchema,
      argKeys: z.array(IdSchema),
      ...SheetValueNodeMetadataSchema,
    })
    .strict(),
]);

export const SheetValueTreeSchema = z
  .object({
    rootKey: IdSchema,
    result: SheetLiteralSchema,
    nodes: z.array(SheetValueNodeSchema).min(1),
  })
  .strict();

export const SheetSymbolSchema = z
  .object({
    id: IdSchema,
    glyph: z.string(),
    glyphCodeName: z.string().min(1).optional(),
    description: z.string(),
    unit: z.string().optional(),
    comment: z.string().optional(),
    valueTree: SheetValueTreeSchema,
  })
  .strict()
  .superRefine((symbol, ctx) => {
    for (const field of ['glyph', 'unit'] as const) {
      const value = symbol[field];
      if (field === 'unit' && (value === undefined || value === '')) continue;
      const parsed = parseNotation(value ?? '');
      if (!parsed.ok) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `Invalid ${field} notation at offset ${parsed.diagnostic.offset}: ${parsed.diagnostic.message}`,
          params: {
            diagnosticCode: 'INVALID_NOTATION',
            symbolId: symbol.id,
          },
        });
      }
    }
  });

export const SheetSectionItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('section'), id: IdSchema }).strict(),
  z.object({ kind: z.literal('symbol'), id: IdSchema }).strict(),
]);

export const SheetSectionSchema = z
  .object({
    id: IdSchema,
    title: z.string(),
    items: z.array(SheetSectionItemSchema),
  })
  .strict();

const SheetDocumentBaseSchema = z
  .object({
    id: IdSchema,
    title: z.string(),
    rootSectionId: IdSchema,
    sections: z.array(SheetSectionSchema).min(1),
    symbols: z.array(SheetSymbolSchema),
  })
  .strict();

type SheetDocumentForRefinement = z.infer<typeof SheetDocumentBaseSchema>;
type SheetSymbolForRefinement = z.infer<typeof SheetSymbolSchema>;
type SheetValueNodeForRefinement = z.infer<typeof SheetValueNodeSchema>;

const addRootSectionIssue = (
  sheet: SheetDocumentForRefinement,
  sectionIds: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void => {
  if (sectionIds.has(sheet.rootSectionId)) {
    return;
  }

  ctx.addIssue({
    code: 'custom',
    message: `Root section '${sheet.rootSectionId}' does not resolve`,
    path: ['rootSectionId'],
  });
};

const addSectionItemIssue = ({
  ctx,
  item,
  itemIndex,
  sectionIds,
  sectionIndex,
  symbolIds,
}: {
  readonly ctx: z.RefinementCtx;
  readonly item: z.infer<typeof SheetSectionItemSchema>;
  readonly itemIndex: number;
  readonly sectionIds: ReadonlySet<string>;
  readonly sectionIndex: number;
  readonly symbolIds: ReadonlySet<string>;
}): void => {
  const resolves =
    item.kind === 'section' ? sectionIds.has(item.id) : symbolIds.has(item.id);

  if (resolves) {
    return;
  }

  ctx.addIssue({
    code: 'custom',
    message: `${item.kind} item '${item.id}' does not resolve`,
    path: ['sections', sectionIndex, 'items', itemIndex, 'id'],
  });
};

const addSectionItemIssues = (
  sheet: SheetDocumentForRefinement,
  sectionIds: ReadonlySet<string>,
  symbolIds: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void => {
  for (const [sectionIndex, section] of sheet.sections.entries()) {
    for (const [itemIndex, item] of section.items.entries()) {
      addSectionItemIssue({
        ctx,
        item,
        itemIndex,
        sectionIds,
        sectionIndex,
        symbolIds,
      });
    }
  }
};

const collectNodeKeys = (
  symbol: SheetSymbolForRefinement,
): {
  readonly nodeKeys: ReadonlySet<string>;
  readonly duplicateNodeKeys: ReadonlySet<string>;
} => {
  const nodeKeys = new Set<string>();
  const duplicateNodeKeys = new Set<string>();

  for (const node of symbol.valueTree.nodes) {
    if (nodeKeys.has(node.key)) {
      duplicateNodeKeys.add(node.key);
    }
    nodeKeys.add(node.key);
  }

  return { nodeKeys, duplicateNodeKeys };
};

const addRootNodeIssue = ({
  ctx,
  nodeKeys,
  symbol,
  symbolIndex,
}: {
  readonly ctx: z.RefinementCtx;
  readonly nodeKeys: ReadonlySet<string>;
  readonly symbol: SheetSymbolForRefinement;
  readonly symbolIndex: number;
}): void => {
  if (nodeKeys.has(symbol.valueTree.rootKey)) {
    return;
  }

  ctx.addIssue({
    code: 'custom',
    message: `Root node '${symbol.valueTree.rootKey}' does not resolve`,
    path: ['symbols', symbolIndex, 'valueTree', 'rootKey'],
  });
};

const addDuplicateNodeIssue = ({
  ctx,
  duplicateNodeKeys,
  node,
  nodeIndex,
  symbolIndex,
}: {
  readonly ctx: z.RefinementCtx;
  readonly duplicateNodeKeys: ReadonlySet<string>;
  readonly node: SheetValueNodeForRefinement;
  readonly nodeIndex: number;
  readonly symbolIndex: number;
}): void => {
  if (!duplicateNodeKeys.has(node.key)) {
    return;
  }

  ctx.addIssue({
    code: 'custom',
    message: `Duplicate value-tree node key '${node.key}'`,
    path: ['symbols', symbolIndex, 'valueTree', 'nodes', nodeIndex, 'key'],
  });
};

const addSymbolNodeIssue = ({
  ctx,
  node,
  nodeIndex,
  symbolIds,
  symbolIndex,
}: {
  readonly ctx: z.RefinementCtx;
  readonly node: Extract<SheetValueNodeForRefinement, { kind: 'symbol' }>;
  readonly nodeIndex: number;
  readonly symbolIds: ReadonlySet<string>;
  readonly symbolIndex: number;
}): void => {
  if (symbolIds.has(node.symbolId)) {
    return;
  }

  ctx.addIssue({
    code: 'custom',
    message: `Symbol reference '${node.symbolId}' does not resolve`,
    path: ['symbols', symbolIndex, 'valueTree', 'nodes', nodeIndex, 'symbolId'],
  });
};

const addFunctionNodeIssues = ({
  ctx,
  node,
  nodeIndex,
  nodeKeys,
  symbolIndex,
}: {
  readonly ctx: z.RefinementCtx;
  readonly node: Extract<SheetValueNodeForRefinement, { kind: 'function' }>;
  readonly nodeIndex: number;
  readonly nodeKeys: ReadonlySet<string>;
  readonly symbolIndex: number;
}): void => {
  if (!supportedValueFunctionIds.has(node.functionId)) {
    ctx.addIssue({
      code: 'custom',
      message: `Unsupported value function '${node.functionId}'`,
      path: [
        'symbols',
        symbolIndex,
        'valueTree',
        'nodes',
        nodeIndex,
        'functionId',
      ],
    });
  }

  for (const [argIndex, argKey] of node.argKeys.entries()) {
    if (!nodeKeys.has(argKey)) {
      ctx.addIssue({
        code: 'custom',
        message: `Function argument '${argKey}' does not resolve inside this value tree`,
        path: [
          'symbols',
          symbolIndex,
          'valueTree',
          'nodes',
          nodeIndex,
          'argKeys',
          argIndex,
        ],
      });
    }
  }
};

const addValueNodeIssues = ({
  ctx,
  duplicateNodeKeys,
  node,
  nodeIndex,
  nodeKeys,
  symbolIds,
  symbolIndex,
}: {
  readonly ctx: z.RefinementCtx;
  readonly duplicateNodeKeys: ReadonlySet<string>;
  readonly node: SheetValueNodeForRefinement;
  readonly nodeIndex: number;
  readonly nodeKeys: ReadonlySet<string>;
  readonly symbolIds: ReadonlySet<string>;
  readonly symbolIndex: number;
}): void => {
  addDuplicateNodeIssue({
    ctx,
    duplicateNodeKeys,
    node,
    nodeIndex,
    symbolIndex,
  });

  if (node.kind === 'symbol') {
    addSymbolNodeIssue({ ctx, node, nodeIndex, symbolIds, symbolIndex });
  }

  if (node.kind === 'function') {
    addFunctionNodeIssues({ ctx, node, nodeIndex, nodeKeys, symbolIndex });
  }
};

const addSymbolValueTreeIssues = ({
  ctx,
  symbol,
  symbolIds,
  symbolIndex,
}: {
  readonly ctx: z.RefinementCtx;
  readonly symbol: SheetSymbolForRefinement;
  readonly symbolIds: ReadonlySet<string>;
  readonly symbolIndex: number;
}): void => {
  const { duplicateNodeKeys, nodeKeys } = collectNodeKeys(symbol);

  addRootNodeIssue({ ctx, nodeKeys, symbol, symbolIndex });

  for (const [nodeIndex, node] of symbol.valueTree.nodes.entries()) {
    addValueNodeIssues({
      ctx,
      duplicateNodeKeys,
      node,
      nodeIndex,
      nodeKeys,
      symbolIds,
      symbolIndex,
    });
  }
};

const addSymbolReferenceIssues = (
  sheet: SheetDocumentForRefinement,
  symbolIds: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void => {
  for (const [symbolIndex, symbol] of sheet.symbols.entries()) {
    addSymbolValueTreeIssues({ ctx, symbol, symbolIds, symbolIndex });
  }
};

const addSheetReferenceIssues = (
  sheet: SheetDocumentForRefinement,
  ctx: z.RefinementCtx,
): void => {
  const sectionIds = new Set(sheet.sections.map((section) => section.id));
  const symbolIds = new Set(sheet.symbols.map((symbol) => symbol.id));

  addRootSectionIssue(sheet, sectionIds, ctx);
  addSectionItemIssues(sheet, sectionIds, symbolIds, ctx);
  addSymbolReferenceIssues(sheet, symbolIds, ctx);

  const glyphs = new Map<string, string>();
  for (const [symbolIndex, symbol] of sheet.symbols.entries()) {
    const identity = glyphIdentity(symbol.glyph);
    const previous = glyphs.get(identity);
    if (previous !== undefined && previous !== symbol.id) {
      ctx.addIssue({
        code: 'custom',
        message: `Distinct quantities ${previous} and ${symbol.id} share glyph ${symbol.glyph}`,
        path: ['symbols', symbolIndex, 'glyph'],
        params: {
          diagnosticCode: 'DUPLICATE_GLYPH',
          symbolId: symbol.id,
        },
      });
    }
    glyphs.set(identity, symbol.id);
  }
};

export const SheetDocumentSchema = SheetDocumentBaseSchema.superRefine(
  addSheetReferenceIssues,
);

export type SheetLiteral = z.infer<typeof SheetLiteralSchema>;
export type SheetValueNode = z.infer<typeof SheetValueNodeSchema>;
export type SheetValueTree = z.infer<typeof SheetValueTreeSchema>;
export type SheetSymbol = z.infer<typeof SheetSymbolSchema>;
export type SheetSectionItem = z.infer<typeof SheetSectionItemSchema>;
export type SheetSection = z.infer<typeof SheetSectionSchema>;
export type SheetDocument = z.infer<typeof SheetDocumentSchema>;
