import { z } from 'zod';
import { CalculationSourceSymbolSchema } from '../calculation-source/object-schema.ts';
import {
  AssetRecordSchema,
  ExecutionBindingSchema,
  HashSchema,
  NonemptyStringSchema,
  SourceSpanSchema,
  executionBindingKey,
  sha256Bytes,
} from './common.ts';
import { ExecutionPayloadSchema } from './execution.ts';
import { glyphIdentity } from './glyphs.ts';

type HistoricalJsonValue = z.infer<ReturnType<typeof z.json>>;

const HistoricalJsonValueSchema: z.ZodType<HistoricalJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(HistoricalJsonValueSchema),
    HistoricalJsonObjectSchema,
  ]),
);

const HistoricalJsonObjectSchema = z
  .unknown()
  .transform((value, ctx) => {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Historical fields must be a JSON object',
        params: { diagnosticCode: 'INVALID_HISTORICAL_FIELDS' },
      });
      return z.NEVER;
    }
    return Object.entries(value);
  })
  .pipe(z.array(z.tuple([z.string(), HistoricalJsonValueSchema])))
  .transform(
    (entries): Record<string, HistoricalJsonValue> =>
      Object.fromEntries(entries),
  );

export const HistoricalReviewSchema = z.strictObject({
  scope: z.literal('historical'),
  originalSource: z.strictObject({
    id: NonemptyStringSchema,
    sha256: HashSchema,
    format: NonemptyStringSchema,
  }),
  attribution: NonemptyStringSchema,
  originalFields: HistoricalJsonObjectSchema,
});

export const LegacyAssetManifestSchema = z
  .strictObject({
    manifestVersion: z.literal('1'),
    entries: z.array(
      z.strictObject({
        originalFixtureSha256: HashSchema,
        figureId: NonemptyStringSchema,
        originalUrl: z.url(),
        localPath: NonemptyStringSchema,
        contentSha256: HashSchema,
        additions: z
          .strictObject({
            caption: z.string().optional(),
            alt: z.string().optional(),
          })
          .optional(),
      }),
    ),
  })
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    for (const [index, entry] of manifest.entries.entries()) {
      const key = JSON.stringify([entry.originalFixtureSha256, entry.figureId]);
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          params: { diagnosticCode: 'DUPLICATE_LEGACY_FIGURE' },
          message: 'A legacy fixture figure must have one asset mapping',
          path: ['entries', index, 'figureId'],
        });
      }
      seen.add(key);
    }
  });

const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const ResolvedAssetSchema = z
  .strictObject({ asset: AssetRecordSchema, dataUrl: NonemptyStringSchema })
  .superRefine((resolved, ctx) => {
    const prefix = `data:${resolved.asset.mediaType};base64,`;
    const encoded = resolved.dataUrl.slice(prefix.length);
    const validDataUrl =
      resolved.dataUrl.startsWith(prefix) &&
      encoded.length > 0 &&
      base64Pattern.test(encoded);
    if (!validDataUrl) {
      ctx.addIssue({
        code: 'custom',
        params: { diagnosticCode: 'INVALID_ASSET_DATA_URL' },
        message:
          'Resolved assets require base64 bytes with the declared media type',
        path: ['dataUrl'],
      });
      return;
    }
    const bytes = Uint8Array.from(atob(encoded), (character) =>
      character.charCodeAt(0),
    );
    if (sha256Bytes(bytes) !== resolved.asset.sha256) {
      ctx.addIssue({
        code: 'custom',
        params: { diagnosticCode: 'ASSET_HASH_MISMATCH' },
        message: 'Resolved asset bytes do not match their source asset hash',
        path: ['dataUrl'],
      });
    }
  });

// Prepared context is selected by the document preparer. Leaves point to retained
// current-source data, never to the position of a historical review.
const ContextPathSchema = z
  .string()
  .regex(
    /^\/(?:sourceMetadata(?:\/|$)|sections\/\d+\/(?:metadata|items\/\d+\/(?:contextSource|symbol\/metadata))(?:\/|$)|detachedSymbols\/\d+\/(?:metadata|description|unit|comment)(?:\/|$))/,
  );
export type PreparedContextValue =
  | { kind: 'text'; path: string; value: string | number | boolean }
  | { kind: 'math'; path: string; value: string }
  | { kind: 'list'; items: PreparedContextValue[] }
  | {
      kind: 'record';
      entries: { label: string; value: PreparedContextValue }[];
    };
export const PreparedContextValueSchema: z.ZodType<PreparedContextValue> =
  z.lazy(() =>
    z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('text'),
        path: ContextPathSchema,
        value: z.union([z.string(), z.number().finite(), z.boolean()]),
      }),
      z.strictObject({
        kind: z.literal('math'),
        path: ContextPathSchema,
        value: z.string(),
      }),
      z.strictObject({
        kind: z.literal('list'),
        items: z.array(PreparedContextValueSchema).min(1),
      }),
      z.strictObject({
        kind: z.literal('record'),
        entries: z
          .array(
            z.strictObject({
              label: z.string(),
              value: PreparedContextValueSchema,
            }),
          )
          .min(1),
      }),
    ]),
  );
export const PreparedContextFieldSchema = z.strictObject({
  label: NonemptyStringSchema,
  path: ContextPathSchema,
  value: PreparedContextValueSchema,
});
const ContextSchema = z.array(PreparedContextFieldSchema);
const OperandContextSchema = z.array(
  z.strictObject({
    symbolId: NonemptyStringSchema,
    context: ContextSchema,
  }),
);

const placementFields = {
  context: ContextSchema,
  sourcePlacementId: NonemptyStringSchema,
  localId: NonemptyStringSchema.optional(),
  invocationId: NonemptyStringSchema.optional(),
  location: SourceSpanSchema.optional(),
};

const executionPlacementFields: ('localId' | 'invocationId' | 'location')[] = [
  'localId',
  'invocationId',
  'location',
];

export const PreparedDocumentItemSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('section'),
    id: NonemptyStringSchema,
    contextSource: HistoricalJsonObjectSchema.optional(),
    ...placementFields,
  }),
  z.strictObject({
    kind: z.literal('symbol'),
    operands: OperandContextSchema,
    symbol: CalculationSourceSymbolSchema,
    contextSource: HistoricalJsonObjectSchema.optional(),
    ...placementFields,
  }),
  z.strictObject({
    kind: z.literal('symbolRef'),
    operands: OperandContextSchema,
    id: NonemptyStringSchema,
    contextSource: HistoricalJsonObjectSchema.optional(),
    ...placementFields,
  }),
  z.strictObject({
    kind: z.literal('text'),
    id: NonemptyStringSchema,
    text: z.strictObject({ content: z.string() }),
    contextSource: HistoricalJsonObjectSchema.optional(),
    ...placementFields,
  }),
  z.strictObject({
    kind: z.literal('figure'),
    id: NonemptyStringSchema,
    figure: z.strictObject({
      assetId: NonemptyStringSchema,
      caption: z.string(),
      alt: z.string(),
      width: z.number().finite().positive().optional(),
    }),
    contextSource: HistoricalJsonObjectSchema.optional(),
    ...placementFields,
  }),
]);

export const PreparedDocumentSectionSchema = z.strictObject({
  id: NonemptyStringSchema,
  title: z.string(),
  metadata: HistoricalJsonObjectSchema.optional(),
  items: z.array(PreparedDocumentItemSchema),
  ...placementFields,
});

export const PreparedDocumentSchema = z
  .strictObject({
    documentVersion: z.literal('2'),
    context: ContextSchema,
    source: z.discriminatedUnion('kind', [
      z.strictObject({
        ...ExecutionBindingSchema.shape,
        kind: z.literal('execution'),
      }),
      z.strictObject({
        kind: z.literal('legacy'),
        fixtureId: NonemptyStringSchema,
        fixtureSha256: HashSchema,
      }),
    ]),
    title: z.string(),
    sourceMetadata: HistoricalJsonObjectSchema.optional(),
    rootSectionIds: z.array(NonemptyStringSchema).min(1),
    sections: z.array(PreparedDocumentSectionSchema).min(1),
    detachedSymbols: z.array(CalculationSourceSymbolSchema),
    assets: z.array(ResolvedAssetSchema),
    historicalReviews: z.array(HistoricalReviewSchema),
  })
  .superRefine((document, ctx) => {
    validatePlacements(document, ctx);
    validateContentIds(document, ctx);
    validateAssets(document, ctx);
    validateSectionTree(document, ctx);
    validateSymbols(document, ctx);
    validateContext(document, ctx);
  });

export const BoundPreparedDocumentSchema = z
  .strictObject({
    execution: ExecutionPayloadSchema,
    document: PreparedDocumentSchema,
  })
  .superRefine(({ execution, document }, ctx) => {
    if (document.source.kind !== 'execution') {
      addIssue(
        ctx,
        'DOCUMENT_EXECUTION_BINDING_MISMATCH',
        'A legacy document cannot bind to a current execution',
        ['document', 'source'],
      );
      return;
    }
    const expected = ExecutionBindingSchema.safeParse({
      entryModuleId: execution.entry.moduleId,
      entrySourceHash: execution.entry.sourceHash,
      sourceClosureHash: execution.sourceClosureHash,
      function: execution.entry.function,
      resolvedInputs: execution.entry.resolvedInputs,
    });
    const { kind: _, ...binding } = document.source;
    const actual = ExecutionBindingSchema.safeParse(binding);
    if (!(expected.success && actual.success)) {
      return;
    }
    if (
      executionBindingKey(expected.data) !== executionBindingKey(actual.data)
    ) {
      addIssue(
        ctx,
        'DOCUMENT_EXECUTION_BINDING_MISMATCH',
        'Prepared content must bind to the supplied entry, source closure, function, and resolved inputs',
        ['document', 'source'],
      );
    }
  });

const addIssue = (
  ctx: z.RefinementCtx,
  code: string,
  message: string,
  path: (string | number)[],
  params: Readonly<Record<string, unknown>> = {},
) => {
  ctx.addIssue({
    code: 'custom',
    params: { diagnosticCode: code, ...params },
    message,
    path,
  });
};

const validatePlacements = (
  document: PreparedDocument,
  ctx: z.RefinementCtx,
) => {
  const seen = new Set<string>();
  const placements = document.sections.flatMap((section, sectionIndex) => [
    { placement: section, path: ['sections', sectionIndex] },
    ...section.items.map((item, itemIndex) => ({
      placement: item,
      path: ['sections', sectionIndex, 'items', itemIndex],
    })),
  ]);
  for (const { placement, path } of placements) {
    if (seen.has(placement.sourcePlacementId)) {
      addIssue(
        ctx,
        'DUPLICATE_SOURCE_PLACEMENT',
        'Source placement IDs must identify one displayed placement',
        [...path, 'sourcePlacementId'],
      );
    }
    seen.add(placement.sourcePlacementId);
    if (document.source.kind === 'execution') {
      for (const field of executionPlacementFields) {
        if (placement[field] === undefined) {
          addIssue(
            ctx,
            'MISSING_PLACEMENT_PROVENANCE',
            `Execution placements require ${field}`,
            [...path, field],
          );
        }
      }
      validatePlacementIdentity(placement, ctx, path);
    }
  }
};

const validatePlacementIdentity = (
  placement: PreparedDocumentSection | PreparedDocumentItem,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) => {
  if (placement.localId === undefined || placement.invocationId === undefined) {
    return;
  }
  const kind = 'kind' in placement ? placement.kind : 'section';
  const identityKind = kind === 'symbolRef' ? 'symbol' : kind;
  const id = 'symbol' in placement ? placement.symbol.id : placement.id;
  const expected = JSON.stringify([
    identityKind,
    placement.invocationId,
    placement.localId,
  ]);
  if (id !== expected) {
    addIssue(
      ctx,
      'DOCUMENT_IDENTITY_MISMATCH',
      'Namespaced identity must match its kind, invocationId, and localId',
      [...path, ...('symbol' in placement ? ['symbol', 'id'] : ['id'])],
    );
  }
};

const validateContentIds = (
  document: PreparedDocument,
  ctx: z.RefinementCtx,
) => {
  const placements = document.sections.flatMap((section, sectionIndex) =>
    section.items.map((placement, itemIndex) => ({
      placement,
      path: ['sections', sectionIndex, 'items', itemIndex],
    })),
  );
  const contentIds = new Set<string>();
  for (const { placement, path } of placements) {
    if (placement.kind !== 'text' && placement.kind !== 'figure') {
      continue;
    }
    const identity = JSON.stringify([placement.kind, placement.id]);
    if (contentIds.has(identity)) {
      addIssue(
        ctx,
        'DUPLICATE_DOCUMENT_CONTENT',
        'Authored text and figure IDs must be unique within their kind',
        [...path, 'id'],
      );
    }
    contentIds.add(identity);
  }
};

const validateAssets = (document: PreparedDocument, ctx: z.RefinementCtx) => {
  const assetIds = new Set<string>();
  for (const [index, resolved] of document.assets.entries()) {
    if (assetIds.has(resolved.asset.id)) {
      addIssue(ctx, 'DUPLICATE_DOCUMENT_ASSET', 'Asset IDs must be unique', [
        'assets',
        index,
        'asset',
        'id',
      ]);
    }
    assetIds.add(resolved.asset.id);
  }
  for (const [sectionIndex, section] of document.sections.entries()) {
    for (const [itemIndex, item] of section.items.entries()) {
      if (item.kind === 'figure' && !assetIds.has(item.figure.assetId)) {
        addIssue(
          ctx,
          'UNRESOLVED_DOCUMENT_ASSET',
          'Figure asset must resolve to captured bytes',
          ['sections', sectionIndex, 'items', itemIndex, 'figure', 'assetId'],
        );
      }
    }
  }
};

const validateSectionTree = (
  document: PreparedDocument,
  ctx: z.RefinementCtx,
) => {
  const sections = new Map<
    string,
    { section: PreparedDocumentSection; index: number }
  >();
  for (const [index, section] of document.sections.entries()) {
    if (sections.has(section.id)) {
      addIssue(
        ctx,
        'DUPLICATE_DOCUMENT_SECTION',
        'Section IDs must be unique',
        ['sections', index, 'id'],
      );
    }
    sections.set(section.id, { section, index });
  }
  const placed = new Set<string>();
  const visit = (
    id: string,
    path: (string | number)[],
    ancestors: ReadonlySet<string>,
  ) => {
    if (ancestors.has(id)) {
      addIssue(
        ctx,
        'DOCUMENT_SECTION_CYCLE',
        'Section placement must not contain a cycle',
        path,
      );
      return;
    }
    if (placed.has(id)) {
      addIssue(
        ctx,
        'DUPLICATE_SECTION_PLACEMENT',
        'A section must have one parent placement',
        path,
      );
      return;
    }
    const target = sections.get(id);
    if (!target) {
      addIssue(
        ctx,
        'UNRESOLVED_DOCUMENT_SECTION',
        'Section placement must resolve',
        path,
      );
      return;
    }
    placed.add(id);
    const nextAncestors = new Set([...ancestors, id]);
    for (const [itemIndex, item] of target.section.items.entries()) {
      if (item.kind === 'section') {
        visit(
          item.id,
          ['sections', target.index, 'items', itemIndex, 'id'],
          nextAncestors,
        );
      }
    }
  };
  for (const [index, id] of document.rootSectionIds.entries()) {
    visit(id, ['rootSectionIds', index], new Set());
  }
  for (const [index, section] of document.sections.entries()) {
    if (!placed.has(section.id)) {
      addIssue(
        ctx,
        'UNPLACED_DOCUMENT_SECTION',
        'Prepared sections must be reachable from a root',
        ['sections', index, 'id'],
      );
    }
  }
};

const validateSymbols = (document: PreparedDocument, ctx: z.RefinementCtx) => {
  const definitions = [
    ...document.detachedSymbols.map((symbol, index) => ({
      symbol,
      path: ['detachedSymbols', index],
    })),
    ...document.sections.flatMap((section, sectionIndex) =>
      section.items.flatMap((item, itemIndex) =>
        item.kind === 'symbol'
          ? [
              {
                symbol: item.symbol,
                path: ['sections', sectionIndex, 'items', itemIndex, 'symbol'],
              },
            ]
          : [],
      ),
    ),
  ];
  const symbolIds = new Set<string>();
  const glyphs = new Map<string, string>();
  for (const { symbol, path } of definitions) {
    if (document.source.kind === 'execution') {
      validateSymbolIdentity(symbol, ctx, path);
    }
    if (symbolIds.has(symbol.id)) {
      addIssue(
        ctx,
        'DUPLICATE_DOCUMENT_SYMBOL',
        'A symbol has one definition; repeated placements use symbolRef',
        [...path, 'id'],
      );
    }
    symbolIds.add(symbol.id);
    const glyph = glyphIdentity(symbol.glyph);
    const previous = glyphs.get(glyph);
    if (previous !== undefined && previous !== symbol.id) {
      addIssue(
        ctx,
        'DUPLICATE_GLYPH',
        `Distinct quantities ${previous} and ${symbol.id} share glyph ${symbol.glyph}`,
        [...path, 'glyph'],
        { symbolId: symbol.id },
      );
    }
    glyphs.set(glyph, symbol.id);
  }
  const references = [
    ...document.sections.flatMap((section, sectionIndex) =>
      section.items.flatMap((item, itemIndex) =>
        item.kind === 'symbolRef'
          ? [
              {
                id: item.id,
                path: ['sections', sectionIndex, 'items', itemIndex, 'id'],
              },
            ]
          : [],
      ),
    ),
    ...definitions.flatMap(({ symbol, path }) =>
      symbol.valueTree.nodes.flatMap((node, nodeIndex) =>
        node.mode === 'SYMBOL' && node.symbol
          ? [
              {
                id: node.symbol.id,
                path: [
                  ...path,
                  'valueTree',
                  'nodes',
                  nodeIndex,
                  'symbol',
                  'id',
                ],
              },
            ]
          : [],
      ),
    ),
  ];
  for (const { id, path } of references) {
    if (!symbolIds.has(id)) {
      addIssue(
        ctx,
        'UNRESOLVED_DOCUMENT_SYMBOL',
        'Symbol reference must resolve',
        path,
      );
    }
  }
};

const invalidPointerEscape = /~(?:[^01]|$)/;
const pointerArrayIndex = /^(0|[1-9]\d*)$/;
const pointerChild = (value: unknown, key: string): unknown => {
  if (Array.isArray(value)) {
    return pointerArrayIndex.test(key) ? value[Number(key)] : undefined;
  }
  return value !== null && typeof value === 'object'
    ? Object.entries(value).find(([name]) => name === key)?.[1]
    : undefined;
};
const validateContext = (document: PreparedDocument, ctx: z.RefinementCtx) => {
  const resolve = (pointer: string): unknown => {
    let value: unknown = document;
    for (const encoded of pointer.slice(1).split('/')) {
      if (invalidPointerEscape.test(encoded)) {
        return undefined;
      }
      const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
      value = pointerChild(value, key);
    }
    return value;
  };
  const checkValue = (
    value: PreparedContextValue,
    path: (string | number)[],
    sourceRoot: string,
  ) => {
    switch (value.kind) {
      case 'text':
      case 'math':
        if (
          (value.path !== sourceRoot &&
            !value.path.startsWith(`${sourceRoot}/`)) ||
          !Object.is(resolve(value.path), value.value)
        ) {
          addIssue(
            ctx,
            'DOCUMENT_CONTEXT_SOURCE_MISMATCH',
            'Displayed context must match its retained source value',
            [...path, 'path'],
          );
        }
        break;
      case 'list':
        value.items.forEach((item, index) =>
          checkValue(item, [...path, 'items', index], sourceRoot),
        );
        break;
      case 'record':
        value.entries.forEach((entry, index) =>
          checkValue(
            entry.value,
            [...path, 'entries', index, 'value'],
            sourceRoot,
          ),
        );
        break;
      default: {
        const exhaustive: never = value;
        return exhaustive;
      }
    }
  };
  const check = (fields: PreparedContextField[], path: (string | number)[]) => {
    fields.forEach((field, index) => {
      if (resolve(field.path) === undefined) {
        addIssue(
          ctx,
          'DOCUMENT_CONTEXT_SOURCE_MISMATCH',
          'Context fields must identify retained current-source data',
          [...path, index, 'path'],
        );
      }
      checkValue(field.value, [...path, index, 'value'], field.path);
    });
  };
  check(document.context, ['context']);
  const detachedIds = new Set(
    document.detachedSymbols.map((symbol) => symbol.id),
  );
  document.sections.forEach((section, sectionIndex) => {
    const path = ['sections', sectionIndex];
    check(section.context, [...path, 'context']);
    section.items.forEach((item, itemIndex) => {
      const itemPath = [...path, 'items', itemIndex];
      check(item.context, [...itemPath, 'context']);
      if (item.kind !== 'symbol' && item.kind !== 'symbolRef') {
        return;
      }
      const seen = new Set<string>();
      item.operands.forEach((operand, index) => {
        if (!detachedIds.has(operand.symbolId) || seen.has(operand.symbolId)) {
          addIssue(
            ctx,
            'INVALID_DOCUMENT_OPERAND_CONTEXT',
            'Operand context must name distinct detached symbol definitions',
            [...itemPath, 'operands', index, 'symbolId'],
          );
        }
        seen.add(operand.symbolId);
        check(operand.context, [...itemPath, 'operands', index, 'context']);
      });
    });
  });
};

const invalidIdentityUnicodePattern = /[\uD800-\uDFFF]/u;
const SymbolIdentityPartSchema = NonemptyStringSchema.refine(
  (value) => !invalidIdentityUnicodePattern.test(value),
);
const SymbolIdentitySchema = z.tuple([
  z.literal('symbol'),
  SymbolIdentityPartSchema,
  SymbolIdentityPartSchema,
]);

const validateSymbolIdentity = (
  symbol: z.infer<typeof CalculationSourceSymbolSchema>,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(symbol.id);
  } catch {
    addIssue(
      ctx,
      'DOCUMENT_IDENTITY_MISMATCH',
      'Execution symbol identity must use compact namespaced JSON',
      [...path, 'id'],
    );
    return;
  }
  const parsed = SymbolIdentitySchema.safeParse(decoded);
  if (!parsed.success || JSON.stringify(parsed.data) !== symbol.id) {
    addIssue(
      ctx,
      'DOCUMENT_IDENTITY_MISMATCH',
      'Execution symbol identity requires canonical kind, invocationId, and localId',
      [...path, 'id'],
    );
    return;
  }
  const [, invocationId, localId] = parsed.data;
  for (const [field, expected] of Object.entries({ invocationId, localId })) {
    if (
      symbol.metadata?.[field] !== undefined &&
      symbol.metadata[field] !== expected
    ) {
      addIssue(
        ctx,
        'DOCUMENT_IDENTITY_MISMATCH',
        'Symbol metadata must agree with its namespaced identity',
        [...path, 'metadata', field],
      );
    }
  }
};

export type HistoricalReview = z.infer<typeof HistoricalReviewSchema>;
export type LegacyAssetManifest = z.infer<typeof LegacyAssetManifestSchema>;
export type ResolvedAsset = z.infer<typeof ResolvedAssetSchema>;
export type PreparedDocumentItem = z.infer<typeof PreparedDocumentItemSchema>;
export type PreparedDocumentSection = z.infer<
  typeof PreparedDocumentSectionSchema
>;
export type PreparedDocument = z.infer<typeof PreparedDocumentSchema>;
export type BoundPreparedDocument = z.infer<typeof BoundPreparedDocumentSchema>;

export type PreparedContextField = z.infer<typeof PreparedContextFieldSchema>;
