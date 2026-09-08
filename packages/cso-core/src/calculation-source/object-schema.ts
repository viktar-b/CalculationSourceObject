import { supportedValueFunctionIds } from '../sheet-model/functions.ts';
import { z } from 'zod';

const IdSchema = z.string().min(1);
const LegacyJsonObjectSchema = z.record(z.string(), z.unknown());
const JsonObjectSchema: z.ZodType<Record<string, unknown>> = z
  .unknown()
  .transform((value, ctx) => {
    const checked = LegacyJsonObjectSchema.safeParse(value, {
      error: () => '',
    });
    if (!checked.success) {
      for (const issue of checked.error.issues) {
        const { message: _, ...issueData } = issue;
        ctx.addIssue({ ...issueData });
      }
      return z.NEVER;
    }
    if (value === null || typeof value !== 'object') {
      return z.NEVER;
    }
    return Object.fromEntries(Object.entries(value));
  });

export const CalculationSourceLiteralSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('empty') }).strict(),
  z.object({ kind: z.literal('number'), value: z.number() }).strict(),
  z.object({ kind: z.literal('string'), value: z.string() }).strict(),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }).strict(),
]);

export const CalculationSourceRootNodeSchema = z
  .object({
    key: IdSchema,
  })
  .strict();

export const CalculationSourceSymbolReferenceSchema = z
  .object({
    id: IdSchema,
  })
  .strict();

export const CalculationSourceFunctionSpecSchema = z
  .object({
    id: IdSchema,
  })
  .strict();

export const CalculationSourceFunctionArgSchema = z
  .object({
    key: IdSchema,
  })
  .strict();

export const CalculationSourceValueNodeSchema = z
  .object({
    key: IdSchema,
    mode: z.enum(['LITERAL', 'SYMBOL', 'FUNCTION']),
    draft: z.string().optional(),
    tags: z.array(z.unknown()).optional(),
    metadata: JsonObjectSchema.optional(),
    literal: CalculationSourceLiteralSchema.nullable().optional(),
    symbol: CalculationSourceSymbolReferenceSchema.nullable().optional(),
    funcSpec: CalculationSourceFunctionSpecSchema.nullable().optional(),
    funcArgs: z.array(CalculationSourceFunctionArgSchema).optional(),
    result: CalculationSourceLiteralSchema.nullable().optional(),
  })
  .strict()
  .superRefine((node, ctx) => {
    addNodeModePayloadIssues(node, ctx);
    addUnsupportedFunctionIssue(node, ctx);
  });

const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

const addNodeModePayloadIssues = (
  node: z.infer<typeof CalculationSourceValueNodeSchema>,
  ctx: z.RefinementCtx,
): void => {
  if (node.mode !== 'FUNCTION' && isPresent(node.funcSpec)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Only FUNCTION nodes may include a function spec',
      path: ['funcSpec'],
    });
  }

  if (node.mode !== 'FUNCTION' && (node.funcArgs?.length ?? 0) > 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'Only FUNCTION nodes may include function arguments',
      path: ['funcArgs'],
    });
  }

  if (node.mode !== 'SYMBOL' && isPresent(node.symbol)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Only SYMBOL nodes may include a symbol reference',
      path: ['symbol'],
    });
  }

  if (node.mode !== 'FUNCTION') {
    return;
  }

  if (!isPresent(node.funcSpec)) {
    ctx.addIssue({
      code: 'custom',
      message: 'FUNCTION nodes must include a function spec',
      path: ['funcSpec'],
      params: { diagnosticCode: 'MISSING_FUNCTION_PAYLOAD' },
    });
  }

  if (!Array.isArray(node.funcArgs)) {
    ctx.addIssue({
      code: 'custom',
      message: 'FUNCTION nodes must include funcArgs',
      path: ['funcArgs'],
      params: { diagnosticCode: 'MISSING_FUNCTION_ARGUMENTS' },
    });
  }
};

const addUnsupportedFunctionIssue = (
  node: z.infer<typeof CalculationSourceValueNodeSchema>,
  ctx: z.RefinementCtx,
): void => {
  if (
    node.mode === 'FUNCTION' &&
    isPresent(node.funcSpec) &&
    !supportedValueFunctionIds.has(node.funcSpec.id)
  ) {
    ctx.addIssue({
      code: 'custom',
      message: `Unsupported value function '${node.funcSpec.id}'`,
      path: ['funcSpec', 'id'],
    });
  }
};

export const CalculationSourceValueTreeSchema = z
  .object({
    rootKey: IdSchema,
    metadata: JsonObjectSchema.optional(),
    result: CalculationSourceLiteralSchema.nullable().optional(),
    nodes: z.array(CalculationSourceValueNodeSchema).min(1),
  })
  .strict()
  .superRefine((valueTree, ctx) => {
    const nodeKeys = new Set<string>();
    const duplicateNodeKeys = new Set<string>();

    for (const node of valueTree.nodes) {
      if (nodeKeys.has(node.key)) {
        duplicateNodeKeys.add(node.key);
      }
      nodeKeys.add(node.key);
    }

    if (!nodeKeys.has(valueTree.rootKey)) {
      ctx.addIssue({
        code: 'custom',
        message: `Root node '${valueTree.rootKey}' does not resolve`,
        path: ['rootKey'],
        params: { diagnosticCode: 'MISSING_FORMULA_ROOT' },
      });
    }

    for (const [nodeIndex, node] of valueTree.nodes.entries()) {
      if (duplicateNodeKeys.has(node.key)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate value-tree node key '${node.key}'`,
          path: ['nodes', nodeIndex, 'key'],
          params: { diagnosticCode: 'DUPLICATE_NODE_ID' },
        });
      }

      for (const [argIndex, arg] of (node.funcArgs ?? []).entries()) {
        if (!nodeKeys.has(arg.key)) {
          ctx.addIssue({
            code: 'custom',
            message: `Function argument '${arg.key}' does not resolve inside this value tree`,
            path: ['nodes', nodeIndex, 'funcArgs', argIndex, 'key'],
            params: { diagnosticCode: 'MISSING_FORMULA_OPERAND' },
          });
        }
      }
    }
  });

export const CalculationSourceSymbolSchema = z
  .object({
    id: IdSchema,
    glyph: z.string(),
    glyphPlaintext: z.string().optional(),
    description: z.string().optional(),
    unit: z.string().optional(),
    comment: z.string().optional(),
    aliases: z.unknown().optional(),
    metadata: JsonObjectSchema.optional(),
    valueTree: CalculationSourceValueTreeSchema,
  })
  .strict();

export const CalculationSourcePreservedEntitySchema = z
  .object({
    id: IdSchema.optional(),
    sourceType: z.string().optional(),
  })
  .catchall(z.unknown());

export const CalculationSourceSectionItemSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('section'),
      id: IdSchema,
      metadata: JsonObjectSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('symbol'),
      symbol: CalculationSourceSymbolSchema,
      metadata: JsonObjectSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('symbolRef'),
      id: IdSchema,
      metadata: JsonObjectSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('figure'),
      id: IdSchema,
      figure: CalculationSourcePreservedEntitySchema.optional(),
      metadata: JsonObjectSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('text'),
      id: IdSchema,
      text: CalculationSourcePreservedEntitySchema.optional(),
      metadata: JsonObjectSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('unknown'),
      id: IdSchema.optional(),
      sourceType: z.string().optional(),
      metadata: JsonObjectSchema.optional(),
    })
    .strict(),
]);

export const CalculationSourceDetachedItemSchema = z.discriminatedUnion(
  'kind',
  [
    z
      .object({
        kind: z.literal('symbol'),
        symbol: CalculationSourceSymbolSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal('figure'),
        id: IdSchema,
        figure: CalculationSourcePreservedEntitySchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal('text'),
        id: IdSchema,
        text: CalculationSourcePreservedEntitySchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal('unknown'),
        id: IdSchema.optional(),
        sourceType: z.string().optional(),
        metadata: JsonObjectSchema.optional(),
      })
      .strict(),
  ],
);

export const CalculationSourceSectionSchema = z
  .object({
    id: IdSchema,
    title: z.string(),
    metadata: JsonObjectSchema.optional(),
    items: z.array(CalculationSourceSectionItemSchema),
  })
  .strict();

const CalculationSourceOriginSchema = z
  .object({
    format: z.string().min(1),
    id: IdSchema.optional(),
    metadata: JsonObjectSchema.optional(),
  })
  .strict();

export const CalculationSourceObjectSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    title: z.string(),
    source: z
      .object({
        id: IdSchema,
        metadata: JsonObjectSchema,
        origin: CalculationSourceOriginSchema.optional(),
      })
      .strict(),
    rootSectionIds: z.array(IdSchema).min(1),
    sections: z.array(CalculationSourceSectionSchema).min(1),
    detachedItems: z.array(CalculationSourceDetachedItemSchema).optional(),
  })
  .strict()
  .superRefine((document, ctx) => {
    addDocumentReferenceIssues(document, ctx);
  });

type CalculationSourceObjectForRefinement = z.infer<
  typeof CalculationSourceObjectSchema
>;
const collectSymbolIds = (
  document: CalculationSourceObjectForRefinement,
): ReadonlySet<string> => {
  const symbolIds = new Set<string>();

  for (const section of document.sections) {
    for (const item of section.items) {
      if (item.kind === 'symbol') {
        symbolIds.add(item.symbol.id);
      }
    }
  }

  for (const item of document.detachedItems ?? []) {
    if (item.kind === 'symbol') {
      symbolIds.add(item.symbol.id);
    }
  }

  return symbolIds;
};

const addRootSectionIssues = (
  document: CalculationSourceObjectForRefinement,
  sectionIds: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void => {
  for (const [rootIndex, rootSectionId] of document.rootSectionIds.entries()) {
    if (!sectionIds.has(rootSectionId)) {
      ctx.addIssue({
        code: 'custom',
        message: `Root section '${rootSectionId}' does not resolve`,
        path: ['rootSectionIds', rootIndex],
      });
    }
  }
};

const addSectionItemReferenceIssues = (
  document: CalculationSourceObjectForRefinement,
  sectionIds: ReadonlySet<string>,
  symbolIds: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void => {
  for (const [sectionIndex, section] of document.sections.entries()) {
    for (const [itemIndex, item] of section.items.entries()) {
      if (item.kind === 'section' && !sectionIds.has(item.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Section item '${item.id}' does not resolve`,
          path: ['sections', sectionIndex, 'items', itemIndex, 'id'],
        });
      }

      if (item.kind === 'symbolRef' && !symbolIds.has(item.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Symbol reference item '${item.id}' does not resolve`,
          path: ['sections', sectionIndex, 'items', itemIndex, 'id'],
        });
      }

      if (item.kind === 'symbol') {
        addSymbolReferenceIssues({
          ctx,
          path: ['sections', sectionIndex, 'items', itemIndex, 'symbol'],
          symbolIds,
          symbol: item.symbol,
        });
      }
    }
  }
};

const addDetachedSymbolReferenceIssues = (
  document: CalculationSourceObjectForRefinement,
  symbolIds: ReadonlySet<string>,
  ctx: z.RefinementCtx,
): void => {
  for (const [itemIndex, item] of (document.detachedItems ?? []).entries()) {
    if (item.kind === 'symbol') {
      addSymbolReferenceIssues({
        ctx,
        path: ['detachedItems', itemIndex, 'symbol'],
        symbolIds,
        symbol: item.symbol,
      });
    }
  }
};

const addDuplicateSectionIssues = (
  document: CalculationSourceObjectForRefinement,
  ctx: z.RefinementCtx,
): void => {
  const seenSectionIds = new Set<string>();

  for (const [sectionIndex, section] of document.sections.entries()) {
    if (seenSectionIds.has(section.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate section id '${section.id}'`,
        path: ['sections', sectionIndex, 'id'],
      });
    }

    seenSectionIds.add(section.id);
  }
};

const addDuplicateRootSectionIssues = (
  document: CalculationSourceObjectForRefinement,
  ctx: z.RefinementCtx,
): void => {
  const seenRootSectionIds = new Set<string>();

  for (const [rootIndex, rootSectionId] of document.rootSectionIds.entries()) {
    if (seenRootSectionIds.has(rootSectionId)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate root section id '${rootSectionId}'`,
        path: ['rootSectionIds', rootIndex],
      });
    }

    seenRootSectionIds.add(rootSectionId);
  }
};

const addDuplicateSymbolIdIssue = ({
  ctx,
  path,
  seenSymbolIds,
  symbolId,
}: {
  readonly ctx: z.RefinementCtx;
  readonly path: readonly (string | number)[];
  readonly seenSymbolIds: Set<string>;
  readonly symbolId: string;
}): void => {
  if (seenSymbolIds.has(symbolId)) {
    ctx.addIssue({
      code: 'custom',
      message: `Duplicate symbol id '${symbolId}'`,
      path: [...path],
    });
  }

  seenSymbolIds.add(symbolId);
};

const addDuplicateSymbolIssues = (
  document: CalculationSourceObjectForRefinement,
  ctx: z.RefinementCtx,
): void => {
  const seenSymbolIds = new Set<string>();

  for (const [sectionIndex, section] of document.sections.entries()) {
    for (const [itemIndex, item] of section.items.entries()) {
      if (item.kind === 'symbol') {
        addDuplicateSymbolIdIssue({
          ctx,
          path: ['sections', sectionIndex, 'items', itemIndex, 'symbol', 'id'],
          seenSymbolIds,
          symbolId: item.symbol.id,
        });
      }
    }
  }

  for (const [itemIndex, item] of (document.detachedItems ?? []).entries()) {
    if (item.kind === 'symbol') {
      addDuplicateSymbolIdIssue({
        ctx,
        path: ['detachedItems', itemIndex, 'symbol', 'id'],
        seenSymbolIds,
        symbolId: item.symbol.id,
      });
    }
  }
};

const addDuplicateDetachedItemIssues = (
  document: CalculationSourceObjectForRefinement,
  ctx: z.RefinementCtx,
): void => {
  const seenDetachedItemIds = new Set<string>();

  for (const [itemIndex, item] of (document.detachedItems ?? []).entries()) {
    if (item.kind === 'symbol' || !item.id) {
      continue;
    }

    if (seenDetachedItemIds.has(item.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate detached item id '${item.id}'`,
        path: ['detachedItems', itemIndex, 'id'],
      });
    }

    seenDetachedItemIds.add(item.id);
  }
};

const addDocumentReferenceIssues = (
  document: CalculationSourceObjectForRefinement,
  ctx: z.RefinementCtx,
): void => {
  const sectionIds = new Set(document.sections.map((section) => section.id));
  const symbolIds = collectSymbolIds(document);

  addDuplicateSectionIssues(document, ctx);
  addDuplicateRootSectionIssues(document, ctx);
  addDuplicateSymbolIssues(document, ctx);
  addDuplicateDetachedItemIssues(document, ctx);
  addRootSectionIssues(document, sectionIds, ctx);
  addSectionItemReferenceIssues(document, sectionIds, symbolIds, ctx);
  addDetachedSymbolReferenceIssues(document, symbolIds, ctx);
};

const addSymbolReferenceIssues = ({
  ctx,
  path,
  symbol,
  symbolIds,
}: {
  readonly ctx: z.RefinementCtx;
  readonly path: readonly (string | number)[];
  readonly symbol: z.infer<typeof CalculationSourceSymbolSchema>;
  readonly symbolIds: ReadonlySet<string>;
}): void => {
  for (const [nodeIndex, node] of symbol.valueTree.nodes.entries()) {
    if (
      node.mode === 'SYMBOL' &&
      node.symbol &&
      !symbolIds.has(node.symbol.id)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `Symbol reference '${node.symbol.id}' does not resolve in this document`,
        path: [...path, 'valueTree', 'nodes', nodeIndex, 'symbol', 'id'],
        params: { diagnosticCode: 'UNRESOLVED_SYMBOL_REFERENCE' },
      });
    }
  }
};

export type CalculationSourceObject = z.infer<
  typeof CalculationSourceObjectSchema
>;
export type CalculationSourceSection = z.infer<
  typeof CalculationSourceSectionSchema
>;
export type CalculationSourceSectionItem = z.infer<
  typeof CalculationSourceSectionItemSchema
>;
export type CalculationSourceDetachedItem = z.infer<
  typeof CalculationSourceDetachedItemSchema
>;
export type CalculationSourceSymbol = z.infer<
  typeof CalculationSourceSymbolSchema
>;
export type CalculationSourceValueTree = z.infer<
  typeof CalculationSourceValueTreeSchema
>;
export type CalculationSourceValueNode = z.infer<
  typeof CalculationSourceValueNodeSchema
>;
export type CalculationSourceLiteral = z.infer<
  typeof CalculationSourceLiteralSchema
>;
export type CalculationSourceFunctionSpec = z.infer<
  typeof CalculationSourceFunctionSpecSchema
>;
export type CalculationSourceFunctionArg = z.infer<
  typeof CalculationSourceFunctionArgSchema
>;
