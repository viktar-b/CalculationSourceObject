import { z } from 'zod';
import { AuthoringEvidenceSchema } from './authoring.ts';
import { scopedGlyph } from './glyphs.ts';
import { CalculationSourceObjectSchema } from '../calculation-source/object-schema.ts';
import {
  AssetRecordSchema,
  DiagnosticSchema,
  HashSchema,
  ModuleIdSchema,
  NodeAddressSchema,
  NonemptyStringSchema,
  ProvenanceSchema,
  PythonIdentifierSchema,
  ResolvedInputsSchema,
  SourceManifestSchema,
  SourceSpanSchema,
  SupportedNumberSchema,
  VersionsSchema,
  collectCsoSymbols,
  namespacedId,
  sourceClosureHash,
} from './common.ts';

const invalidUnicodePattern = /[\uD800-\uDFFF]/u;
const IdentityStringSchema = NonemptyStringSchema.refine(
  (value) => !invalidUnicodePattern.test(value),
  {
    message: 'Identity must contain Unicode scalar values',
    params: { diagnosticCode: 'INVALID_UNICODE' },
  },
);
const ParameterNameSchema = PythonIdentifierSchema;
const LiteralSourceSchema = z
  .object({
    value: SupportedNumberSchema,
    location: SourceSpanSchema,
  })
  .strict();

export const GivenSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('parameter'),
      parameterName: ParameterNameSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal('literal'), ...LiteralSourceSchema.shape })
    .strict(),
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
const EntrySuppliedBindingSchema = z
  .object({
    ...bindingIdentity,
    kind: z.literal('entrySupplied'),
    value: SupportedNumberSchema,
  })
  .strict();
const ParsedDefaultBindingSchema = z
  .object({
    ...bindingIdentity,
    kind: z.literal('parsedDefault'),
    value: SupportedNumberSchema,
    defaultLocation: SourceSpanSchema,
  })
  .strict();
const CallerLiteralBindingSchema = z
  .object({
    ...bindingIdentity,
    kind: z.literal('callerLiteral'),
    value: SupportedNumberSchema,
    callerLocation: SourceSpanSchema,
  })
  .strict();
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
  resolvedInputs: ResolvedInputsSchema,
  symbols: z.array(SymbolDefinitionSchema),
};
const RootInvocationSchema = z
  .object({
    ...invocationFields,
    id: z.literal('root'),
    inputBindings: z.array(
      z.discriminatedUnion('kind', [
        EntrySuppliedBindingSchema,
        ParsedDefaultBindingSchema,
      ]),
    ),
  })
  .strict();
const ChildInvocationSchema = z
  .object({
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
  })
  .strict();
export const InvocationSchema = z.union([
  RootInvocationSchema,
  ChildInvocationSchema,
]);
export const SymbolObservationSchema = z
  .object({
    symbolId: IdentityStringSchema,
    invocationId: IdentityStringSchema,
    kind: z.enum(['input', 'constant', 'formula', 'unsupported']),
    value: SupportedNumberSchema,
    definitionLocation: SourceSpanSchema,
  })
  .strict();
export const OperationObservationSchema = z
  .object({
    address: NodeAddressSchema,
    invocationId: IdentityStringSchema,
    value: SupportedNumberSchema,
    location: SourceSpanSchema,
  })
  .strict();

const ExecutionPayloadBaseSchema = z
  .object({
    cso: CalculationSourceObjectSchema,
    authoring: AuthoringEvidenceSchema.optional(),
    entry: z
      .object({
        moduleId: ModuleIdSchema,
        function: PythonIdentifierSchema,
        sourceHash: HashSchema,
        invocationId: z.literal('root'),
        resolvedInputs: ResolvedInputsSchema,
      })
      .strict(),
    sourceManifest: SourceManifestSchema,
    sourceClosureHash: HashSchema,
    invocations: z.array(InvocationSchema).min(1),
    observations: z.array(SymbolObservationSchema),
    operationObservations: z.array(OperationObservationSchema).optional(),
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
    ([name, value]) => Object.hasOwn(right, name) && Object.is(right[name], value),
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
      z.enum(['symbol', 'section', 'text', 'figure']),
      IdentityStringSchema,
      IdentityStringSchema,
    ]);
    const checkNamespace = (
      id: string,
      kind: 'symbol' | 'section' | 'text' | 'figure',
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
          !Number.isInteger(owner.resolvedInputs[parameter.parameterName])
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
  },
);

export const ExecutionResponseSchema = z
  .discriminatedUnion('ok', [
    z
      .object({
        protocolVersion: z.enum(['1', '2']),
        ok: z.literal(true),
        diagnostics: z.array(DiagnosticSchema),
        execution: ExecutionPayloadSchema,
      })
      .strict(),
    z
      .object({
        protocolVersion: z.enum(['1', '2']),
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
    if (
      (response.protocolVersion === '2') !==
      (response.execution.authoring !== undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Protocol version must match authoring evidence',
        path: ['protocolVersion'],
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
