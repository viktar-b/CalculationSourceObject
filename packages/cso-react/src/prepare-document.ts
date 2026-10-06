import {
  AssetRecordSchema,
  BoundPreparedDocumentSchema,
  type CalculationSourceObject,
  CalculationSourceObjectSchema,
  type CalculationSourceSectionItem,
  contractIssuesToDiagnostics,
  type Diagnostic,
  deriveApplicability,
  type ExecutionPayload,
  ExecutionPayloadSchema,
  executionBindingFrom,
  type HistoricalReview,
  HistoricalReviewSchema,
  type LegacyAssetManifest,
  LegacyAssetManifestSchema,
  type PreparedDocument,
  type PreparedDocumentItem,
  PreparedDocumentItemSchema,
  PreparedDocumentSchema,
  PreparedDocumentSectionSchema,
  type PreparedMethodContent,
  type PreparedMethodHelper,
  type ResolvedAsset,
  ResolvedAssetSchema,
} from '@cs-object/core';

import { activeSymbolIds } from './active-symbols.ts';
import { prepareDocumentContext } from './prepare-context.ts';

export class DocumentPreparationError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
    this.name = 'DocumentPreparationError';
    this.diagnostics = diagnostics;
  }
}

function fail(code: string, message: string): never {
  throw new DocumentPreparationError([{ code, message, stage: 'document' }]);
}

const pointerKey = (key: string) =>
  key.replaceAll('~', '~0').replaceAll('/', '~1');
const assertDocumentJson = (
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): void => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (
    typeof value !== 'object' ||
    value === null ||
    ancestors.has(value) ||
    (!Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).some((key) =>
      Object.prototype.propertyIsEnumerable.call(value, key),
    )
  ) {
    fail(
      'NON_JSON_DOCUMENT_FIELD',
      `Document field '${path}' must contain finite JSON values without cycles or custom objects`,
    );
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length)
      fail(
        'NON_JSON_DOCUMENT_FIELD',
        `Document array '${path}' must be dense and contain only indexed values`,
      );
    for (let index = 0; index < value.length; index++)
      assertDocumentJson(value[index], `${path}/${index}`, ancestors);
  } else {
    for (const [key, entry] of Object.entries(value))
      assertDocumentJson(entry, `${path}/${pointerKey(key)}`, ancestors);
  }
  ancestors.delete(value);
};

// A preserved entity's catchall copy can omit own prototype-looking keys.
// Restore only content records from the original input after structural validation.
const restoreContentFields = (
  cso: CalculationSourceObject,
  original: CalculationSourceObject,
): CalculationSourceObject => ({
  ...cso,
  sections: cso.sections.map((section, sectionIndex) => ({
    ...section,
    items: section.items.map((item, index) => {
      const raw = original.sections[sectionIndex]?.items[index];
      if (item.kind === 'text' && raw?.kind === 'text')
        return { ...item, text: { ...item.text, ...raw.text } };
      if (item.kind === 'figure' && raw?.kind === 'figure')
        return { ...item, figure: { ...item.figure, ...raw.figure } };
      return item;
    }),
  })),
});

type Issues = Parameters<typeof contractIssuesToDiagnostics>[0];
type ContentParser<T> = {
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: Issues } };
};
const parseContent = <T>(schema: ContentParser<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new DocumentPreparationError(
      contractIssuesToDiagnostics(parsed.error.issues).map((diagnostic) => ({
        ...diagnostic,
        stage: 'document',
      })),
    );
  }
  return parsed.data;
};
const parseHistoricalReview = (value: unknown): HistoricalReview => {
  assertDocumentJson(value, '/historicalReview');
  return parseContent(HistoricalReviewSchema, value);
};
const parseDocument = (candidate: unknown): PreparedDocument =>
  parseContent(PreparedDocumentSchema, candidate);

const reachableSections = (cso: CalculationSourceObject) => {
  const sections = new Map(
    cso.sections.map((section) => [section.id, section]),
  );
  const visited = new Set<string>();
  const ordered: CalculationSourceObject['sections'] = [];
  const visit = (id: string) => {
    if (visited.has(id)) {
      fail(
        'DUPLICATE_SECTION_PLACEMENT',
        `Section '${id}' is repeated or recursive`,
      );
    }
    const section = sections.get(id);
    if (!section) {
      return fail('UNRESOLVED_DOCUMENT_SECTION', `Section '${id}' is missing`);
    }
    visited.add(id);
    ordered.push(section);
    for (const item of section.items) {
      if (item.kind === 'section') {
        visit(item.id);
      }
    }
  };
  for (const id of cso.rootSectionIds) {
    visit(id);
  }
  return ordered;
};

const symbolDefinitions = (cso: CalculationSourceObject) => [
  ...cso.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.kind === 'symbol' ? [item.symbol] : [],
    ),
  ),
  ...(cso.detachedItems ?? []).flatMap((item) =>
    item.kind === 'symbol' ? [item.symbol] : [],
  ),
];

// Validate the original extension values before schema copies can erase array
// properties or catchall keys. Structural validation remains owned by core.
const assertExtensionFields = (cso: CalculationSourceObject): void => {
  const fields = (record: object, names: readonly string[], path: string) => {
    for (const [key, value] of Object.entries(record)) {
      if (names.includes(key))
        assertDocumentJson(value, `${path}/${pointerKey(key)}`);
    }
  };
  fields(cso.source, ['metadata'], '/source');
  if (cso.source.origin)
    fields(cso.source.origin, ['metadata'], '/source/origin');
  const contentFields = (
    item:
      | CalculationSourceSectionItem
      | NonNullable<CalculationSourceObject['detachedItems']>[number],
    path: string,
  ) => {
    fields(item, ['metadata'], path);
    if (item.kind === 'text' || item.kind === 'figure') {
      const content = item.kind === 'text' ? item.text : item.figure;
      if (content) assertDocumentJson(content, `${path}/${item.kind}`);
    }
  };
  cso.sections.forEach((section, index) => {
    const path = `/sections/${index}`;
    fields(section, ['metadata'], path);
    section.items.forEach((item, itemIndex) => {
      const itemPath = `${path}/items/${itemIndex}`;
      contentFields(item, itemPath);
    });
  });
  cso.detachedItems?.forEach((item, index) => {
    contentFields(item, `/detachedItems/${index}`);
  });
  symbolDefinitions(cso).forEach((symbol, index) => {
    const path = `/definitions/${index}`;
    fields(symbol, ['aliases', 'metadata'], path);
    fields(symbol.valueTree, ['metadata'], `${path}/valueTree`);
    symbol.valueTree.nodes.forEach((node, nodeIndex) => {
      fields(
        node,
        ['metadata', 'tags'],
        `${path}/valueTree/nodes/${nodeIndex}`,
      );
    });
  });
};

const placementId = (sectionId: string, index: number | 'heading') =>
  JSON.stringify([sectionId, index]);

const itemFields = (item: CalculationSourceSectionItem) => {
  if (item.kind === 'text') {
    return {
      kind: item.kind,
      id: item.id,
      text: { content: item.text?.content },
    };
  }
  if (item.kind === 'figure') {
    return {
      kind: item.kind,
      id: item.id,
      figure: {
        assetId: item.figure?.assetId,
        caption: item.figure?.caption,
        alt: item.figure?.alt,
        width: item.figure?.width,
      },
    };
  }
  const { metadata: _, ...fields } = item;
  return {
    ...fields,
    ...(item.kind === 'symbol' || item.kind === 'symbolRef'
      ? { operands: [] }
      : {}),
  };
};

const retainedMetadata = (
  metadata: Record<string, unknown> | undefined,
  executionContext: boolean,
) => {
  if (!metadata || !executionContext || Object.keys(metadata).length === 0)
    return metadata;
  const authored = Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) => !['localId', 'invocationId', 'location'].includes(key),
    ),
  );
  return Object.keys(authored).length > 0 ? authored : undefined;
};

const symbolMetadataHistory = (
  cso: CalculationSourceObject,
  executionContext = false,
) => {
  const definitions = symbolDefinitions(cso);
  const definitionsById = new Map(
    definitions.map((symbol) => [symbol.id, symbol]),
  );
  const placedSymbolIds = new Set(
    reachableSections(cso).flatMap((section) =>
      section.items.flatMap((item) =>
        item.kind === 'symbol'
          ? [item.symbol.id]
          : item.kind === 'symbolRef'
            ? [item.id]
            : [],
      ),
    ),
  );
  const reachableSymbolIds = activeSymbolIds(placedSymbolIds, definitionsById);
  const historicalDefinitions = definitions.flatMap((symbol) => {
    if (!reachableSymbolIds.has(symbol.id)) return [];
    const metadata = retainedMetadata(symbol.metadata, executionContext);
    const additionalFields = Object.fromEntries(
      Object.entries(symbol).filter(
        ([key, value]) =>
          (['glyphPlaintext', 'aliases'].includes(key) ||
            (['description', 'unit', 'comment'].includes(key) &&
              (!placedSymbolIds.has(symbol.id) || value === ''))) &&
          value !== undefined,
      ),
    );
    const treeMetadata = retainedMetadata(
      symbol.valueTree.metadata,
      executionContext,
    );
    const nodesByKey = new Map(
      symbol.valueTree.nodes.map((node) => [node.key, node]),
    );
    const active = new Set<string>();
    const pending = [symbol.valueTree.rootKey];
    while (pending.length > 0) {
      const key = pending.pop();
      if (key === undefined || active.has(key)) continue;
      active.add(key);
      const node = nodesByKey.get(key);
      if (node?.mode === 'FUNCTION')
        pending.push(...(node.funcArgs ?? []).map((arg) => arg.key));
    }
    const nodes = symbol.valueTree.nodes.flatMap((node) => {
      if (!active.has(node.key)) return [];
      const nodeMetadata = retainedMetadata(node.metadata, executionContext);
      const context = {
        ...(node.draft !== undefined ? { draft: node.draft } : {}),
        ...(node.tags !== undefined ? { tags: node.tags } : {}),
        ...(nodeMetadata !== undefined ? { metadata: nodeMetadata } : {}),
      };
      return Object.keys(context).length > 0
        ? [{ key: node.key, ...context }]
        : [];
    });
    const valueTree = {
      ...(treeMetadata !== undefined ? { metadata: treeMetadata } : {}),
      ...(nodes.length > 0 ? { nodes } : {}),
    };
    const context = {
      ...(metadata !== undefined ? { metadata } : {}),
      ...(Object.keys(additionalFields).length > 0 ? { additionalFields } : {}),
      ...(Object.keys(valueTree).length > 0 ? { valueTree } : {}),
    };
    return Object.keys(context).length > 0
      ? [{ id: symbol.id, glyph: symbol.glyph, ...context }]
      : [];
  });
  const symbolHistory = historicalDefinitions.filter((symbol) =>
    placedSymbolIds.has(symbol.id),
  );
  const referencedSymbolHistory = historicalDefinitions.filter(
    (symbol) => !placedSymbolIds.has(symbol.id),
  );
  return { definitions, symbolHistory, referencedSymbolHistory };
};

const consumedContentFields = (
  item: CalculationSourceSectionItem,
  executionContext: boolean,
): readonly string[] => {
  if (item.kind === 'text') return ['content', 'metadata'];
  if (executionContext)
    return ['assetId', 'caption', 'alt', 'width', 'metadata'];
  return ['originalUrl', 'width', 'metadata'];
};

const retainItemContextSource = (
  item: CalculationSourceSectionItem,
  executionContext = false,
) => {
  const metadata = retainedMetadata(item.metadata, executionContext);
  const content =
    item.kind === 'text'
      ? item.text
      : item.kind === 'figure'
        ? item.figure
        : undefined;
  const hasContentMetadata =
    content !== undefined && Object.hasOwn(content, 'metadata');
  const consumed = consumedContentFields(item, executionContext);
  const additionalFields = content
    ? Object.fromEntries(
        Object.entries(content).filter(([key]) => !consumed.includes(key)),
      )
    : {};
  if (
    metadata === undefined &&
    !hasContentMetadata &&
    Object.keys(additionalFields).length === 0
  ) {
    return undefined;
  }
  return {
    ...(metadata !== undefined ? { metadata } : {}),
    ...(hasContentMetadata ? { contentMetadata: content?.metadata } : {}),
    ...(Object.keys(additionalFields).length > 0 ? { additionalFields } : {}),
  };
};
const itemMetadataHistory = (
  cso: CalculationSourceObject,
  executionContext = false,
) =>
  reachableSections(cso).flatMap((section) =>
    section.items.flatMap((item, index) => {
      const contextSource = retainItemContextSource(item, executionContext);
      return contextSource
        ? [
            {
              id: item.kind === 'symbol' ? item.symbol.id : item.id,
              kind: item.kind,
              sourcePlacementId: placementId(section.id, index),
              ...contextSource,
            },
          ]
        : [];
    }),
  );

const resolveExecutionPlacementProvenance = (
  execution: ExecutionPayload,
  item: CalculationSourceSectionItem,
) => {
  const symbolId =
    item.kind === 'symbol'
      ? item.symbol.id
      : item.kind === 'symbolRef'
        ? item.id
        : undefined;
  const definition = execution.invocations
    .flatMap((invocation) => invocation.symbols)
    .find((symbol) => symbol.symbolId === symbolId);
  const targetSection =
    item.kind === 'section'
      ? execution.cso.sections.find((target) => target.id === item.id)
      : undefined;
  const targetInvocation =
    targetSection &&
    execution.invocations.find(
      (invocation) => invocation.id === targetSection.metadata?.invocationId,
    );
  const metadata =
    item.metadata ??
    (item.kind === 'symbol' ? item.symbol.metadata : undefined);
  const definitionInvocation =
    definition &&
    execution.invocations.find((invocation) =>
      invocation.symbols.includes(definition),
    );
  const targetCallSite =
    targetInvocation && 'callSite' in targetInvocation
      ? targetInvocation.callSite
      : undefined;
  const definitionLocation =
    item.kind === 'symbol' ? definition?.definitionLocation : undefined;
  // Identity follows the target; location follows the authored placement.
  // A symbol reference must not inherit its definition's location.
  return {
    localId:
      targetSection?.metadata?.localId ??
      definition?.localId ??
      metadata?.localId,
    invocationId:
      targetSection?.metadata?.invocationId ??
      definitionInvocation?.id ??
      metadata?.invocationId,
    location: metadata?.location ?? targetCallSite ?? definitionLocation,
  };
};

const applicabilityField = (reasons: readonly string[] | undefined) =>
  reasons && reasons.length > 0
    ? {
        applicability: {
          state: 'not-applicable' as const,
          reasons: [...reasons],
        },
      }
    : {};

const sectionChecks = (execution: ExecutionPayload, invocationId: unknown) => {
  if (typeof invocationId !== 'string') return {};
  const derived = deriveApplicability(execution);
  type CheckPlan = {
    id: string;
    checks?: readonly {
      id: string;
      explanation: string;
      predicateText: string;
    }[];
    helpers: readonly CheckPlan[];
  };
  const plans = (execution.methods ?? []).flatMap(function walk(
    plan: CheckPlan,
  ): CheckPlan[] {
    return [plan, ...plan.helpers.flatMap(walk)];
  });
  const engineeringChecks = plans.flatMap((plan) =>
    (plan.checks ?? []).flatMap((check) => {
      const outcome = (execution.checkOutcomes ?? []).find(
        (item) =>
          item.methodId === plan.id &&
          item.invocationId === invocationId &&
          item.checkId === check.id,
      );
      return outcome
        ? [
            {
              id: check.id,
              explanation: check.explanation,
              predicateText: check.predicateText,
              value: outcome.value,
              ...(() => {
                const reasons = derived.reasonsByCheck.get(
                  `${invocationId}|${check.id}`,
                );
                return reasons ? { reasons: [...reasons] } : {};
              })(),
            },
          ]
        : [];
    }),
  );
  return engineeringChecks.length > 0 ? { engineeringChecks } : {};
};

const groupedInvocationIds = (execution: ExecutionPayload): Set<string> =>
  new Set(
    (execution.tables ?? []).flatMap((table) =>
      table.cases.map((item) => item.invocationId),
    ),
  );

const replacesInvocation = (
  invocationId: string | undefined,
  grouped: ReadonlySet<string>,
): boolean =>
  invocationId !== undefined &&
  [...grouped].some(
    (id) => invocationId === id || invocationId.startsWith(`${id}/`),
  );

const presentedCell = (
  execution: ExecutionPayload,
  cell: NonNullable<ExecutionPayload['tables']>[number]['cells'][number],
) => {
  if (cell.role === 'input') {
    const invocation = execution.invocations.find(
      (item) => item.id === cell.caseInvocationId,
    );
    const value = invocation?.resolvedInputs[cell.quantity];
    const numericKind = invocation?.resolvedInputKinds?.[cell.quantity];
    if (
      value === undefined ||
      (numericKind !== 'int' && numericKind !== 'float')
    ) {
      fail('CELL_BINDING_MISMATCH', `Missing input '${cell.quantity}'`);
    }
    return {
      heading: cell.heading,
      invocationId: cell.caseInvocationId,
      symbolId: cell.symbolId,
      value,
      numericKind: numericKind as 'int' | 'float',
      ...applicabilityField(
        deriveApplicability(execution).reasonsBySymbolId.get(cell.symbolId),
      ),
    };
  }
  const output = execution.authoring?.outputs.find(
    (item) =>
      item.invocationId === cell.caseInvocationId &&
      item.name === cell.quantity &&
      item.symbolId === cell.symbolId,
  );
  if (
    !output ||
    (output.numericKind !== 'int' && output.numericKind !== 'float')
  ) {
    fail('CELL_BINDING_MISMATCH', `Missing output '${cell.quantity}'`);
  }
  return {
    heading: cell.heading,
    invocationId: cell.caseInvocationId,
    symbolId: cell.symbolId,
    value: output.value,
    numericKind: output.numericKind as 'int' | 'float',
    ...applicabilityField(
      deriveApplicability(execution).reasonsBySymbolId.get(cell.symbolId),
    ),
  };
};

type MethodRecord = NonNullable<ExecutionPayload['methods']>[number];

const presentMethodContent = (
  quantities: MethodRecord['quantities'],
  content: MethodRecord['content'],
  checks: NonNullable<MethodRecord['checks']> = [],
  applicability: NonNullable<MethodRecord['applicability']> = [],
): PreparedMethodContent[] =>
  content.map((item) => {
    if (item.kind === 'check' || item.kind === 'applicability') {
      const declared = (item.kind === 'check' ? checks : applicability).find(
        (candidate) => candidate.id === item.localId,
      );
      if (!declared) {
        fail('UNKNOWN_QUANTITY', `Condition '${item.localId}' is missing`);
      }
      return {
        kind: item.kind,
        localId: item.localId,
        explanation: declared.explanation,
        predicateText: declared.predicateText,
      };
    }
    if (item.kind === 'quantity') {
      const quantity = quantities.find(
        (candidate) => candidate.variableName === item.variableName,
      );
      if (!quantity) {
        fail('UNKNOWN_QUANTITY', `Quantity '${item.variableName}' is missing`);
      }
      return {
        kind: 'quantity',
        selectionName: quantity.selectionName,
        role: quantity.role,
        glyph: quantity.glyph,
        description: quantity.description,
        unit: quantity.unit,
        formulaText: quantity.formulaText,
      };
    }
    if (item.kind === 'section') {
      return {
        kind: 'section',
        localId: item.localId,
        title: item.title,
        content: presentMethodContent(
          quantities,
          item.content,
          checks,
          applicability,
        ),
      };
    }
    return item;
  });

const presentMethodHelpers = (
  helpers: MethodRecord['helpers'],
): PreparedMethodHelper[] =>
  helpers.map((helper) => ({
    id: helper.id,
    function: helper.function,
    content: presentMethodContent(
      helper.quantities,
      helper.content,
      helper.checks ?? [],
      helper.applicability ?? [],
    ),
    helpers: presentMethodHelpers(helper.helpers),
  }));

const presentedBranchNotes = (
  execution: ExecutionPayload,
  table: NonNullable<ExecutionPayload['tables']>[number],
) => {
  const outcomes = (execution.branchOutcomes ?? []).filter((outcome) =>
    table.cases.some((item) => item.invocationId === outcome.invocationId),
  );
  const labels = new Map<string, string[]>();
  const groupKey = (outcome: (typeof outcomes)[number]) => {
    const invocation = execution.invocations.find(
      (item) => item.id === outcome.invocationId,
    );
    const variable = invocation?.symbols.find(
      (item) => item.symbolId === outcome.symbolId,
    )?.variableName;
    return `${variable ?? ''}|${outcome.nodeKey}`;
  };
  for (const outcome of outcomes) {
    const key = groupKey(outcome);
    labels.set(key, [...(labels.get(key) ?? []), outcome.label]);
  }
  return table.cases.flatMap((caseItem) =>
    outcomes
      .filter((outcome) => outcome.invocationId === caseItem.invocationId)
      .filter((outcome) => new Set(labels.get(groupKey(outcome))).size > 1)
      .map((outcome) => ({
        heading: caseItem.heading,
        invocationId: caseItem.invocationId,
        symbolId: outcome.symbolId,
        nodeKey: outcome.nodeKey,
        label: outcome.label,
      })),
  );
};

const comparisonPlacement = (
  execution: ExecutionPayload,
  item: CalculationSourceSectionItem,
  sectionId: string,
  index: number,
): PreparedDocumentItem => {
  if (item.kind !== 'method' && item.kind !== 'table') {
    fail('UNKNOWN_METHOD', 'Expected a method or table placement');
  }
  const provenance = resolveExecutionPlacementProvenance(execution, item);
  const placement = {
    context: [] as PreparedDocumentItem['context'],
    sourcePlacementId: placementId(sectionId, index),
    ...(typeof provenance.localId === 'string'
      ? { localId: provenance.localId }
      : {}),
    ...(typeof provenance.invocationId === 'string'
      ? { invocationId: provenance.invocationId }
      : {}),
    ...(provenance.location
      ? { location: provenance.location as PreparedDocumentItem['location'] }
      : {}),
  };
  if (item.kind === 'method') {
    const method = execution.methods?.find((record) => record.id === item.id);
    if (!method) fail('UNKNOWN_METHOD', `Method '${item.id}' is missing`);
    const quantities = method.quantities.map((quantity) => ({
      selectionName: quantity.selectionName,
      role: quantity.role,
      glyph: quantity.glyph,
      description: quantity.description,
      unit: quantity.unit,
      formulaText: quantity.formulaText,
    }));
    return {
      kind: 'method',
      id: item.id,
      title: method.title,
      quantities,
      content: presentMethodContent(
        method.quantities,
        method.content,
        method.checks ?? [],
        method.applicability ?? [],
      ),
      helpers: presentMethodHelpers(method.helpers),
      ...placement,
    };
  }
  const table = execution.tables?.find((record) => record.id === item.id);
  if (!table) fail('UNKNOWN_METHOD', `Table '${item.id}' is missing`);
  const method = execution.methods?.find(
    (record) => record.id === table.methodId,
  );
  if (!method) fail('UNKNOWN_METHOD', `Method '${table.methodId}' is missing`);
  const rows = (role: 'input' | 'output', names: readonly string[]) =>
    names.map((name) => {
      const quantity = method.quantities.find(
        (candidate) =>
          candidate.role === role && candidate.selectionName === name,
      );
      if (!quantity) {
        fail(
          'UNKNOWN_QUANTITY',
          `Quantity '${name}' is missing from the method`,
        );
      }
      return {
        quantity: name,
        role,
        glyph: quantity.glyph,
        description: quantity.description,
        unit: quantity.unit,
        cells: table.cases.map((caseItem) => {
          const cell = table.cells.find(
            (candidate) =>
              candidate.caseInvocationId === caseItem.invocationId &&
              candidate.quantity === name &&
              candidate.role === role,
          );
          if (!cell) {
            fail('CELL_BINDING_MISMATCH', `Missing cell for '${name}'`);
          }
          return presentedCell(execution, cell);
        }),
      };
    });
  const branchNotes = presentedBranchNotes(execution, table);
  const engineeringChecks = (method.checks ?? []).flatMap((check) => {
    const results = table.cases.flatMap((caseItem) => {
      const outcome = (execution.checkOutcomes ?? []).find(
        (item) =>
          item.methodId === method.id &&
          item.invocationId === caseItem.invocationId &&
          item.checkId === check.id,
      );
      return outcome
        ? [
            {
              heading: caseItem.heading,
              invocationId: caseItem.invocationId,
              value: outcome.value,
              ...(() => {
                const reasons = deriveApplicability(
                  execution,
                ).reasonsByCheck.get(`${caseItem.invocationId}|${check.id}`);
                return reasons ? { reasons: [...reasons] } : {};
              })(),
            },
          ]
        : [];
    });
    return results.length > 0
      ? [
          {
            id: check.id,
            explanation: check.explanation,
            predicateText: check.predicateText,
            results,
          },
        ]
      : [];
  });
  const applicabilityPlans = [
    method,
    ...method.helpers.flatMap(function walk(
      helper: (typeof method.helpers)[number],
    ): (typeof method.helpers)[number][] {
      return [helper, ...helper.helpers.flatMap(walk)];
    }),
  ];
  const applicabilityNotes = applicabilityPlans.flatMap((plan) =>
    (plan.applicability ?? []).flatMap((condition) => {
      const results = table.cases.flatMap((caseItem) =>
        (execution.applicabilityOutcomes ?? [])
          .filter(
            (item) =>
              item.methodId === plan.id &&
              item.applicabilityId === condition.id &&
              (item.invocationId === caseItem.invocationId ||
                item.invocationId.startsWith(`${caseItem.invocationId}/`)),
          )
          .map((outcome) => ({
            heading: caseItem.heading,
            invocationId: outcome.invocationId,
            value: outcome.value,
            ...(outcome.value ? {} : { reasons: [condition.explanation] }),
          })),
      );
      return results.length > 0
        ? [
            {
              id: condition.id,
              explanation: condition.explanation,
              predicateText: condition.predicateText,
              results,
            },
          ]
        : [];
    }),
  );
  return {
    kind: 'table',
    id: item.id,
    title: table.title,
    casesAxis: table.casesAxis,
    ...(table.columnCap ? { columnCap: table.columnCap } : {}),
    ...(branchNotes.length > 0 ? { branchNotes } : {}),
    ...(engineeringChecks.length > 0 ? { engineeringChecks } : {}),
    ...(applicabilityNotes.length > 0 ? { applicabilityNotes } : {}),
    cases: table.cases.map(({ heading, invocationId }) => ({
      heading,
      invocationId,
    })),
    groups: [
      ...(table.inputs.length > 0
        ? [
            {
              role: 'input' as const,
              label: 'Inputs' as const,
              rows: rows('input', table.inputs),
            },
          ]
        : []),
      ...(table.outputs.length > 0
        ? [
            {
              role: 'output' as const,
              label: 'Outputs' as const,
              rows: rows('output', table.outputs),
            },
          ]
        : []),
    ],
    ...(table.cases.length === 0
      ? { emptyState: 'No cases evaluated' as const }
      : {}),
    replacedSections: table.cases.map((caseItem) => caseItem.sectionId),
    ...placement,
  };
};

export interface PrepareExecutionDocumentOptions {
  readonly execution: ExecutionPayload;
  readonly assets: readonly ResolvedAsset[];
  readonly historicalReviews?: readonly HistoricalReview[];
}

/** Pure preparation. The caller captures and validates media bytes before this call. */
export const prepareExecutionDocument = (
  options: PrepareExecutionDocumentOptions,
): PreparedDocument => {
  const execution = parseContent(ExecutionPayloadSchema, options.execution);
  assertExtensionFields(options.execution.cso);
  for (const review of options.historicalReviews ?? [])
    assertDocumentJson(review, '/historicalReview');
  const cso = restoreContentFields(execution.cso, options.execution.cso);
  if (Object.hasOwn(cso.source, 'metadata'))
    assertDocumentJson(cso.source.metadata, '/source/metadata');
  const assets = options.assets.map((asset) =>
    parseContent(ResolvedAssetSchema, asset),
  );
  for (const resolved of assets) {
    const declared = execution.assets.find(
      (asset) => asset.id === resolved.asset.id,
    );
    if (
      !declared ||
      JSON.stringify(AssetRecordSchema.parse(declared)) !==
        JSON.stringify(resolved.asset)
    ) {
      fail(
        'DOCUMENT_ASSET_BINDING_MISMATCH',
        `Captured asset '${resolved.asset.id}' differs from the execution asset record`,
      );
    }
  }
  const grouped = groupedInvocationIds(execution);
  const sectionsById = new Map(
    cso.sections.map((section) => [section.id, section]),
  );
  const replaced = (section: (typeof cso.sections)[number]): boolean =>
    replacesInvocation(
      typeof section.metadata?.invocationId === 'string'
        ? section.metadata.invocationId
        : undefined,
      grouped,
    );
  const sections = reachableSections(cso)
    .filter((section) => !replaced(section))
    .map((section) => ({
      id: section.id,
      title: section.title,
      sourcePlacementId: placementId(section.id, 'heading'),
      context: [],
      localId: section.metadata?.localId,
      invocationId: section.metadata?.invocationId,
      location: section.metadata?.location,
      metadata: retainedMetadata(section.metadata, true),
      ...sectionChecks(execution, section.metadata?.invocationId),
      items: section.items.flatMap((item, index) => {
        if (item.kind === 'section') {
          const target = sectionsById.get(item.id);
          if (target && replaced(target)) return [];
        }
        if (item.kind === 'method' || item.kind === 'table') {
          return [comparisonPlacement(execution, item, section.id, index)];
        }
        return [
          {
            ...itemFields(item),
            ...applicabilityField(
              item.kind === 'symbol' || item.kind === 'symbolRef'
                ? deriveApplicability(execution).reasonsBySymbolId.get(
                    item.kind === 'symbol' ? item.symbol.id : item.id,
                  )
                : undefined,
            ),
            context: [],
            contextSource: retainItemContextSource(item, true),
            sourcePlacementId: placementId(section.id, index),
            ...resolveExecutionPlacementProvenance(execution, item),
          } as PreparedDocumentItem,
        ];
      }),
    }));
  const displayed = new Set(
    sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.kind === 'symbol' ? [item.symbol.id] : [],
      ),
    ),
  );
  const { definitions, symbolHistory, referencedSymbolHistory } =
    symbolMetadataHistory(cso, true);
  const itemHistory = itemMetadataHistory(cso, true);
  const contentHistory = itemHistory.filter(
    (item) => item.kind === 'text' || item.kind === 'figure',
  );
  const placementHistory = itemHistory.filter(
    (item) => item.kind !== 'text' && item.kind !== 'figure',
  );
  const { metadata: _sourceMetadata, ...sourceProvenance } = cso.source;
  const document = parseDocument({
    documentVersion: sections.some((section) =>
      section.items.some(
        (item) => item.kind === 'method' || item.kind === 'table',
      ),
    )
      ? '3'
      : '2',
    context: [],
    source: {
      kind: 'execution',
      ...executionBindingFrom(execution),
    },
    sourceMetadata: cso.source.metadata,
    title: cso.title,
    rootSectionIds: cso.rootSectionIds,
    sections,
    detachedSymbols: definitions.filter((symbol) => !displayed.has(symbol.id)),
    assets,
    historicalReviews: [
      parseHistoricalReview({
        scope: 'historical',
        originalSource: {
          id: execution.entry.moduleId,
          sha256: execution.entry.sourceHash,
          format: 'CalculationSourceObject execution',
        },
        attribution:
          'Source provenance and authored metadata from the captured source. Review fields are historical and do not approve this execution or rendering.',
        originalFields: {
          source: sourceProvenance,
          ...(() => {
            const sections = reachableSections(cso).flatMap((section) => {
              const metadata = retainedMetadata(section.metadata, true);
              return metadata !== undefined
                ? [{ id: section.id, title: section.title, metadata }]
                : [];
            });
            return sections.length > 0 ? { sections } : {};
          })(),
          ...(symbolHistory.length > 0 ? { symbols: symbolHistory } : {}),
          ...(referencedSymbolHistory.length > 0
            ? { referencedSymbols: referencedSymbolHistory }
            : {}),
          ...(contentHistory.length > 0 ? { content: contentHistory } : {}),
          ...(placementHistory.length > 0
            ? { placements: placementHistory }
            : {}),
        },
      }),
      ...(options.historicalReviews ?? []),
    ],
  });
  return parseContent(BoundPreparedDocumentSchema, {
    execution,
    document: prepareDocumentContext(document),
  }).document;
};

export interface PrepareLegacyDocumentOptions {
  readonly cso: CalculationSourceObject;
  readonly fixtureId: string;
  readonly fixtureSha256: string;
  readonly assets: readonly ResolvedAsset[];
  readonly manifest: LegacyAssetManifest;
  readonly historicalReviews?: readonly HistoricalReview[];
}

const legacyFigure = (
  options: PrepareLegacyDocumentOptions,
  manifest: LegacyAssetManifest,
  item: Extract<CalculationSourceSectionItem, { kind: 'figure' }>,
  sourcePlacementId: string,
): PreparedDocumentItem => {
  const entry = manifest.entries.find(
    (entry) =>
      entry.originalFixtureSha256 === options.fixtureSha256 &&
      entry.figureId === item.id,
  );
  if (!entry) {
    return fail(
      'UNRESOLVED_LEGACY_FIGURE',
      `Original figure '${item.id}' has no recovered asset mapping`,
    );
  }
  if (item.figure?.originalUrl !== entry.originalUrl) {
    return fail(
      'LEGACY_FIGURE_URL_MISMATCH',
      `Figure '${item.id}' original URL differs from its manifest`,
    );
  }
  const asset = options.assets.find(
    (resolved) =>
      resolved.asset.sha256 === entry.contentSha256 &&
      resolved.asset.path === entry.localPath,
  );
  if (!asset) {
    return fail(
      'UNRESOLVED_DOCUMENT_ASSET',
      `Original figure '${item.id}' captured bytes are missing`,
    );
  }
  return parseContent(PreparedDocumentItemSchema, {
    kind: 'figure',
    id: item.id,
    sourcePlacementId,
    context: [],
    contextSource: retainItemContextSource(item),
    figure: {
      assetId: asset.asset.id,
      caption: entry.additions?.caption ?? '',
      alt: entry.additions?.alt ?? '',
      ...(item.figure?.width !== undefined ? { width: item.figure.width } : {}),
    },
  });
};

export const prepareLegacyDocument = (
  options: PrepareLegacyDocumentOptions,
): PreparedDocument => {
  const cso = restoreContentFields(
    parseContent(CalculationSourceObjectSchema, options.cso),
    options.cso,
  );
  assertExtensionFields(options.cso);
  for (const review of options.historicalReviews ?? [])
    assertDocumentJson(review, '/historicalReview');
  const manifest = parseContent(LegacyAssetManifestSchema, options.manifest);
  const sections = reachableSections(cso).map((section) =>
    parseContent(PreparedDocumentSectionSchema, {
      id: section.id,
      title: section.title,
      sourcePlacementId: placementId(section.id, 'heading'),
      context: [],
      metadata: section.metadata,
      items: section.items.map((item, index): PreparedDocumentItem => {
        const sourcePlacementId = placementId(section.id, index);
        if (item.kind === 'figure') {
          return legacyFigure(options, manifest, item, sourcePlacementId);
        }
        return parseContent(PreparedDocumentItemSchema, {
          ...itemFields(item),
          sourcePlacementId,
          context: [],
          contextSource: retainItemContextSource(item),
        });
      }),
    }),
  );
  const displayed = new Set(
    sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.kind === 'symbol' ? [item.symbol.id] : [],
      ),
    ),
  );
  const { definitions, symbolHistory, referencedSymbolHistory } =
    symbolMetadataHistory(cso);
  const itemHistory = itemMetadataHistory(cso);
  const contentHistory = itemHistory.filter(
    (item) => item.kind === 'text' || item.kind === 'figure',
  );
  const placementHistory = itemHistory.filter(
    (item) => item.kind !== 'text' && item.kind !== 'figure',
  );
  const historical = parseHistoricalReview({
    scope: 'historical',
    originalSource: {
      id: options.fixtureId,
      sha256: options.fixtureSha256,
      format: cso.source.origin?.format ?? 'CalculationSourceObject',
    },
    attribution:
      'Historical source metadata. It does not approve this rendering or a current execution.',
    originalFields: {
      source: cso.source,
      sections: reachableSections(cso).map(({ id, title, metadata }) => ({
        id,
        title,
        ...(metadata ? { metadata } : {}),
      })),
      ...(contentHistory.length > 0 ? { content: contentHistory } : {}),
      ...(placementHistory.length > 0 ? { placements: placementHistory } : {}),
      ...(symbolHistory.length > 0 ? { symbols: symbolHistory } : {}),
      ...(referencedSymbolHistory.length > 0
        ? { referencedSymbols: referencedSymbolHistory }
        : {}),
    },
  });
  const document = parseDocument({
    documentVersion: '2',
    context: [],
    source: {
      kind: 'legacy',
      fixtureId: options.fixtureId,
      fixtureSha256: options.fixtureSha256,
    },
    title: cso.title,
    sourceMetadata: cso.source.metadata,
    rootSectionIds: cso.rootSectionIds,
    sections,
    detachedSymbols: definitions.filter((symbol) => !displayed.has(symbol.id)),
    assets: options.assets,
    historicalReviews: [historical, ...(options.historicalReviews ?? [])],
  });
  return parseDocument(prepareDocumentContext(document));
};
