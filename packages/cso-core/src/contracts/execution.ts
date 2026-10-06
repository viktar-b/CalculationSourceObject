import { z } from 'zod';
import { CalculationSourceObjectSchema } from '../calculation-source/object-schema.ts';
import { AuthoringEvidenceSchema } from './authoring.ts';
import {
  AssetRecordSchema,
  collectCsoSymbols,
  DiagnosticSchema,
  type ExecutionBinding,
  HashSchema,
  ModuleIdSchema,
  NodeAddressSchema,
  NonemptyStringSchema,
  namespacedId,
  ProvenanceSchema,
  PythonIdentifierSchema,
  ResolvedInputEvidenceSchema,
  resolvedInputKind,
  SourceManifestSchema,
  SourceSpanSchema,
  sourceClosureHash,
  VersionsSchema,
} from './common.ts';
import { scopedGlyph } from './glyphs.ts';
import {
  branchLabel,
  reproduceBranches,
  reproducePredicate,
} from '../verification/branches.ts';
import { NumericValueSchema } from './numbers.ts';

const invalidUnicodePattern = /[\uD800-\uDFFF]/u;
const IdentityStringSchema = NonemptyStringSchema.refine(
  (value) => !invalidUnicodePattern.test(value),
  {
    message: 'Identity must contain Unicode scalar values',
    params: { diagnosticCode: 'INVALID_UNICODE' },
  },
);
const ParameterNameSchema = PythonIdentifierSchema;
const LiteralSourceSchema = NumericValueSchema.safeExtend({
  location: SourceSpanSchema,
});

export const GivenSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('parameter'),
      parameterName: ParameterNameSchema,
    })
    .strict(),
  LiteralSourceSchema.safeExtend({ kind: z.literal('literal') }),
]);

const definitionIdentity = {
  symbolId: IdentityStringSchema,
  localId: IdentityStringSchema,
  variableName: ParameterNameSchema,
  definitionLocation: SourceSpanSchema,
};
export const SymbolDefinitionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...definitionIdentity,
      kind: z.literal('input'),
      givenSource: GivenSourceSchema,
    })
    .strict(),
  z
    .object({
      ...definitionIdentity,
      kind: z.literal('constant'),
      literal: LiteralSourceSchema,
    })
    .strict(),
  z
    .object({
      ...definitionIdentity,
      kind: z.literal('formula'),
      address: NodeAddressSchema,
    })
    .strict(),
  z
    .object({
      ...definitionIdentity,
      kind: z.literal('unsupported'),
      reason: NonemptyStringSchema,
    })
    .strict(),
]);

const bindingIdentity = {
  parameterName: ParameterNameSchema,
  parameterLocation: SourceSpanSchema,
};
const EntrySuppliedBindingSchema = NumericValueSchema.safeExtend({
  ...bindingIdentity,
  kind: z.literal('entrySupplied'),
});
const ParsedDefaultBindingSchema = NumericValueSchema.safeExtend({
  ...bindingIdentity,
  kind: z.literal('parsedDefault'),
  defaultLocation: SourceSpanSchema,
});
const CallerLiteralBindingSchema = NumericValueSchema.safeExtend({
  ...bindingIdentity,
  kind: z.literal('callerLiteral'),
  callerLocation: SourceSpanSchema,
});
const CallerSymbolBindingSchema = z
  .object({
    ...bindingIdentity,
    kind: z.literal('callerSymbol'),
    source: NodeAddressSchema,
    callerLocation: SourceSpanSchema,
  })
  .strict();
export const InputBindingSchema = z.discriminatedUnion('kind', [
  EntrySuppliedBindingSchema,
  ParsedDefaultBindingSchema,
  CallerLiteralBindingSchema,
  CallerSymbolBindingSchema,
]);
const invocationFields = {
  moduleId: ModuleIdSchema,
  function: PythonIdentifierSchema,
  symbols: z.array(SymbolDefinitionSchema),
};
const RootInvocationSchema = ResolvedInputEvidenceSchema.safeExtend({
  ...invocationFields,
  id: z.literal('root'),
  inputBindings: z.array(
    z.discriminatedUnion('kind', [
      EntrySuppliedBindingSchema,
      ParsedDefaultBindingSchema,
    ]),
  ),
}).strict();
const ChildInvocationSchema = ResolvedInputEvidenceSchema.safeExtend({
  ...invocationFields,
  id: IdentityStringSchema.refine((id) => id !== 'root', {
    message: 'A child invocation cannot be root',
  }),
  parentInvocationId: IdentityStringSchema,
  callBindingName: PythonIdentifierSchema,
  callSite: SourceSpanSchema,
  inputBindings: z.array(
    z.discriminatedUnion('kind', [
      ParsedDefaultBindingSchema,
      CallerLiteralBindingSchema,
      CallerSymbolBindingSchema,
    ]),
  ),
}).strict();
export const InvocationSchema = z.union([
  RootInvocationSchema,
  ChildInvocationSchema,
]);
export const SymbolObservationSchema = NumericValueSchema.safeExtend({
  symbolId: IdentityStringSchema,
  invocationId: IdentityStringSchema,
  kind: z.enum(['input', 'constant', 'formula', 'unsupported']),
  definitionLocation: SourceSpanSchema,
});
export const OperationObservationSchema = NumericValueSchema.safeExtend({
  address: NodeAddressSchema,
  invocationId: IdentityStringSchema,
  location: SourceSpanSchema,
});

const SymbolicFormulaNodeSchema = z.strictObject({
  key: NonemptyStringSchema,
  location: SourceSpanSchema,
  mode: z.enum(['LITERAL', 'SYMBOL', 'FUNCTION', 'GIVEN_PARAMETER']),
  draft: z.string().optional(),
  literal: z
    .strictObject({
      kind: z.literal('number'),
      numericKind: z.enum(['int', 'float']),
      value: z.number().finite(),
    })
    .optional(),
  ref: z
    .strictObject({
      kind: z.enum(['name', 'output']),
      name: z.string().optional(),
      call: z.string().optional(),
      output: z.string().optional(),
    })
    .optional(),
  parameterName: z.string().optional(),
  parameter: z.string().optional(),
  funcSpec: z.strictObject({ id: NonemptyStringSchema }).optional(),
  funcArgs: z.array(z.strictObject({ key: NonemptyStringSchema })).optional(),
});
const MethodQuantitySchema = z.strictObject({
  variableName: PythonIdentifierSchema,
  localId: NonemptyStringSchema,
  kind: z.enum(['input', 'constant', 'formula', 'unsupported']),
  role: z.enum(['input', 'intermediate', 'output']),
  selectionName: NonemptyStringSchema,
  glyph: NonemptyStringSchema,
  description: NonemptyStringSchema,
  unit: z.string(),
  formulaText: z.string(),
  nodes: z.array(SymbolicFormulaNodeSchema),
});
type MethodQuantity = z.infer<typeof MethodQuantitySchema>;
export type MethodContentItem =
  | { kind: 'quantity'; variableName: string }
  | { kind: 'text'; localId: string; content: string }
  | {
      kind: 'figure';
      localId: string;
      assetId: string;
      caption: string;
      alt: string;
    }
  | {
      kind: 'call';
      binding: string;
      helperId: string;
      inputs: { name: string; formulaText: string }[];
      outputs: string[];
    }
  | {
      kind: 'section';
      localId: string;
      title: string;
      content: MethodContentItem[];
    }
  | { kind: 'check'; localId: string }
  | { kind: 'applicability'; localId: string };
export type EngineeringCheck = {
  id: string;
  targets: string[];
  explanation: string;
  predicateText: string;
  nodes: z.infer<typeof SymbolicFormulaNodeSchema>[];
};
export type MethodHelperRecord = {
  id: string;
  moduleId: string;
  function: string;
  sourceHash: string;
  revision: string;
  parameterNames: string[];
  outputNames: string[];
  quantities: MethodQuantity[];
  content: MethodContentItem[];
  helpers: MethodHelperRecord[];
  checks?: EngineeringCheck[];
  applicability?: EngineeringCheck[];
};
const MethodContentSchema: z.ZodType<MethodContentItem> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('quantity'),
      variableName: PythonIdentifierSchema,
    }),
    z.strictObject({
      kind: z.literal('text'),
      localId: NonemptyStringSchema,
      content: z.string(),
    }),
    z.strictObject({
      kind: z.literal('figure'),
      localId: NonemptyStringSchema,
      assetId: IdentityStringSchema,
      caption: NonemptyStringSchema,
      alt: NonemptyStringSchema,
    }),
    z.strictObject({
      kind: z.literal('call'),
      binding: PythonIdentifierSchema,
      helperId: IdentityStringSchema,
      inputs: z.array(
        z.strictObject({
          name: PythonIdentifierSchema,
          formulaText: z.string(),
        }),
      ),
      outputs: z.array(NonemptyStringSchema).min(1),
    }),
    z.strictObject({
      kind: z.literal('section'),
      localId: NonemptyStringSchema,
      title: NonemptyStringSchema,
      content: z.array(MethodContentSchema),
    }),
    z.strictObject({
      kind: z.literal('check'),
      localId: NonemptyStringSchema,
    }),
    z.strictObject({
      kind: z.literal('applicability'),
      localId: NonemptyStringSchema,
    }),
  ]),
);
const EngineeringCheckSchema = z.strictObject({
  id: NonemptyStringSchema,
  targets: z.array(PythonIdentifierSchema).min(1),
  explanation: NonemptyStringSchema,
  predicateText: NonemptyStringSchema,
  nodes: z.array(SymbolicFormulaNodeSchema).min(1),
});
const MethodHelperSchema: z.ZodType<MethodHelperRecord> = z.lazy(() =>
  z.strictObject({
    id: IdentityStringSchema,
    moduleId: ModuleIdSchema,
    function: PythonIdentifierSchema,
    sourceHash: HashSchema,
    revision: HashSchema,
    parameterNames: z.array(PythonIdentifierSchema),
    outputNames: z.array(NonemptyStringSchema).min(1),
    quantities: z.array(MethodQuantitySchema).min(1),
    content: z.array(MethodContentSchema).min(1),
    helpers: z.array(MethodHelperSchema),
    checks: z.array(EngineeringCheckSchema).min(1).optional(),
    applicability: z.array(EngineeringCheckSchema).min(1).optional(),
  }),
);
const MethodPlanSchema = z.strictObject({
  id: IdentityStringSchema,
  localId: NonemptyStringSchema,
  invocationId: IdentityStringSchema,
  title: NonemptyStringSchema,
  moduleId: ModuleIdSchema,
  function: PythonIdentifierSchema,
  sourceHash: HashSchema,
  interfaceFingerprint: HashSchema,
  revision: HashSchema,
  parameterNames: z.array(PythonIdentifierSchema),
  outputNames: z.array(NonemptyStringSchema),
  quantities: z.array(MethodQuantitySchema).min(1),
  content: z.array(MethodContentSchema).min(1),
  helpers: z.array(MethodHelperSchema),
  checks: z.array(EngineeringCheckSchema).min(1).optional(),
  applicability: z.array(EngineeringCheckSchema).min(1).optional(),
  location: SourceSpanSchema,
});
const BoundCellSchema = z.strictObject({
  caseInvocationId: IdentityStringSchema,
  heading: NonemptyStringSchema,
  quantity: NonemptyStringSchema,
  role: z.enum(['input', 'output']),
  symbolId: IdentityStringSchema,
  unit: z.string(),
});
const LogicalTableSchema = z.strictObject({
  id: IdentityStringSchema,
  localId: NonemptyStringSchema,
  invocationId: IdentityStringSchema,
  title: NonemptyStringSchema,
  methodId: IdentityStringSchema,
  casesAxis: z.enum(['columns', 'rows']),
  inputs: z.array(NonemptyStringSchema),
  outputs: z.array(NonemptyStringSchema),
  cases: z.array(
    z.strictObject({
      heading: NonemptyStringSchema,
      invocationId: IdentityStringSchema,
      sectionId: IdentityStringSchema,
    }),
  ),
  cells: z.array(BoundCellSchema),
  location: SourceSpanSchema,
});
const BranchOutcomeSchema = z.strictObject({
  invocationId: IdentityStringSchema,
  symbolId: IdentityStringSchema,
  nodeKey: NonemptyStringSchema,
  value: z.boolean(),
  usedKeys: z.array(NonemptyStringSchema).min(1),
  label: NonemptyStringSchema,
});
const CheckOutcomeSchema = z.strictObject({
  methodId: IdentityStringSchema,
  invocationId: IdentityStringSchema,
  checkId: NonemptyStringSchema,
  value: z.boolean(),
  usedKeys: z.array(NonemptyStringSchema).min(1),
});
const ApplicabilityOutcomeSchema = z.strictObject({
  methodId: IdentityStringSchema,
  invocationId: IdentityStringSchema,
  applicabilityId: NonemptyStringSchema,
  value: z.boolean(),
  usedKeys: z.array(NonemptyStringSchema).min(1),
});

const ExecutionPayloadBaseSchema = z
  .object({
    cso: CalculationSourceObjectSchema,
    authoring: AuthoringEvidenceSchema.optional(),
    entry: ResolvedInputEvidenceSchema.safeExtend({
      moduleId: ModuleIdSchema,
      function: PythonIdentifierSchema,
      sourceHash: HashSchema,
      invocationId: z.literal('root'),
    }).strict(),
    sourceManifest: SourceManifestSchema,
    sourceClosureHash: HashSchema,
    invocations: z.array(InvocationSchema).min(1),
    observations: z.array(SymbolObservationSchema),
    operationObservations: z.array(OperationObservationSchema).optional(),
    methods: z.array(MethodPlanSchema).min(1).optional(),
    tables: z.array(LogicalTableSchema).min(1).optional(),
    branchOutcomes: z.array(BranchOutcomeSchema).min(1).optional(),
    checkOutcomes: z.array(CheckOutcomeSchema).min(1).optional(),
    applicabilityOutcomes: z
      .array(ApplicabilityOutcomeSchema)
      .min(1)
      .optional(),
    assets: z.array(AssetRecordSchema),
    versions: VersionsSchema,
  })
  .strict();

type Payload = z.infer<typeof ExecutionPayloadBaseSchema>;
type Span = z.infer<typeof SourceSpanSchema>;
type Address = z.infer<typeof NodeAddressSchema>;
type Invocation = z.infer<typeof InvocationSchema>;
type SymbolDefinition = z.infer<typeof SymbolDefinitionSchema>;
type Path = (string | number)[];

const sameSpan = (left: Span, right: Span): boolean =>
  left.moduleId === right.moduleId &&
  left.start.line === right.start.line &&
  left.start.column === right.start.column &&
  left.end.line === right.end.line &&
  left.end.column === right.end.column;
const precedes = (left: Span, right: Span): boolean =>
  left.moduleId === right.moduleId &&
  (left.end.line < right.start.line ||
    (left.end.line === right.start.line &&
      left.end.column <= right.start.column));
const equalInputs = (
  left: Payload['entry']['resolvedInputs'],
  right: Payload['entry']['resolvedInputs'],
): boolean =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.entries(left).every(
    ([name, value]) =>
      Object.hasOwn(right, name) && Object.is(right[name], value),
  );

export const ExecutionPayloadSchema = ExecutionPayloadBaseSchema.superRefine(
  (execution, ctx) => {
    const issue = (
      diagnosticCode: string,
      path: Path,
      message: string,
      identity?: {
        readonly symbolId?: string;
        readonly parameterName?: string;
      },
    ): void => {
      ctx.addIssue({
        code: 'custom',
        path,
        message,
        params: {
          diagnosticCode,
          ...identity,
        },
      });
    };
    const modules = new Map<string, string>();
    for (const [index, item] of execution.sourceManifest.entries()) {
      if (modules.has(item.moduleId)) {
        issue(
          'DUPLICATE_MODULE',
          ['sourceManifest', index, 'moduleId'],
          'Source manifest module IDs must be unique',
        );
      }
      modules.set(item.moduleId, item.sha256);
    }
    const location = (
      span: Span,
      path: Path,
      expectedModule?: string,
    ): void => {
      if (!modules.has(span.moduleId)) {
        issue(
          'UNKNOWN_MODULE',
          [...path, 'moduleId'],
          'Source location module does not resolve in the source manifest',
        );
      }
      if (expectedModule !== undefined && span.moduleId !== expectedModule) {
        issue(
          'LOCATION_MODULE_MISMATCH',
          [...path, 'moduleId'],
          'Source location belongs to a different invocation module',
        );
      }
    };
    if (modules.get(execution.entry.moduleId) !== execution.entry.sourceHash) {
      issue(
        'ENTRY_SOURCE_HASH_MISMATCH',
        ['entry', 'sourceHash'],
        'Entry source hash must match its source manifest record',
      );
    }
    if (
      SourceManifestSchema.safeParse(execution.sourceManifest).success &&
      sourceClosureHash(execution.sourceManifest) !==
        execution.sourceClosureHash
    ) {
      issue(
        'SOURCE_CLOSURE_HASH_MISMATCH',
        ['sourceClosureHash'],
        'Source closure hash does not match the canonical manifest encoding',
      );
    }

    const invocations = new Map<string, Invocation>();
    for (const [index, invocation] of execution.invocations.entries()) {
      if (invocations.has(invocation.id)) {
        issue(
          'DUPLICATE_INVOCATION',
          ['invocations', index, 'id'],
          'Invocation IDs must be unique',
        );
      }
      invocations.set(invocation.id, invocation);
      if (!modules.has(invocation.moduleId)) {
        issue(
          'UNKNOWN_MODULE',
          ['invocations', index, 'moduleId'],
          'Invocation module does not resolve in the source manifest',
        );
      }
    }
    const root = invocations.get('root');
    if (!root) {
      issue(
        'MISSING_ROOT_INVOCATION',
        ['invocations'],
        'Execution must include the root invocation',
      );
    } else if (
      root.moduleId !== execution.entry.moduleId ||
      root.function !== execution.entry.function ||
      !equalInputs(root.resolvedInputs, execution.entry.resolvedInputs)
    ) {
      issue(
        'ENTRY_INVOCATION_MISMATCH',
        ['entry'],
        'Entry module, function and resolved inputs must match the root invocation',
      );
    }

    if (root) {
      for (const name of Object.keys(execution.entry.resolvedInputs)) {
        const entryKind = resolvedInputKind(execution.entry, name);
        const rootKind = resolvedInputKind(root, name);
        if (
          entryKind !== undefined &&
          rootKind !== undefined &&
          entryKind !== rootKind
        ) {
          issue(
            'INPUT_NUMERIC_KIND_MISMATCH',
            ['entry', 'resolvedInputKinds', name],
            'Entry numeric kind differs from the root invocation',
          );
        }
      }
    }

    const checkMetadata = (
      metadata: Record<string, unknown> | undefined,
      path: Path,
      invocationId?: string,
      localId?: string,
      definitionLocation?: Span,
    ): void => {
      if (!metadata) {
        return;
      }
      if (
        metadata.invocationId !== undefined &&
        (typeof metadata.invocationId !== 'string' ||
          !invocations.has(metadata.invocationId))
      ) {
        issue(
          'UNKNOWN_METADATA_INVOCATION',
          [...path, 'invocationId'],
          'Metadata invocation must resolve to an execution invocation',
        );
      }
      if (
        metadata.invocationId !== undefined &&
        invocationId !== undefined &&
        metadata.invocationId !== invocationId
      ) {
        issue(
          'METADATA_INVOCATION_MISMATCH',
          [...path, 'invocationId'],
          'Metadata invocation must match its namespaced identity',
        );
      }
      if (
        metadata.localId !== undefined &&
        localId !== undefined &&
        metadata.localId !== localId
      ) {
        issue(
          'METADATA_LOCAL_ID_MISMATCH',
          [...path, 'localId'],
          'Metadata authored ID must match its namespaced identity',
        );
      }
      if (metadata.location === undefined) {
        return;
      }
      const parsed = SourceSpanSchema.safeParse(metadata.location);
      if (!parsed.success) {
        issue(
          'INVALID_METADATA_LOCATION',
          [...path, 'location'],
          'Metadata location must be a supported source span',
        );
        return;
      }
      location(
        parsed.data,
        [...path, 'location'],
        invocationId === undefined
          ? undefined
          : invocations.get(invocationId)?.moduleId,
      );
      if (definitionLocation && !sameSpan(parsed.data, definitionLocation)) {
        issue(
          'METADATA_LOCATION_MISMATCH',
          [...path, 'location'],
          'Symbol metadata location must match its definition',
        );
      }
    };
    checkMetadata(execution.cso.source.metadata, ['cso', 'source', 'metadata']);
    const NamespaceSchema = z.tuple([
      z.enum(['symbol', 'section', 'text', 'figure', 'method', 'table']),
      IdentityStringSchema,
      IdentityStringSchema,
    ]);
    const checkNamespace = (
      id: string,
      kind: 'symbol' | 'section' | 'text' | 'figure' | 'method' | 'table',
      path: Path,
      metadata?: Record<string, unknown>,
      metadataPath: Path = [...path.slice(0, -1), 'metadata'],
    ): void => {
      let decoded: unknown;
      try {
        decoded = JSON.parse(id);
      } catch {
        issue(
          'ITEM_NAMESPACE_MISMATCH',
          path,
          'Document identity must use the compact namespaced encoding',
        );
        return;
      }
      const parsed = NamespaceSchema.safeParse(decoded);
      if (!parsed.success) {
        issue(
          'ITEM_NAMESPACE_MISMATCH',
          path,
          'Document identity must include kind, invocation and authored local ID',
        );
        return;
      }
      const [actualKind, invocationId, localId] = parsed.data;
      checkMetadata(metadata, metadataPath, invocationId, localId);
      if (
        actualKind !== kind ||
        id !== namespacedId(kind, invocationId, localId)
      ) {
        issue(
          'ITEM_NAMESPACE_MISMATCH',
          path,
          'Document identity does not match its item kind or canonical encoding',
        );
      }
      if (!invocations.has(invocationId)) {
        issue(
          'UNKNOWN_ITEM_INVOCATION',
          path,
          'Document identity invocation does not resolve',
        );
      }
    };
    const itemIdentities = new Set<string>();
    const csoSymbolPaths = new Map<string, Path>();
    const checkPlacedIdentity = (
      id: string,
      kind: 'text' | 'figure',
      path: Path,
      metadata?: Record<string, unknown>,
    ): void => {
      checkNamespace(id, kind, path, metadata);
      if (itemIdentities.has(id)) {
        issue(
          'DUPLICATE_ITEM_ID',
          path,
          'Text and figure placements must have unique identities',
        );
      }
      itemIdentities.add(id);
    };
    for (const [sectionIndex, section] of execution.cso.sections.entries()) {
      checkNamespace(
        section.id,
        'section',
        ['cso', 'sections', sectionIndex, 'id'],
        section.metadata,
      );
      for (const [itemIndex, item] of section.items.entries()) {
        if (item.kind === 'symbol') {
          csoSymbolPaths.set(item.symbol.id, [
            'cso',
            'sections',
            sectionIndex,
            'items',
            itemIndex,
            'symbol',
          ]);
        }
        if (item.kind === 'text' || item.kind === 'figure') {
          checkPlacedIdentity(
            item.id,
            item.kind,
            ['cso', 'sections', sectionIndex, 'items', itemIndex, 'id'],
            item.metadata,
          );
        } else if (item.kind === 'symbol') {
          checkNamespace(
            item.symbol.id,
            'symbol',
            [
              'cso',
              'sections',
              sectionIndex,
              'items',
              itemIndex,
              'symbol',
              'id',
            ],
            item.metadata,
            ['cso', 'sections', sectionIndex, 'items', itemIndex, 'metadata'],
          );
        } else if (item.kind === 'method' || item.kind === 'table') {
          checkNamespace(
            item.id,
            item.kind,
            ['cso', 'sections', sectionIndex, 'items', itemIndex, 'id'],
            item.metadata,
          );
        } else {
          checkMetadata(item.metadata, [
            'cso',
            'sections',
            sectionIndex,
            'items',
            itemIndex,
            'metadata',
          ]);
        }
      }
    }
    for (const [index, item] of (execution.cso.detachedItems ?? []).entries()) {
      if (item.kind === 'symbol') {
        csoSymbolPaths.set(item.symbol.id, [
          'cso',
          'detachedItems',
          index,
          'symbol',
        ]);
      }
      if (item.kind === 'text' || item.kind === 'figure') {
        checkPlacedIdentity(item.id, item.kind, [
          'cso',
          'detachedItems',
          index,
          'id',
        ]);
      }
    }
    const csoSymbols = new Map(
      collectCsoSymbols(execution.cso).map((symbol) => [symbol.id, symbol]),
    );
    if (execution.authoring) {
      for (const symbol of csoSymbols.values()) {
        const path = csoSymbolPaths.get(symbol.id) ?? ['cso'];
        const glyph = symbol.glyph;
        const authored = symbol.metadata?.authoredGlyph;
        const scope = symbol.metadata?.glyphScope;
        if (authored !== undefined || scope !== undefined) {
          const invocationId = symbol.metadata?.invocationId;
          if (
            typeof authored !== 'string' ||
            typeof scope !== 'string' ||
            typeof invocationId !== 'string' ||
            invocationId === 'root' ||
            scope !== invocationId.split('/').slice(1).join(',') ||
            glyph !== scopedGlyph(authored, scope) ||
            symbol.glyphPlaintext !== glyph
          ) {
            issue(
              'GLYPH_SCOPE_MISMATCH',
              [...path, 'glyph'],
              'Qualified glyph must match its authored glyph and complete call-binding path',
              { symbolId: symbol.id },
            );
          }
        }
      }
    }
    const definitions = new Map<
      string,
      { definition: SymbolDefinition; invocation: Invocation }
    >();
    for (const [
      invocationIndex,
      invocation,
    ] of execution.invocations.entries()) {
      const path: Path = ['invocations', invocationIndex];
      if ('parentInvocationId' in invocation) {
        const parent = invocations.get(invocation.parentInvocationId);
        if (!parent) {
          issue(
            'UNKNOWN_PARENT_INVOCATION',
            [...path, 'parentInvocationId'],
            'Parent invocation does not resolve',
          );
        }
        if (
          invocation.id !==
          `${invocation.parentInvocationId}/${invocation.callBindingName}`
        ) {
          issue(
            'INVOCATION_NAMESPACE_MISMATCH',
            [...path, 'id'],
            'Child invocation ID must extend its parent with its call binding',
          );
        }
        location(invocation.callSite, [...path, 'callSite'], parent?.moduleId);
        const visited = new Set<string>([invocation.id]);
        let ancestor = parent;
        while (ancestor && 'parentInvocationId' in ancestor) {
          if (visited.has(ancestor.id)) {
            issue(
              'INVOCATION_CYCLE',
              [...path, 'parentInvocationId'],
              'Invocation ancestry contains a cycle',
            );
            break;
          }
          visited.add(ancestor.id);
          ancestor = invocations.get(ancestor.parentInvocationId);
        }
        if (!ancestor || ancestor.id !== 'root') {
          issue(
            'DISCONNECTED_INVOCATION',
            path,
            'Invocation ancestry must terminate at root',
          );
        }
      }
      const variableNames = new Set<string>();
      const localIds = new Set<string>();
      let previous: SymbolDefinition | undefined;
      for (const [symbolIndex, definition] of invocation.symbols.entries()) {
        const symbolPath = [...path, 'symbols', symbolIndex];
        if (variableNames.has(definition.variableName)) {
          issue(
            'DUPLICATE_VARIABLE_NAME',
            [...symbolPath, 'variableName'],
            'Return keys must resolve to one symbol in each invocation',
          );
        }
        variableNames.add(definition.variableName);
        if (localIds.has(definition.localId)) {
          issue(
            'DUPLICATE_LOCAL_SYMBOL_ID',
            [...symbolPath, 'localId'],
            'Authored symbol IDs must be unique within their invocation',
          );
        }
        localIds.add(definition.localId);
        if (definitions.has(definition.symbolId)) {
          issue(
            'DUPLICATE_SYMBOL_DEFINITION',
            [...symbolPath, 'symbolId'],
            'A documented symbol must have one definition',
          );
        }
        definitions.set(definition.symbolId, { definition, invocation });
        if (
          IdentityStringSchema.safeParse(invocation.id).success &&
          IdentityStringSchema.safeParse(definition.localId).success &&
          definition.symbolId !==
            namespacedId('symbol', invocation.id, definition.localId)
        ) {
          issue(
            'SYMBOL_NAMESPACE_MISMATCH',
            [...symbolPath, 'symbolId'],
            'Symbol identity must match its invocation and authored local ID',
          );
        }
        if (!csoSymbols.has(definition.symbolId)) {
          issue(
            'ORPHAN_SYMBOL_DEFINITION',
            [...symbolPath, 'symbolId'],
            'Symbol definition does not resolve to a canonical CSO symbol',
          );
        }
        const csoSymbol = csoSymbols.get(definition.symbolId);
        const csoSymbolPath = csoSymbolPaths.get(definition.symbolId);
        if (csoSymbol && csoSymbolPath) {
          checkMetadata(
            csoSymbol.metadata,
            [...csoSymbolPath, 'metadata'],
            invocation.id,
            definition.localId,
            definition.definitionLocation,
          );
          checkMetadata(
            csoSymbol.valueTree.metadata,
            [...csoSymbolPath, 'valueTree', 'metadata'],
            invocation.id,
          );
          for (const [nodeIndex, node] of csoSymbol.valueTree.nodes.entries()) {
            checkMetadata(
              node.metadata,
              [...csoSymbolPath, 'valueTree', 'nodes', nodeIndex, 'metadata'],
              invocation.id,
            );
          }
        }
        location(
          definition.definitionLocation,
          [...symbolPath, 'definitionLocation'],
          invocation.moduleId,
        );
        if (
          previous &&
          !precedes(previous.definitionLocation, definition.definitionLocation)
        ) {
          issue(
            'SYMBOL_DEFINITION_ORDER',
            symbolPath,
            'Symbol definitions must follow annotated assignment source order',
          );
        }
        previous = definition;
        if (definition.kind === 'input') {
          if (definition.givenSource.kind === 'parameter') {
            if (
              !Object.hasOwn(
                invocation.resolvedInputs,
                definition.givenSource.parameterName,
              )
            ) {
              issue(
                'UNKNOWN_INPUT_PARAMETER',
                [...symbolPath, 'givenSource', 'parameterName'],
                'Given parameter does not resolve to an invocation input',
              );
            }
          } else {
            location(
              definition.givenSource.location,
              [...symbolPath, 'givenSource', 'location'],
              invocation.moduleId,
            );
          }
        }
        if (definition.kind === 'constant') {
          location(
            definition.literal.location,
            [...symbolPath, 'literal', 'location'],
            invocation.moduleId,
          );
        }
      }
      const boundParameters = new Set<string>();
      for (const [
        bindingIndex,
        binding,
      ] of invocation.inputBindings.entries()) {
        const bindingPath = [...path, 'inputBindings', bindingIndex];
        if (boundParameters.has(binding.parameterName)) {
          issue(
            'DUPLICATE_INPUT_BINDING',
            [...bindingPath, 'parameterName'],
            'Each resolved parameter must have exactly one binding',
          );
        }
        boundParameters.add(binding.parameterName);
        if (!Object.hasOwn(invocation.resolvedInputs, binding.parameterName)) {
          issue(
            'UNKNOWN_INPUT_BINDING',
            [...bindingPath, 'parameterName'],
            'Binding parameter is absent from resolved inputs',
          );
        }
        location(
          binding.parameterLocation,
          [...bindingPath, 'parameterLocation'],
          invocation.moduleId,
        );
        if (binding.kind === 'parsedDefault') {
          location(
            binding.defaultLocation,
            [...bindingPath, 'defaultLocation'],
            invocation.moduleId,
          );
        }
        if (
          binding.kind === 'callerLiteral' ||
          binding.kind === 'callerSymbol'
        ) {
          const parent =
            'parentInvocationId' in invocation
              ? invocations.get(invocation.parentInvocationId)
              : undefined;
          location(
            binding.callerLocation,
            [...bindingPath, 'callerLocation'],
            parent?.moduleId,
          );
        }
      }
      for (const parameter of Object.keys(invocation.resolvedInputs)) {
        if (!boundParameters.has(parameter)) {
          issue(
            'MISSING_INPUT_BINDING',
            [...path, 'inputBindings'],
            `Resolved parameter '${parameter}' has no binding`,
            { parameterName: parameter },
          );
        }
      }
    }
    for (const symbolId of csoSymbols.keys()) {
      if (!definitions.has(symbolId)) {
        issue(
          'MISSING_SYMBOL_DEFINITION',
          ['invocations'],
          `CSO symbol '${symbolId}' has no definition`,
          { symbolId },
        );
      }
    }

    const address = (
      nodeAddress: Address,
      path: Path,
      invocationId?: string,
      rootOnly = false,
    ): boolean => {
      const owner = definitions.get(nodeAddress.symbolId);
      const symbol = csoSymbols.get(nodeAddress.symbolId);
      if (!(owner && symbol)) {
        issue(
          'UNKNOWN_NODE_SYMBOL',
          [...path, 'symbolId'],
          'Node address symbol does not resolve to a documented symbol',
        );
        return false;
      }
      if (invocationId !== undefined && owner.invocation.id !== invocationId) {
        issue(
          'NODE_INVOCATION_MISMATCH',
          path,
          'Node address belongs to a different invocation',
        );
      }
      if (
        !symbol.valueTree.nodes.some((node) => node.key === nodeAddress.nodeKey)
      ) {
        issue(
          'UNKNOWN_NODE_ADDRESS',
          [...path, 'nodeKey'],
          'Node key does not resolve inside the addressed symbol value tree',
        );
        return false;
      }
      if (rootOnly && symbol.valueTree.rootKey !== nodeAddress.nodeKey) {
        issue(
          'NON_ROOT_NODE_BINDING',
          [...path, 'nodeKey'],
          'This binding must reference the symbol value-tree root',
        );
      }
      return true;
    };
    for (const [
      invocationIndex,
      invocation,
    ] of execution.invocations.entries()) {
      const path: Path = ['invocations', invocationIndex];
      for (const [symbolIndex, definition] of invocation.symbols.entries()) {
        if (definition.kind === 'formula') {
          const addressPath = [...path, 'symbols', symbolIndex, 'address'];
          address(definition.address, addressPath, invocation.id, true);
          if (definition.address.symbolId !== definition.symbolId) {
            issue(
              'FORMULA_SYMBOL_MISMATCH',
              addressPath,
              'Formula address must name its own documented symbol',
            );
          }
        }
      }
      if (!('parentInvocationId' in invocation)) {
        continue;
      }
      for (const [
        bindingIndex,
        binding,
      ] of invocation.inputBindings.entries()) {
        if (binding.kind !== 'callerSymbol') {
          continue;
        }
        const sourcePath = [...path, 'inputBindings', bindingIndex, 'source'];
        address(binding.source, sourcePath, undefined, true);
        const source = definitions.get(binding.source.symbolId);
        if (!source) {
          continue;
        }
        const earlierParentSymbol =
          source.invocation.id === invocation.parentInvocationId &&
          precedes(source.definition.definitionLocation, invocation.callSite);
        const earlierChild =
          'parentInvocationId' in source.invocation &&
          source.invocation.parentInvocationId ===
            invocation.parentInvocationId &&
          source.invocation.id !== invocation.id &&
          precedes(source.invocation.callSite, invocation.callSite);
        const inheritedParameter = execution.authoring?.parameters.find(
          (p) =>
            p.invocationId === invocation.id &&
            p.parameterName === binding.parameterName &&
            p.origin.kind !== 'local' &&
            p.symbolId === binding.source.symbolId,
        );
        if (
          earlierChild &&
          execution.authoring &&
          !execution.authoring.outputDeclarations.some(
            (output) =>
              output.invocationId === source.invocation.id &&
              output.symbolId === binding.source.symbolId,
          )
        ) {
          issue(
            'PRIVATE_OUTPUT_REFERENCE',
            sourcePath,
            'Caller bindings can only use public child outputs',
          );
        }
        if (!(earlierParentSymbol || earlierChild || inheritedParameter)) {
          issue(
            'INVALID_CALLER_SYMBOL_SOURCE',
            sourcePath,
            'Caller input must reference an earlier caller symbol or earlier child output',
          );
        }
      }
    }

    if (execution.authoring) {
      const evidence = execution.authoring;
      const key = (invocationId: string, name: string) =>
        JSON.stringify([invocationId, name]);
      const parameters = new Map(
        evidence.parameters.map((p) => [
          key(p.invocationId, p.parameterName),
          p,
        ]),
      );
      const outputs = new Map(
        evidence.outputs.map((o) => [key(o.invocationId, o.name), o]),
      );
      const declared = new Map(
        evidence.outputDeclarations.map((o) => [
          key(o.invocationId, o.name),
          o,
        ]),
      );
      if (
        declared.size !== evidence.outputDeclarations.length ||
        declared.size !== outputs.size ||
        evidence.outputDeclarations.some((d) => {
          const observation = outputs.get(key(d.invocationId, d.name));
          return (
            !observation ||
            d.symbolId !== observation.symbolId ||
            JSON.stringify(d.source) !== JSON.stringify(observation.source) ||
            !sameSpan(d.location, observation.location)
          );
        })
      )
        issue(
          'OUTPUT_OBSERVATION_COVERAGE',
          ['authoring', 'outputs'],
          'Every declared output requires exactly one matching runtime observation',
        );
      if (
        parameters.size !== evidence.parameters.length ||
        outputs.size !== evidence.outputs.length
      )
        issue(
          'DUPLICATE_AUTHORING_IDENTITY',
          ['authoring'],
          'Parameter and output identities must be unique',
        );
      const resolve = (
        source: (typeof evidence.parameters)[number]['origin'],
        ownerId: string,
        output: boolean,
      ): string | undefined => {
        const owner = invocations.get(ownerId);
        if (!owner) return undefined;
        if (source.kind === 'local') return undefined;
        if (source.kind === 'symbol') {
          const definition = definitions.get(source.symbolId);
          const expectedOwner = output
            ? owner.id
            : 'parentInvocationId' in owner
              ? owner.parentInvocationId
              : undefined;
          if (!definition || definition.invocation.id !== expectedOwner)
            return undefined;
          if (
            !output &&
            'callSite' in owner &&
            !precedes(definition.definition.definitionLocation, owner.callSite)
          )
            return undefined;
          return source.symbolId;
        }
        if (source.kind === 'parameter') {
          const expectedOwner = output
            ? owner.id
            : 'parentInvocationId' in owner
              ? owner.parentInvocationId
              : undefined;
          if (source.invocationId !== expectedOwner) return undefined;
          return parameters.get(key(source.invocationId, source.parameterName))
            ?.symbolId;
        }
        const child = invocations.get(source.invocationId);
        const expectedParent = output
          ? owner.id
          : 'parentInvocationId' in owner
            ? owner.parentInvocationId
            : undefined;
        if (
          !child ||
          !('parentInvocationId' in child) ||
          child.parentInvocationId !== expectedParent
        )
          return undefined;
        if (
          !output &&
          'callSite' in owner &&
          !precedes(child.callSite, owner.callSite)
        )
          return undefined;
        return outputs.get(key(source.invocationId, source.outputName))
          ?.symbolId;
      };
      for (const invocation of execution.invocations) {
        for (const binding of invocation.inputBindings) {
          const parameter = parameters.get(
            key(invocation.id, binding.parameterName),
          );
          if (!parameter)
            issue(
              'MISSING_PARAMETER_DECLARATION',
              ['authoring', 'parameters'],
              'Every input binding requires a parameter declaration',
            );
        }
      }
      for (const [index, parameter] of evidence.parameters.entries()) {
        const path: Path = ['authoring', 'parameters', index];
        const owner = invocations.get(parameter.invocationId);
        const binding = owner?.inputBindings.find(
          (b) => b.parameterName === parameter.parameterName,
        );
        const symbol = csoSymbols.get(parameter.symbolId);
        location(parameter.location, [...path, 'location'], owner?.moduleId);
        if (
          !owner ||
          !binding ||
          !symbol ||
          !sameSpan(parameter.location, binding.parameterLocation)
        ) {
          issue(
            'INVALID_PARAMETER_DECLARATION',
            path,
            'Parameter must match an invocation input and documented symbol',
          );
          continue;
        }
        if (symbol.unit !== parameter.unit)
          issue(
            'INPUT_UNIT_MISMATCH',
            path,
            'Caller symbol unit differs from parameter unit',
          );
        if (
          parameter.numericType === 'int' &&
          (!Number.isInteger(owner.resolvedInputs[parameter.parameterName]) ||
            resolvedInputKind(owner, parameter.parameterName) === 'float' ||
            execution.observations.some(
              (observation) =>
                observation.symbolId === parameter.symbolId &&
                observation.numericKind === 'float',
            ))
        )
          issue(
            'INPUT_TYPE_MISMATCH',
            path,
            'Integer parameter received a non-integer value',
          );
        if (parameter.origin.kind === 'local') {
          const definition = definitions.get(parameter.symbolId);
          if (
            !definition ||
            definition.invocation.id !== owner.id ||
            definition.definition.kind !== 'input' ||
            definition.definition.givenSource.kind !== 'parameter' ||
            definition.definition.givenSource.parameterName !==
              parameter.parameterName
          )
            issue(
              'INVALID_PARAMETER_SOURCE',
              path,
              'Local parameters require their own input definition',
            );
        } else if (
          binding.kind !== 'callerSymbol' ||
          binding.source.symbolId !== parameter.symbolId ||
          resolve(parameter.origin, owner.id, false) !== parameter.symbolId
        ) {
          issue(
            'INVALID_PARAMETER_SOURCE',
            path,
            'Inherited parameters must follow their immediate caller binding',
          );
        }
      }
      for (const [index, output] of evidence.outputs.entries()) {
        const owner = invocations.get(output.invocationId);
        const path: Path = ['authoring', 'outputs', index];
        location(output.location, [...path, 'location'], owner?.moduleId);
        if (
          !owner ||
          !csoSymbols.has(output.symbolId) ||
          resolve(output.source, output.invocationId, true) !== output.symbolId
        )
          issue(
            'INVALID_OUTPUT_SOURCE',
            path,
            'Outputs must expose a local symbol, parameter or child public output',
          );
      }
      const uses = new Set<string>();
      for (const [index, use] of evidence.uses.entries()) {
        const path: Path = ['authoring', 'uses', index];
        const owner = invocations.get(use.invocationId);
        const parameter = parameters.get(
          key(use.invocationId, use.parameterName),
        );
        const symbol = csoSymbols.get(use.address.symbolId);
        const node = symbol?.valueTree.nodes.find(
          (n) => n.key === use.address.nodeKey,
        );
        const identity = JSON.stringify(use.address);
        location(use.location, [...path, 'location'], owner?.moduleId);
        if (uses.has(identity))
          issue(
            'DUPLICATE_PARAMETER_USE',
            path,
            'A formula operand has one parameter binding',
          );
        uses.add(identity);
        if (
          !owner ||
          !parameter ||
          definitions.get(use.address.symbolId)?.invocation.id !== owner.id ||
          !node ||
          node.mode !== 'SYMBOL' ||
          node.symbol?.id !== parameter.symbolId ||
          node.metadata?.parameterName !== use.parameterName ||
          JSON.stringify(node.metadata?.location) !==
            JSON.stringify(use.location)
        )
          issue(
            'INVALID_PARAMETER_USE',
            path,
            'Parameter use must agree with its formula operand and original source location',
          );
      }
      for (const symbol of csoSymbols.values())
        for (const node of symbol.valueTree.nodes) {
          if (node.mode === 'SYMBOL' && node.symbol) {
            const ownerId = definitions.get(symbol.id)?.invocation.id;
            const referencedOwner = definitions.get(node.symbol.id)?.invocation
              .id;
            const childId = node.metadata?.outputInvocationId;
            const outputName = node.metadata?.outputName;
            if (typeof childId === 'string' && typeof outputName === 'string') {
              const child = invocations.get(childId);
              const target = outputs.get(key(childId, outputName));
              const definition = definitions.get(symbol.id)?.definition;
              if (
                !child ||
                !('parentInvocationId' in child) ||
                child.parentInvocationId !== ownerId ||
                !target ||
                target.symbolId !== node.symbol.id ||
                !definition ||
                !precedes(child.callSite, definition.definitionLocation)
              )
                issue(
                  'INVALID_OUTPUT_USE',
                  ['authoring'],
                  'Formula output references must select an earlier public child output',
                );
            } else if (
              ownerId !== referencedOwner &&
              node.metadata?.parameterName === undefined
            ) {
              const definition = definitions.get(symbol.id)?.definition;
              if (definition?.kind !== 'input')
                issue(
                  'MISSING_REFERENCE_PROVENANCE',
                  ['authoring'],
                  'Nonlocal formula operands require parameter or output provenance',
                );
            }
          }
          if (
            node.metadata?.parameterName !== undefined &&
            !uses.has(
              JSON.stringify({ symbolId: symbol.id, nodeKey: node.key }),
            )
          )
            issue(
              'MISSING_PARAMETER_USE',
              ['authoring', 'uses'],
              'Every parameter operand requires provenance',
            );
        }
    }
    const observed = new Set<string>();
    for (const [index, observation] of execution.observations.entries()) {
      const path: Path = ['observations', index];
      if (observed.has(observation.symbolId)) {
        issue(
          'DUPLICATE_OBSERVATION',
          [...path, 'symbolId'],
          'A documented symbol must have exactly one runtime observation',
        );
      }
      observed.add(observation.symbolId);
      const owner = definitions.get(observation.symbolId);
      if (owner) {
        if (observation.invocationId !== owner.invocation.id) {
          issue(
            'OBSERVATION_INVOCATION_MISMATCH',
            [...path, 'invocationId'],
            'Runtime observation invocation must match its symbol definition',
          );
        }
        if (observation.kind !== owner.definition.kind) {
          issue(
            'OBSERVATION_KIND_MISMATCH',
            [...path, 'kind'],
            'Runtime observation kind must match its symbol definition',
          );
        }
        if (
          !sameSpan(
            observation.definitionLocation,
            owner.definition.definitionLocation,
          )
        ) {
          issue(
            'OBSERVATION_LOCATION_MISMATCH',
            [...path, 'definitionLocation'],
            'Runtime observation location must match its symbol definition',
          );
        }
      } else {
        issue(
          'ORPHAN_OBSERVATION',
          [...path, 'symbolId'],
          'Runtime observation has no symbol definition',
        );
      }
      location(observation.definitionLocation, [...path, 'definitionLocation']);
    }
    for (const symbolId of definitions.keys()) {
      if (!observed.has(symbolId)) {
        issue(
          'MISSING_OBSERVATION',
          ['observations'],
          `Documented symbol '${symbolId}' has no runtime observation`,
          { symbolId },
        );
      }
    }
    const observedOperations = new Set<string>();
    for (const [index, observation] of (
      execution.operationObservations ?? []
    ).entries()) {
      const path: Path = ['operationObservations', index];
      const key = JSON.stringify([
        observation.address.symbolId,
        observation.address.nodeKey,
      ]);
      if (observedOperations.has(key)) {
        issue(
          'DUPLICATE_OPERATION_OBSERVATION',
          [...path, 'address'],
          'An operation address must have at most one runtime observation',
        );
      }
      observedOperations.add(key);
      address(
        observation.address,
        [...path, 'address'],
        observation.invocationId,
      );
      const owner = invocations.get(observation.invocationId);
      if (!owner) {
        issue(
          'UNKNOWN_INVOCATION',
          [...path, 'invocationId'],
          'Operation observation invocation does not resolve',
        );
      }
      location(observation.location, [...path, 'location'], owner?.moduleId);
    }
    const assets = new Set<string>();
    for (const [index, asset] of execution.assets.entries()) {
      if (assets.has(asset.id)) {
        issue(
          'DUPLICATE_ASSET',
          ['assets', index, 'id'],
          'Asset IDs must be unique',
        );
      }
      assets.add(asset.id);
      if (!modules.has(asset.moduleId)) {
        issue(
          'UNKNOWN_MODULE',
          ['assets', index, 'moduleId'],
          'Asset module does not resolve in the source manifest',
        );
      }
    }
    const comparisonRecords =
      (execution.methods?.length ?? 0) > 0 ||
      (execution.tables?.length ?? 0) > 0;
    if ((execution.cso.schemaVersion === '1.1.0') !== comparisonRecords) {
      issue(
        'INCOMPATIBLE_CONTRACT',
        ['cso', 'schemaVersion'],
        'Comparison evidence uses calculation schema 1.1.0',
      );
    }
    if (comparisonRecords && execution.authoring === undefined) {
      issue(
        'INCOMPATIBLE_CONTRACT',
        ['authoring'],
        'Comparison evidence requires authoring records',
      );
    }
    const methodRecords = new Map(
      (execution.methods ?? []).map((method, index) => [
        method.id,
        { method, index },
      ]),
    );
    const tableRecords = new Map(
      (execution.tables ?? []).map((table, index) => [
        table.id,
        { table, index },
      ]),
    );
    const placedMethods = new Set<string>();
    const placedTables = new Set<string>();
    for (const section of execution.cso.sections) {
      for (const item of section.items) {
        if (item.kind === 'method') placedMethods.add(item.id);
        if (item.kind === 'table') placedTables.add(item.id);
      }
    }
    if (
      placedMethods.symmetricDifference(new Set(methodRecords.keys())).size >
        0 ||
      placedTables.symmetricDifference(new Set(tableRecords.keys())).size > 0
    ) {
      issue(
        'INCOMPATIBLE_CONTRACT',
        ['methods'],
        'Method and table placements must match their evidence records',
      );
    }
    const symbolsById = new Map(
      collectCsoSymbols(execution.cso).map((symbol) => [symbol.id, symbol]),
    );
    const sectionsById = new Map(
      execution.cso.sections.map((section) => [section.id, section]),
    );
    const assetIds = new Set(execution.assets.map((asset) => asset.id));
    const collectHelpers = (
      helpers: MethodHelperRecord[],
      path: (string | number)[],
      into: Map<string, MethodHelperRecord>,
    ): void => {
      for (const [helperIndex, helper] of helpers.entries()) {
        const helperModule = execution.sourceManifest.find(
          (entry) => entry.moduleId === helper.moduleId,
        );
        if (!helperModule || helperModule.sha256 !== helper.sourceHash) {
          issue(
            'DEPENDENCY_SOURCE_MISMATCH',
            [...path, helperIndex, 'sourceHash'],
            'Helper source hash must match the captured module',
          );
        }
        if (into.has(helper.id)) {
          issue(
            'CALL_MAPPING_MISMATCH',
            [...path, helperIndex, 'id'],
            'Helper identities must be unique within a method',
          );
        }
        into.set(helper.id, helper);
        collectHelpers(helper.helpers, [...path, helperIndex, 'helpers'], into);
      }
    };
    const walkMethodContent = (
      content: MethodContentItem[],
      path: (string | number)[],
      quantities: MethodQuantity[],
      helpers: Map<string, MethodHelperRecord>,
      bindings: Set<string>,
    ): void => {
      for (const [contentIndex, item] of content.entries()) {
        const itemPath = [...path, contentIndex];
        if (item.kind === 'quantity') {
          if (
            !quantities.some(
              (quantity) => quantity.variableName === item.variableName,
            )
          ) {
            issue(
              'UNKNOWN_QUANTITY',
              [...itemPath, 'variableName'],
              'Method content must name an explained quantity',
            );
          }
        } else if (item.kind === 'figure') {
          if (!assetIds.has(item.assetId)) {
            issue(
              'UNRESOLVED_ASSET',
              [...itemPath, 'assetId'],
              'Method figure must name a captured asset',
            );
          }
        } else if (item.kind === 'call') {
          if (bindings.has(item.binding)) {
            issue(
              'CALL_MAPPING_MISMATCH',
              [...itemPath, 'binding'],
              'Each helper call keeps its own binding',
            );
          }
          bindings.add(item.binding);
          const helper = helpers.get(item.helperId);
          if (!helper) {
            issue(
              'CALL_MAPPING_MISMATCH',
              [...itemPath, 'helperId'],
              'Call mapping must name a helper in this method',
            );
            continue;
          }
          const inputNames = item.inputs.map((input) => input.name);
          if (
            new Set(inputNames).size !== inputNames.length ||
            inputNames.some((name) => !helper.parameterNames.includes(name))
          ) {
            issue(
              'CALL_MAPPING_MISMATCH',
              [...itemPath, 'inputs'],
              'Call inputs must name distinct helper parameters',
            );
          }
          if (
            new Set(item.outputs).size !== item.outputs.length ||
            item.outputs.some((name) => !helper.outputNames.includes(name))
          ) {
            issue(
              'CALL_MAPPING_MISMATCH',
              [...itemPath, 'outputs'],
              'Call outputs must name distinct helper outputs',
            );
          }
        } else if (item.kind === 'section') {
          walkMethodContent(
            item.content,
            [...itemPath, 'content'],
            quantities,
            helpers,
            bindings,
          );
        }
      }
    };
    const checkHelperContent = (
      helpers: MethodHelperRecord[],
      path: (string | number)[],
      known: Map<string, MethodHelperRecord>,
    ): void => {
      for (const [helperIndex, helper] of helpers.entries()) {
        walkMethodContent(
          helper.content,
          [...path, helperIndex, 'content'],
          helper.quantities,
          known,
          new Set(),
        );
        checkHelperContent(
          helper.helpers,
          [...path, helperIndex, 'helpers'],
          known,
        );
      }
    };
    for (const { method, index } of methodRecords.values()) {
      const recorded = execution.sourceManifest.find(
        (entry) => entry.moduleId === method.moduleId,
      );
      if (!recorded || recorded.sha256 !== method.sourceHash) {
        issue(
          'METHOD_SOURCE_MISMATCH',
          ['methods', index, 'sourceHash'],
          'Method source hash must match the captured module',
        );
      }
      if (!invocations.has(method.invocationId)) {
        issue(
          'UNKNOWN_INVOCATION',
          ['methods', index, 'invocationId'],
          'Method declaration invocation does not resolve',
        );
      }
      const helpers = new Map<string, MethodHelperRecord>();
      collectHelpers(method.helpers, ['methods', index, 'helpers'], helpers);
      walkMethodContent(
        method.content,
        ['methods', index, 'content'],
        method.quantities,
        helpers,
        new Set(),
      );
      checkHelperContent(
        method.helpers,
        ['methods', index, 'helpers'],
        helpers,
      );
    }
    const symbolResults = new Map<string, number>();
    for (const symbol of symbolsById.values()) {
      const result = symbol.valueTree.result;
      if (result && result.kind === 'number') {
        symbolResults.set(symbol.id, result.value);
      }
    }
    const expectedBranches: {
      invocationId: string;
      symbolId: string;
      nodeKey: string;
      value: boolean;
      usedKeys: readonly string[];
      label: string;
    }[] = [];
    let branchesReproduced = true;
    for (const table of execution.tables ?? []) {
      const method = methodRecords.get(table.methodId)?.method;
      if (!method) continue;
      const glyphs = new Map<string, string>();
      for (const quantity of method.quantities) {
        glyphs.set(quantity.variableName, quantity.glyph);
        glyphs.set(quantity.selectionName, quantity.glyph);
      }
      for (const caseItem of table.cases) {
        const invocation = invocations.get(caseItem.invocationId);
        if (!invocation) continue;
        for (const quantity of method.quantities) {
          if (quantity.role === 'input') continue;
          const definition = invocation.symbols.find(
            (item) => item.variableName === quantity.variableName,
          );
          const symbol = definition
            ? symbolsById.get(definition.symbolId)
            : undefined;
          if (!definition || !symbol) continue;
          const reproduced = reproduceBranches(
            symbol.valueTree.nodes,
            symbol.valueTree.rootKey,
            symbolResults,
          );
          if (!reproduced) {
            branchesReproduced = false;
            continue;
          }
          for (const branch of reproduced) {
            const label = branchLabel(
              quantity.nodes,
              glyphs,
              branch.selectedKey,
            );
            if (!label) {
              branchesReproduced = false;
              continue;
            }
            expectedBranches.push({
              invocationId: caseItem.invocationId,
              symbolId: definition.symbolId,
              nodeKey: branch.nodeKey,
              value: branch.value,
              usedKeys: branch.usedKeys,
              label,
            });
          }
        }
      }
    }
    const recordedBranches = execution.branchOutcomes ?? [];
    const branchIdentity = (item: {
      invocationId: string;
      symbolId: string;
      nodeKey: string;
      value: boolean;
      usedKeys: readonly string[];
      label: string;
    }) =>
      JSON.stringify([
        item.invocationId,
        item.symbolId,
        item.nodeKey,
        item.value,
        item.usedKeys,
        item.label,
      ]);
    const recordedIdentities = recordedBranches.map(branchIdentity).sort();
    const expectedIdentities = expectedBranches.map(branchIdentity).sort();
    if (
      !branchesReproduced ||
      recordedIdentities.length !== expectedIdentities.length ||
      recordedIdentities.some(
        (item, index) => item !== expectedIdentities[index],
      )
    ) {
      issue(
        'BRANCH_OUTCOME_MISMATCH',
        ['branchOutcomes'],
        'Branch outcomes must reproduce the captured predicate exactly',
      );
    }
    const expectedChecks: {
      methodId: string;
      invocationId: string;
      checkId: string;
      value: boolean;
      usedKeys: readonly string[];
    }[] = [];
    let checksReproduced = true;
    const expectedApplicability: {
      methodId: string;
      invocationId: string;
      applicabilityId: string;
      value: boolean;
      usedKeys: readonly string[];
    }[] = [];
    let applicabilityReproduced = true;
    const namedValues = (
      invocation: (typeof execution.invocations)[number],
    ) => {
      const values = new Map<string, number>();
      for (const [name, value] of Object.entries(invocation.resolvedInputs)) {
        if (typeof value === 'number') values.set(name, value);
      }
      for (const definition of invocation.symbols) {
        const symbol = symbolsById.get(definition.symbolId);
        const result = symbol?.valueTree.result;
        if (result?.kind === 'number') {
          values.set(definition.variableName, result.value);
        }
      }
      return values;
    };
    const visitPlans = (plan: MethodHelperRecord): void => {
      const seen = new Set<string>();
      for (const check of plan.checks ?? []) {
        if (seen.has(check.id)) checksReproduced = false;
        seen.add(check.id);
        for (const invocation of execution.invocations) {
          if (
            invocation.function !== plan.function ||
            invocation.moduleId !== plan.moduleId
          ) {
            continue;
          }
          const reproduced = reproducePredicate(
            check.nodes,
            check.nodes[0]?.key ?? '',
            namedValues(invocation),
          );
          if (!reproduced) {
            checksReproduced = false;
            continue;
          }
          expectedChecks.push({
            methodId: plan.id,
            invocationId: invocation.id,
            checkId: check.id,
            value: reproduced.value,
            usedKeys: reproduced.usedKeys,
          });
        }
      }
      const seenApplicability = new Set<string>();
      for (const condition of plan.applicability ?? []) {
        if (seenApplicability.has(condition.id)) applicabilityReproduced = false;
        seenApplicability.add(condition.id);
        for (const invocation of execution.invocations) {
          if (
            invocation.function !== plan.function ||
            invocation.moduleId !== plan.moduleId
          ) {
            continue;
          }
          const reproduced = reproducePredicate(
            condition.nodes,
            condition.nodes[0]?.key ?? '',
            namedValues(invocation),
          );
          if (!reproduced) {
            applicabilityReproduced = false;
            continue;
          }
          expectedApplicability.push({
            methodId: plan.id,
            invocationId: invocation.id,
            applicabilityId: condition.id,
            value: reproduced.value,
            usedKeys: reproduced.usedKeys,
          });
        }
      }
      for (const helper of plan.helpers) visitPlans(helper);
    };
    for (const method of execution.methods ?? []) visitPlans(method);
    const recordedChecks = execution.checkOutcomes ?? [];
    const checkIdentity = (item: {
      methodId: string;
      invocationId: string;
      checkId: string;
      value: boolean;
      usedKeys: readonly string[];
    }) =>
      JSON.stringify([
        item.methodId,
        item.invocationId,
        item.checkId,
        item.value,
        item.usedKeys,
      ]);
    const recordedCheckIdentities = recordedChecks.map(checkIdentity).sort();
    const expectedCheckIdentities = expectedChecks.map(checkIdentity).sort();
    if (
      !checksReproduced ||
      recordedCheckIdentities.length !== expectedCheckIdentities.length ||
      recordedCheckIdentities.some(
        (item, index) => item !== expectedCheckIdentities[index],
      )
    ) {
      issue(
        'CHECK_OUTCOME_MISMATCH',
        ['checkOutcomes'],
        'Engineering checks must reproduce the captured predicate exactly',
      );
    }
    const recordedApplicability = execution.applicabilityOutcomes ?? [];
    const applicabilityIdentity = (item: {
      methodId: string;
      invocationId: string;
      applicabilityId: string;
      value: boolean;
      usedKeys: readonly string[];
    }) =>
      JSON.stringify([
        item.methodId,
        item.invocationId,
        item.applicabilityId,
        item.value,
        item.usedKeys,
      ]);
    const recordedApplicabilityIdentities = recordedApplicability
      .map(applicabilityIdentity)
      .sort();
    const expectedApplicabilityIdentities = expectedApplicability
      .map(applicabilityIdentity)
      .sort();
    if (
      !applicabilityReproduced ||
      recordedApplicabilityIdentities.length !==
        expectedApplicabilityIdentities.length ||
      recordedApplicabilityIdentities.some(
        (item, index) => item !== expectedApplicabilityIdentities[index],
      )
    ) {
      issue(
        'APPLICABILITY_OUTCOME_MISMATCH',
        ['applicabilityOutcomes'],
        'Applicability conditions must reproduce the captured predicate exactly',
      );
    }
    const ownedCases = new Set<string>();
    for (const { table, index } of tableRecords.values()) {
      const method = methodRecords.get(table.methodId)?.method;
      if (!method) {
        issue(
          'UNKNOWN_METHOD',
          ['tables', index, 'methodId'],
          'Table method does not resolve',
        );
        continue;
      }
      const headings = new Set<string>();
      for (const [caseIndex, item] of table.cases.entries()) {
        if (headings.has(item.heading) || ownedCases.has(item.invocationId)) {
          issue(
            'OVERLAPPING_TABLE',
            ['tables', index, 'cases', caseIndex],
            'A case heading and invocation belong to one table',
          );
        }
        headings.add(item.heading);
        ownedCases.add(item.invocationId);
        const invocation = invocations.get(item.invocationId);
        const section = sectionsById.get(item.sectionId);
        if (
          !invocation ||
          invocation.moduleId !== method.moduleId ||
          invocation.function !== method.function ||
          section?.metadata?.invocationId !== item.invocationId
        ) {
          issue(
            'CASE_SOURCE_MISMATCH',
            ['tables', index, 'cases', caseIndex],
            'Case invocation, section, and method source must agree',
          );
        }
      }
      const expectedCells = table.cases.flatMap((item) => [
        ...table.inputs.map((quantity) => ({
          invocationId: item.invocationId,
          quantity,
          role: 'input' as const,
        })),
        ...table.outputs.map((quantity) => ({
          invocationId: item.invocationId,
          quantity,
          role: 'output' as const,
        })),
      ]);
      if (table.cells.length !== expectedCells.length) {
        issue(
          'CELL_BINDING_MISMATCH',
          ['tables', index, 'cells'],
          'Every selected case quantity has one bound cell',
        );
      }
      for (const [cellIndex, cell] of table.cells.entries()) {
        const expected = expectedCells[cellIndex];
        const quantity = method.quantities.find(
          (item) =>
            item.role === cell.role && item.selectionName === cell.quantity,
        );
        const symbol = symbolsById.get(cell.symbolId);
        const parameter = execution.authoring?.parameters.find(
          (item) =>
            item.invocationId === cell.caseInvocationId &&
            item.parameterName === cell.quantity,
        );
        const output = execution.authoring?.outputs.find(
          (item) =>
            item.invocationId === cell.caseInvocationId &&
            item.name === cell.quantity,
        );
        const boundSymbolId =
          cell.role === 'input' ? parameter?.symbolId : output?.symbolId;
        if (
          !expected ||
          expected.invocationId !== cell.caseInvocationId ||
          expected.quantity !== cell.quantity ||
          expected.role !== cell.role ||
          !quantity ||
          quantity.unit !== cell.unit ||
          !symbol ||
          symbol.unit !== cell.unit ||
          boundSymbolId !== cell.symbolId
        ) {
          issue(
            'CELL_BINDING_MISMATCH',
            ['tables', index, 'cells', cellIndex, 'symbolId'],
            'Cell binding must resolve to the captured quantity',
            { symbolId: cell.symbolId },
          );
        }
      }
    }
  },
);

export const ExecutionResponseSchema = z
  .discriminatedUnion('ok', [
    z
      .object({
        protocolVersion: z.enum(['1', '2', '3']),
        ok: z.literal(true),
        diagnostics: z.array(DiagnosticSchema),
        execution: ExecutionPayloadSchema,
      })
      .strict(),
    z
      .object({
        protocolVersion: z.enum(['1', '2', '3']),
        ok: z.literal(false),
        diagnostics: z.array(DiagnosticSchema).min(1),
        provenance: ProvenanceSchema.optional(),
      })
      .strict(),
  ])
  .superRefine((response, ctx) => {
    if (!response.ok) {
      return;
    }
    const authoring = response.execution.authoring !== undefined;
    const comparison =
      (response.execution.methods?.length ?? 0) > 0 ||
      (response.execution.tables?.length ?? 0) > 0;
    if ((response.protocolVersion !== '1') !== authoring) {
      ctx.addIssue({
        code: 'custom',
        message: 'Protocol version must match authoring evidence',
        path: ['protocolVersion'],
      });
    }
    if ((response.protocolVersion === '3') !== comparison) {
      ctx.addIssue({
        code: 'custom',
        message: 'Protocol version must match comparison evidence',
        path: ['protocolVersion'],
        params: { diagnosticCode: 'INCOMPATIBLE_CONTRACT' },
      });
    }
    const modules = new Set(
      response.execution.sourceManifest.map((item) => item.moduleId),
    );
    const invocationIds = new Set(
      response.execution.invocations.map((invocation) => invocation.id),
    );
    const symbolOwners = new Map(
      response.execution.invocations.flatMap((invocation) =>
        invocation.symbols.map(
          (definition) =>
            [definition.symbolId, invocation.id] satisfies [string, string],
        ),
      ),
    );
    const symbols = new Map(
      collectCsoSymbols(response.execution.cso).map((symbol) => [
        symbol.id,
        symbol,
      ]),
    );
    for (const [index, diagnostic] of response.diagnostics.entries()) {
      const identityIssue = (
        field: string,
        diagnosticCode: string,
        message: string,
      ): void => {
        ctx.addIssue({
          code: 'custom',
          path: ['diagnostics', index, field],
          message,
          params: { diagnosticCode },
        });
      };
      if (
        diagnostic.invocationId !== undefined &&
        !invocationIds.has(diagnostic.invocationId)
      ) {
        identityIssue(
          'invocationId',
          'UNKNOWN_DIAGNOSTIC_INVOCATION',
          'Successful execution diagnostic invocation must resolve in the execution',
        );
      }
      if (diagnostic.symbolId !== undefined) {
        const symbol = symbols.get(diagnostic.symbolId);
        const owner = symbolOwners.get(diagnostic.symbolId);
        if (!symbol || owner === undefined) {
          identityIssue(
            'symbolId',
            'UNKNOWN_DIAGNOSTIC_SYMBOL',
            'Successful execution diagnostic symbol must resolve to a documented symbol',
          );
        } else {
          if (
            diagnostic.invocationId !== undefined &&
            diagnostic.invocationId !== owner
          ) {
            identityIssue(
              'invocationId',
              'DIAGNOSTIC_SYMBOL_INVOCATION_MISMATCH',
              'Successful execution diagnostic symbol must belong to its stated invocation',
            );
          }
          if (
            diagnostic.nodeKey !== undefined &&
            !symbol.valueTree.nodes.some(
              (node) => node.key === diagnostic.nodeKey,
            )
          ) {
            identityIssue(
              'nodeKey',
              'UNKNOWN_DIAGNOSTIC_NODE',
              'Successful execution diagnostic node must resolve in its stated symbol value tree',
            );
          }
        }
      }
      const spans = [
        ...(diagnostic.location
          ? [
              {
                value: diagnostic.location,
                path: ['diagnostics', index, 'location'],
              },
            ]
          : []),
        ...(diagnostic.relatedLocations ?? []).map((value, locationIndex) => ({
          value,
          path: ['diagnostics', index, 'relatedLocations', locationIndex],
        })),
        ...(diagnostic.callChain ?? []).map((value, locationIndex) => ({
          value,
          path: ['diagnostics', index, 'callChain', locationIndex],
        })),
      ];
      for (const { value, path } of spans) {
        if (!modules.has(value.moduleId)) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'moduleId'],
            message:
              'Successful execution diagnostic location must resolve in the source manifest',
            params: { diagnosticCode: 'UNKNOWN_DIAGNOSTIC_MODULE' },
          });
        }
      }
    }
  });

export type GivenSource = z.infer<typeof GivenSourceSchema>;
export type InputBinding = z.infer<typeof InputBindingSchema>;
export type SymbolObservation = z.infer<typeof SymbolObservationSchema>;
export type OperationObservation = z.infer<typeof OperationObservationSchema>;
export type ExecutionPayload = z.infer<typeof ExecutionPayloadSchema>;
export type ExecutionResponse = z.infer<typeof ExecutionResponseSchema>;
export type { Invocation, SymbolDefinition };

/** Preserve the complete input evidence whenever an execution is bound to an artifact. */
export const executionBindingFrom = (
  execution: ExecutionPayload,
): ExecutionBinding => ({
  entryModuleId: execution.entry.moduleId,
  entrySourceHash: execution.entry.sourceHash,
  sourceClosureHash: execution.sourceClosureHash,
  function: execution.entry.function,
  resolvedInputs: execution.entry.resolvedInputs,
  ...(execution.entry.resolvedInputKinds === undefined
    ? {}
    : {
        resolvedInputKinds: execution.entry.resolvedInputKinds,
      }),
});
