import {
  HistoricalReviewSchema,
  type CalculationSourceSymbol,
  type HistoricalReview,
  type PreparedContextField,
  type PreparedContextValue,
  type PreparedDocument,
} from '@viktar-b/cso-core';
import { activeSymbolIds } from './active-symbols.ts';

type Value = HistoricalReview['originalFields'][string];
const fields = new Map([
  ['purpose', 'Purpose'],
  ['explanation', 'Explanation'],
  ['method', 'Method'],
  ['criteria', 'Criteria'],
  ['applicability', 'Applicability'],
  ['tolerances', 'Tolerances'],
  ['description', 'Description'],
  ['assumptions', 'Assumptions'],
  ['assumption', 'Assumption'],
  ['designBasis', 'Design basis'],
  ['limitations', 'Limitations'],
  ['designStandard', 'Design standard'],
  ['standard', 'Standard'],
  ['references', 'References'],
  ['reference', 'Reference'],
  ['notes', 'Notes'],
  ['note', 'Note'],
  ['comment', 'Comment'],
  ['credit', 'Credit'],
  ['license', 'License'],
]);
const pointer = (key: string) =>
  key.replaceAll('~', '~0').replaceAll('/', '~1');
const record = (value: Value | undefined) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;

const evidenceKeys = new Set([
  'localId',
  'invocationId',
  'location',
  'key',
  'draft',
  'tags',
  'valueTree',
  'nodes',
  'rootKey',
  'funcSpec',
  'funcArgs',
  'owner',
  'acl',
  'canEdit',
  'canShare',
  '__typename',
  '__proto__',
  'constructor',
]);
const evidenceRole =
  /audit|review|approv|checked|submission|verification|transport/i;
const engineeringChild = (key: string) =>
  !(evidenceKeys.has(key) || evidenceRole.test(key));

// Select before rendering. Original indexes remain in leaf pointers when empty
// or evidence-only children are omitted from the displayed value.
const contextValue = (
  value: Value,
  path: string,
): PreparedContextValue | undefined => {
  if (value === null || value === '') {
    return undefined;
  }
  if (Array.isArray(value)) {
    const items = value.flatMap((entry, index) => {
      const selected = contextValue(entry, `${path}/${index}`);
      return selected ? [selected] : [];
    });
    return items.length > 0 ? { kind: 'list', items } : undefined;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).flatMap(([key, entry]) => {
      if (!engineeringChild(key)) {
        return [];
      }
      const selected = contextValue(entry, `${path}/${pointer(key)}`);
      return selected ? [{ label: key, value: selected }] : [];
    });
    return entries.length > 0 ? { kind: 'record', entries } : undefined;
  }
  return { kind: 'text', value, path };
};
const engineeringFields = (
  value: unknown,
  path: string,
): PreparedContextField[] => {
  if (value === undefined) {
    return [];
  }
  const object = HistoricalReviewSchema.shape.originalFields.parse(value);
  return Object.entries(object).flatMap(([key, value]) => {
    const sourcePath = `${path}/${pointer(key)}`;
    if (key === 'additionalFields' && record(value)) {
      return engineeringFields(value, sourcePath);
    }
    const label = fields.get(key);
    const selected = label ? contextValue(value, sourcePath) : undefined;
    return label && selected
      ? [{ label, value: selected, path: sourcePath }]
      : [];
  });
};

// Internal to both preparation adapters. It never reads historical reviews.
export const prepareDocumentContext = (
  document: PreparedDocument,
): PreparedDocument => {
  const definitions = new Map<
    string,
    { symbol: CalculationSourceSymbol; path: string }
  >([
    ...document.sections.flatMap((section, sectionIndex) =>
      section.items.flatMap((item, itemIndex) =>
        item.kind === 'symbol'
          ? [
              [
                item.symbol.id,
                {
                  symbol: item.symbol,
                  path: `/sections/${sectionIndex}/items/${itemIndex}/symbol`,
                },
              ] as const,
            ]
          : [],
      ),
    ),
    ...document.detachedSymbols.map(
      (symbol, index) =>
        [symbol.id, { symbol, path: `/detachedSymbols/${index}` }] as const,
    ),
  ]);
  const placed = new Set(
    document.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.kind === 'symbol'
          ? [item.symbol.id]
          : item.kind === 'symbolRef'
            ? [item.id]
            : [],
      ),
    ),
  );
  const symbols = new Map(
    [...definitions].map(([id, definition]) => [id, definition.symbol]),
  );
  const symbolContext = (id: string) => {
    const definition = definitions.get(id);
    if (!definition) {
      throw new Error(`Missing prepared symbol '${id}'`);
    }
    return engineeringFields(
      definition.symbol.metadata,
      `${definition.path}/metadata`,
    );
  };
  const operandContext = (symbolId: string) => {
    const definition = definitions.get(symbolId);
    if (!definition) {
      throw new Error(`Missing prepared operand '${symbolId}'`);
    }
    const context = (['description', 'unit', 'comment'] as const).flatMap(
      (key): PreparedContextField[] => {
        const value = definition.symbol[key];
        if (value === undefined || value === '') {
          return [];
        }
        const path = `${definition.path}/${key}`;
        return key === 'unit'
          ? [{ label: 'Unit', path, value: { kind: 'math', path, value } }]
          : engineeringFields({ [key]: value }, definition.path);
      },
    );
    return { symbolId, context: [...context, ...symbolContext(symbolId)] };
  };
  return {
    ...document,
    context: engineeringFields(document.sourceMetadata, '/sourceMetadata'),
    sections: document.sections.map((section, sectionIndex) => ({
      ...section,
      context: engineeringFields(
        section.metadata,
        `/sections/${sectionIndex}/metadata`,
      ),
      items: section.items.map((item, itemIndex) => {
        const path = `/sections/${sectionIndex}/items/${itemIndex}/contextSource`;
        const context = [
          'metadata',
          'contentMetadata',
          'additionalFields',
        ].flatMap((key) =>
          engineeringFields(item.contextSource?.[key], `${path}/${key}`),
        );
        if (item.kind !== 'symbol' && item.kind !== 'symbolRef') {
          return { ...item, context };
        }
        const id = item.kind === 'symbol' ? item.symbol.id : item.id;
        return {
          ...item,
          context: [...symbolContext(id), ...context],
          operands: [...activeSymbolIds([id], symbols)]
            .filter((id) => !placed.has(id))
            .map(operandContext),
        };
      }),
    })),
  };
};
