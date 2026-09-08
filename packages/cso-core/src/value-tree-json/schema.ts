import { z } from 'zod';
import { supportedValueFunctionIds } from '../sheet-model/functions.ts';

export const ValueTreeJsonLiteralSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  z.null(),
]);

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export const ValueTreeJsonNodeSchema = z
  .object({
    key: z.string().min(1),
    literal: ValueTreeJsonLiteralSchema.optional(),
    symbol: z.string().min(1).optional(),
    function: z.string().min(1).optional(),
    arguments: z.array(z.string().min(1)).optional(),
    result: ValueTreeJsonLiteralSchema.optional(),
    tags: z.array(z.unknown()).optional(),
  })
  .strict()
  .superRefine((node, ctx) => {
    const kinds = ['literal', 'symbol', 'function'].filter((kind) =>
      hasOwn(node, kind),
    );

    if (kinds.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: `Expected exactly one node kind, received ${kinds.length}`,
        path: ['key'],
      });
    }

    if (hasOwn(node, 'function') && !Array.isArray(node.arguments)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Function nodes must include an arguments array',
        path: ['arguments'],
      });
    }

    if (!hasOwn(node, 'function') && hasOwn(node, 'arguments')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Only function nodes may include arguments',
        path: ['arguments'],
      });
    }
  });

export const ValueTreeJsonSymbolSchema = z
  .object({
    id: z.string().min(1).optional(),
    glyph: z.string().optional(),
    glyphPlaintext: z.string().optional(),
    unit: z.string().optional(),
    description: z.string().optional(),
    comment: z.string().optional(),
    result: ValueTreeJsonLiteralSchema.optional(),
    varname: z.string().min(1).optional(),
    valueTree: z.array(ValueTreeJsonNodeSchema).min(1),
  })
  .strict();

export const ValueTreeJsonSectionSchema = z
  .object({
    id: z.string().min(1).optional(),
    title: z.string().optional(),
    symbols: z.array(ValueTreeJsonSymbolSchema).min(1),
  })
  .strict();

type ValueTreeJsonSectionForRefinement = z.infer<
  typeof ValueTreeJsonSectionSchema
>;

type ValueTreeJsonSymbolForRefinement = z.infer<
  typeof ValueTreeJsonSymbolSchema
>;

const collectSymbolReferences = (
  sections: readonly ValueTreeJsonSectionForRefinement[],
): Set<string> => {
  const symbolReferences = new Set<string>();

  for (const section of sections) {
    for (const symbol of section.symbols) {
      if (symbol.id) {
        symbolReferences.add(symbol.id);
      }
      if (symbol.varname) {
        symbolReferences.add(symbol.varname);
      }
    }
  }

  return symbolReferences;
};

const collectDuplicateNodeKeys = (
  symbol: ValueTreeJsonSymbolForRefinement,
): Set<string> => {
  const nodeKeys = new Set<string>();
  const duplicateNodeKeys = new Set<string>();

  for (const node of symbol.valueTree) {
    if (nodeKeys.has(node.key)) {
      duplicateNodeKeys.add(node.key);
    }
    nodeKeys.add(node.key);
  }

  return duplicateNodeKeys;
};

const collectNodeKeys = (
  symbol: ValueTreeJsonSymbolForRefinement,
): Set<string> => new Set(symbol.valueTree.map((node) => node.key));

const valueTreeNodePath = (
  sectionIndex: number,
  symbolIndex: number,
  nodeIndex: number,
): (string | number)[] => [
  'sections',
  sectionIndex,
  'symbols',
  symbolIndex,
  'valueTree',
  nodeIndex,
];

const addNodeReferenceIssues = ({
  ctx,
  duplicateNodeKeys,
  node,
  nodeKeys,
  nodePath,
  symbolReferences,
}: {
  readonly ctx: z.RefinementCtx;
  readonly duplicateNodeKeys: ReadonlySet<string>;
  readonly node: z.infer<typeof ValueTreeJsonNodeSchema>;
  readonly nodeKeys: ReadonlySet<string>;
  readonly nodePath: readonly (string | number)[];
  readonly symbolReferences: ReadonlySet<string>;
}): void => {
  if (duplicateNodeKeys.has(node.key)) {
    ctx.addIssue({
      code: 'custom',
      message: `Duplicate value-tree node key '${node.key}'`,
      path: [...nodePath, 'key'],
    });
  }

  if (node.function && !supportedValueFunctionIds.has(node.function)) {
    ctx.addIssue({
      code: 'custom',
      message: `Unsupported value function '${node.function}'`,
      path: [...nodePath, 'function'],
    });
  }

  for (const [argIndex, argKey] of (node.arguments ?? []).entries()) {
    if (!nodeKeys.has(argKey)) {
      ctx.addIssue({
        code: 'custom',
        message: `Function argument '${argKey}' does not resolve inside this value tree`,
        path: [...nodePath, 'arguments', argIndex],
      });
    }
  }

  if (node.symbol && !symbolReferences.has(node.symbol)) {
    ctx.addIssue({
      code: 'custom',
      message: `Symbol reference '${node.symbol}' does not resolve in this document`,
      path: [...nodePath, 'symbol'],
    });
  }
};

const addSymbolReferenceIssues = ({
  ctx,
  sectionIndex,
  symbol,
  symbolIndex,
  symbolReferences,
}: {
  readonly ctx: z.RefinementCtx;
  readonly sectionIndex: number;
  readonly symbol: ValueTreeJsonSymbolForRefinement;
  readonly symbolIndex: number;
  readonly symbolReferences: ReadonlySet<string>;
}): void => {
  const nodeKeys = collectNodeKeys(symbol);
  const duplicateNodeKeys = collectDuplicateNodeKeys(symbol);

  for (const [nodeIndex, node] of symbol.valueTree.entries()) {
    addNodeReferenceIssues({
      ctx,
      duplicateNodeKeys,
      node,
      nodeKeys,
      nodePath: valueTreeNodePath(sectionIndex, symbolIndex, nodeIndex),
      symbolReferences,
    });
  }
};

const addValueTreeReferenceIssues = (
  sections: readonly ValueTreeJsonSectionForRefinement[],
  ctx: z.RefinementCtx,
): void => {
  const symbolReferences = collectSymbolReferences(sections);

  for (const [sectionIndex, section] of sections.entries()) {
    for (const [symbolIndex, symbol] of section.symbols.entries()) {
      addSymbolReferenceIssues({
        ctx,
        sectionIndex,
        symbol,
        symbolIndex,
        symbolReferences,
      });
    }
  }
};

export const ValueTreeJsonDocumentSchema = z
  .object({
    title: z.string().optional(),
    sections: z.array(ValueTreeJsonSectionSchema).min(1),
  })
  .strict()
  .superRefine((document, ctx) => {
    addValueTreeReferenceIssues(document.sections, ctx);
  });
