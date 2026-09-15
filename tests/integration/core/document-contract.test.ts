import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import orderedContent from '../../fixtures/contract-cases/ordered-content.json';
import repeatedExecution from '../../fixtures/contract-cases/repeated-nested-success.json';
import { CalculationSourceObjectSchema } from '@cs-object/core';
import {
  BoundPreparedDocumentSchema,
  HistoricalReviewSchema,
  LegacyAssetManifestSchema,
  PreparedDocumentSchema,
  ResolvedAssetSchema,
} from '@cs-object/core';
import {
  ExecutionPayloadSchema,
  ExecutionResponseSchema,
} from '@cs-object/core';

const fixture = () =>
  PreparedDocumentSchema.parse(structuredClone(orderedContent));
const diagnosticCodes = (value: unknown) => {
  const result = PreparedDocumentSchema.safeParse(value);
  if (result.success) {
    return [];
  }
  return result.error.issues.flatMap((issue) =>
    issue.code === 'custom' ? [issue.params?.diagnosticCode] : [],
  );
};

describe('prepared document execution binding', () => {
  const execution = () =>
    ExecutionPayloadSchema.parse(structuredClone(repeatedExecution.execution));

  it('binds source entry, full closure, function, and all resolved inputs', () => {
    const value = { execution: execution(), document: fixture() };
    expect(BoundPreparedDocumentSchema.safeParse(value).success).toBe(true);
    if (value.document.source.kind !== 'execution') {
      throw new Error('Fixture requires execution source');
    }
    for (const changed of [
      { ...value.document.source, entryModuleId: 'other.cso.py' },
      { ...value.document.source, entrySourceHash: 'a'.repeat(64) },
      { ...value.document.source, sourceClosureHash: 'b'.repeat(64) },
      { ...value.document.source, function: 'other_function' },
      {
        ...value.document.source,
        resolvedInputs: { ...value.document.source.resolvedInputs, width: 1 },
      },
    ]) {
      const result = BoundPreparedDocumentSchema.safeParse({
        ...value,
        document: { ...value.document, source: changed },
      });
      expect(result.success).toBe(false);
      if (result.success) {
        continue;
      }
      expect(
        result.error.issues.some(
          (issue) =>
            issue.code === 'custom' &&
            issue.params?.diagnosticCode ===
              'DOCUMENT_EXECUTION_BINDING_MISMATCH',
        ),
      ).toBe(true);
    }
  });

  it('accepts reordered input keys without changing execution identity', () => {
    const document = fixture();
    if (document.source.kind !== 'execution') {
      throw new Error('Fixture requires execution source');
    }
    document.source.resolvedInputs = Object.fromEntries(
      Object.entries(document.source.resolvedInputs).reverse(),
    );
    expect(
      BoundPreparedDocumentSchema.safeParse({
        execution: execution(),
        document,
      }).success,
    ).toBe(true);
  });

  it('rejects a legacy document paired with current execution', () => {
    const document = fixture();
    document.source = {
      kind: 'legacy',
      fixtureId: 'original',
      fixtureSha256: 'a'.repeat(64),
    };
    expect(
      BoundPreparedDocumentSchema.safeParse({
        execution: execution(),
        document,
      }).success,
    ).toBe(false);
  });

  it('preserves source section metadata before prepared-document parsing', () => {
    const response = structuredClone(repeatedExecution);
    const sourceMetadata = response.execution.cso.sections[0].metadata;
    Object.defineProperty(sourceMetadata, '__proto__', {
      value: { retained: true },
      enumerable: true,
    });
    Object.defineProperty(sourceMetadata, 'constructor', {
      value: { retained: true },
      enumerable: true,
    });
    const parsedResponse = ExecutionResponseSchema.parse(response);
    if (!parsedResponse.ok) {
      throw new Error('Fixture requires a successful execution response');
    }
    const parsedExecution = parsedResponse.execution;
    const parsedMetadata = parsedExecution.cso.sections[0].metadata;
    if (parsedMetadata === undefined) {
      throw new Error('Fixture requires source section metadata');
    }
    expect(Object.hasOwn(parsedMetadata, '__proto__')).toBe(true);
    expect(Object.hasOwn(parsedMetadata, 'constructor')).toBe(true);
    expect(Object.getPrototypeOf(parsedMetadata)).toBe(Object.prototype);

    const withoutMetadata = fixture();
    const document = PreparedDocumentSchema.parse({
      ...withoutMetadata,
      sections: [
        { ...withoutMetadata.sections[0], metadata: parsedMetadata },
        ...withoutMetadata.sections.slice(1),
      ],
    });
    expect(JSON.stringify(document.sections[0].metadata)).toBe(
      JSON.stringify(parsedMetadata),
    );

    const acceptedResponse = structuredClone(repeatedExecution);
    Reflect.set(acceptedResponse.execution.cso.sections[0], 'metadata', {
      undefinedValue: undefined,
      nonFiniteValue: Number.NaN,
    });
    const accepted = ExecutionResponseSchema.parse(acceptedResponse);
    if (!accepted.ok) {
      throw new Error('Fixture requires a successful execution response');
    }
    expect(
      accepted.execution.cso.sections[0].metadata,
    ).toEqual({ undefinedValue: undefined, nonFiniteValue: Number.NaN });

    for (const [metadata, received] of [
      [null, 'null'],
      [[], 'array'],
      ['invalid', 'string'],
    ]) {
      const invalidResponse = structuredClone(repeatedExecution);
      Reflect.set(
        invalidResponse.execution.cso.sections[0],
        'metadata',
        metadata,
      );
      const rejected = ExecutionResponseSchema.safeParse(invalidResponse);
      expect(rejected.success).toBe(false);
      if (rejected.success) {
        continue;
      }
      expect(rejected.error.issues).toEqual([
        {
          expected: 'record',
          code: 'invalid_type',
          path: ['execution', 'cso', 'sections', 0, 'metadata'],
          message: `Invalid input: expected record, received ${received}`,
        },
      ]);

      const customized = ExecutionResponseSchema.safeParse(invalidResponse, {
        error: (issue) =>
          issue.input === metadata
            ? `Custom metadata error: ${received}`
            : 'Custom metadata error lost original input',
      });
      expect(customized.success).toBe(false);
      if (customized.success) {
        continue;
      }
      expect(customized.error.issues).toEqual([
        {
          expected: 'record',
          code: 'invalid_type',
          path: ['execution', 'cso', 'sections', 0, 'metadata'],
          message: `Custom metadata error: ${received}`,
        },
      ]);
    }

  });

  it('runs source metadata error customization in the caller context', () => {
    const response = structuredClone(repeatedExecution);
    Reflect.set(response.execution.cso.sections[0], 'metadata', null);
    const originalCustomError = z.config().customError;
    const globalInputs: unknown[] = [];
    const callerInputs: unknown[] = [];
    try {
      z.config({
        customError: (issue) => {
          globalInputs.push(issue.input);
          return `Global metadata error: ${globalInputs.length}`;
        },
      });
      const globallyCustomized = ExecutionResponseSchema.safeParse(
        response,
      );
      expect(globallyCustomized.success).toBe(false);
      if (!globallyCustomized.success) {
        expect(globallyCustomized.error.issues).toEqual([
          {
            expected: 'record',
            code: 'invalid_type',
            path: ['execution', 'cso', 'sections', 0, 'metadata'],
            message: 'Global metadata error: 1',
          },
        ]);
      }

      const callerCustomized = ExecutionResponseSchema.safeParse(
        response,
        {
          error: (issue) => {
            callerInputs.push(issue.input);
            return 'Caller metadata error';
          },
        },
      );
      expect(callerCustomized.success).toBe(false);
      if (!callerCustomized.success) {
        expect(callerCustomized.error.issues).toEqual([
          {
            expected: 'record',
            code: 'invalid_type',
            path: ['execution', 'cso', 'sections', 0, 'metadata'],
            message: 'Caller metadata error',
          },
        ]);
      }
      expect(globalInputs).toEqual([null]);
      expect(callerInputs).toEqual([null]);
    } finally {
      z.config({ customError: originalCustomError });
    }
  });
});

describe('prepared document contract', () => {
  it('preserves ordered text, nested sections, repeated symbols, and parent restoration', () => {
    const document = fixture();
    const byId = new Map(
      document.sections.map((section) => [section.id, section]),
    );
    const placements: string[] = [];
    const visit = (id: string) => {
      const section = byId.get(id);
      expect(section).toBeDefined();
      if (!section) {
        return;
      }
      for (const item of section.items) {
        placements.push(item.sourcePlacementId);
        if (item.kind === 'section') {
          visit(item.id);
        }
      }
    };
    document.rootSectionIds.forEach(visit);
    expect(placements).toEqual([
      'intro',
      'area-definition',
      'detail-call',
      'diagram',
      'detail-note',
      'area-repeat',
      'summary',
    ]);
    expect(document.historicalReviews[0].originalFields).toEqual({
      reviewer: 'Original reviewer',
      approved: true,
      notes: ['Retained original field'],
    });
  });

  it('rejects missing figure bytes and ambiguous placement identity', () => {
    const noAsset = fixture();
    noAsset.assets = [];
    expect(diagnosticCodes(noAsset)).toContain('UNRESOLVED_DOCUMENT_ASSET');
    const duplicate = fixture();
    duplicate.sections[0].items[1].sourcePlacementId = 'intro';
    expect(diagnosticCodes(duplicate)).toContain('DUPLICATE_SOURCE_PLACEMENT');
  });

  it('preserves optional finite positive fractional figure widths', () => {
    const document = fixture();
    const withWidth = (width: unknown) => {
      const value = structuredClone(document);
      const figure = value.sections
        .flatMap((section) => section.items)
        .find((item) => item.kind === 'figure');
      if (!figure || figure.kind !== 'figure') {
        throw new Error('Fixture requires a figure');
      }
      Reflect.set(figure.figure, 'width', width);
      return value;
    };
    const omitted = document.sections
      .flatMap((section) => section.items)
      .find((item) => item.kind === 'figure');
    if (!omitted || omitted.kind !== 'figure') {
      throw new Error('Fixture requires a figure');
    }
    expect(Object.hasOwn(omitted.figure, 'width')).toBe(false);

    for (const width of [0.5, 299.25]) {
      const parsed = PreparedDocumentSchema.parse(withWidth(width));
      const figure = parsed.sections
        .flatMap((section) => section.items)
        .find((item) => item.kind === 'figure');
      expect(figure?.kind === 'figure' && figure.figure.width).toBe(width);
    }
    for (const width of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      '299',
    ]) {
      expect(PreparedDocumentSchema.safeParse(withWidth(width)).success).toBe(
        false,
      );
    }
  });

  it('rejects cycles, unplaced content, and unresolved symbols', () => {
    const cyclic = fixture();
    const sectionItem = cyclic.sections[0].items.find(
      (item) => item.kind === 'section',
    );
    if (!sectionItem) {
      throw new Error('Fixture must contain a child section');
    }
    sectionItem.id = cyclic.sections[0].id;
    expect(diagnosticCodes(cyclic)).toContain('DOCUMENT_SECTION_CYCLE');
    const missing = fixture();
    missing.sections[0].items = missing.sections[0].items.filter(
      (item) => item.kind !== 'section',
    );
    expect(diagnosticCodes(missing)).toContain('UNPLACED_DOCUMENT_SECTION');
    const unknown = fixture();
    const reference = unknown.sections[0].items.find(
      (item) => item.kind === 'symbolRef',
    );
    if (!reference) {
      throw new Error('Fixture must contain a repeated symbol');
    }
    reference.id = 'missing';
    expect(diagnosticCodes(unknown)).toContain('UNRESOLVED_DOCUMENT_SYMBOL');
  });

  it('requires execution placement provenance and permits unavailable legacy provenance', () => {
    const value = fixture();
    value.sections[0].items[0].location = undefined;
    expect(diagnosticCodes(value)).toContain('MISSING_PLACEMENT_PROVENANCE');
    value.source = {
      kind: 'legacy',
      fixtureId: 'original',
      fixtureSha256: 'a'.repeat(64),
    };
    expect(PreparedDocumentSchema.safeParse(value).success).toBe(true);
  });

  it('preserves compatible legacy payload parsing while rejecting unsupported prepared payloads', () => {
    const legacy = {
      schemaVersion: '1.0.0',
      title: 'Legacy',
      source: { id: 'original', metadata: {} },
      rootSectionIds: ['root'],
      sections: [
        {
          id: 'root',
          title: 'Legacy',
          items: [
            {
              kind: 'text',
              id: 'text',
              text: { oldTextField: 'Legacy prose' },
            },
            {
              kind: 'figure',
              id: 'figure',
              figure: { remoteUrl: 'https://example.com/old.png' },
            },
          ],
        },
      ],
    };
    expect(CalculationSourceObjectSchema.safeParse(legacy).success).toBe(true);
    const prepared = fixture();
    expect(
      PreparedDocumentSchema.safeParse({
        ...prepared,
        sections: [
          { ...prepared.sections[0], items: legacy.sections[0].items },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects a competing order array and a fresh approval assertion', () => {
    expect(
      PreparedDocumentSchema.safeParse({ ...fixture(), itemOrder: [] }).success,
    ).toBe(false);
    expect(
      HistoricalReviewSchema.safeParse({
        ...fixture().historicalReviews[0],
        currentExecutionApproved: true,
      }).success,
    ).toBe(false);
  });

  it('preserves every historical JSON key, including nested prototype-named keys', () => {
    const originalFields: unknown = JSON.parse(
      '{"__proto__":{"approved":true},"nested":{"__proto__":"retained","constructor":4},"array":[{"__proto__":null}],"empty":{},"primitives":[false,3,"text",null]}',
    );
    const review = HistoricalReviewSchema.parse({
      ...fixture().historicalReviews[0],
      originalFields,
    });
    expect(JSON.stringify(review.originalFields)).toBe(
      JSON.stringify(originalFields),
    );
    expect(Object.hasOwn(review.originalFields, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(review.originalFields)).toBe(Object.prototype);
  });

  it('preserves source metadata without changing execution identity or review records', () => {
    const original = fixture();
    expect(Object.hasOwn(original, 'sourceMetadata')).toBe(false);
    const nested: unknown = JSON.parse(
      '{"purpose":"Panel estimate","assumptions":["Dry material",{"factor":1.25}],"empty":{},"list":[],"__proto__":{"retained":true},"constructor":"authored","nested":{"__proto__":null,"constructor":[false,3,"text",null]},"review":{"approved":true}}',
    );
    for (const sourceMetadata of [{}, nested]) {
      const document = PreparedDocumentSchema.parse({
        ...original,
        sourceMetadata,
      });
      expect(document.sourceMetadata).toEqual(sourceMetadata);
      expect(JSON.stringify(document.sourceMetadata)).toBe(
        JSON.stringify(sourceMetadata),
      );
      expect(document.source).toEqual(original.source);
      expect(document.historicalReviews).toEqual(original.historicalReviews);
      expect(Object.getPrototypeOf(document.sourceMetadata)).toBe(
        Object.prototype,
      );
      expect(
        BoundPreparedDocumentSchema.safeParse({
          execution: repeatedExecution.execution,
          document,
        }).success,
      ).toBe(true);
    }
    const document = PreparedDocumentSchema.parse({
      ...original,
      sourceMetadata: nested,
    });
    expect(Object.hasOwn(document.sourceMetadata ?? {}, '__proto__')).toBe(
      true,
    );
    expect(Object.hasOwn(document.sourceMetadata ?? {}, 'constructor')).toBe(
      true,
    );
    expect(Object.hasOwn(original, 'sourceMetadata')).toBe(false);
  });

  it('rejects non-JSON source metadata with located diagnostics', () => {
    for (const sourceMetadata of [
      null,
      [],
      'metadata',
      4,
      { nested: undefined },
      { nested: Number.NaN },
      { nested: Number.POSITIVE_INFINITY },
      { nested: () => 1 },
      { nested: new Date() },
    ]) {
      const result = PreparedDocumentSchema.safeParse({
        ...fixture(),
        sourceMetadata,
      });
      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error('Expected metadata validation failure');
      }
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(
        result.error.issues.every(
          (issue) => issue.path[0] === 'sourceMetadata',
        ),
      ).toBe(true);
    }
    const source = structuredClone(repeatedExecution.execution.cso);
    expect(
      CalculationSourceObjectSchema.safeParse({
        ...source,
        source: {
          ...source.source,
          metadata: { nonJsonLegacyValue: Number.NaN },
        },
      }).success,
    ).toBe(true);
  });

  it('preserves optional authored section metadata without adding a review record', () => {
    const metadata: unknown = JSON.parse(
      '{"designBasis":"EN 1993","localId":"authored-local","invocationId":"authored/invocation","location":{"file":"authored.cso.py","line":1},"review":{"approved":true},"__proto__":{"retained":true},"nested":{"constructor":4,"__proto__":"retained"},"values":[false,3,null]}',
    );
    const withoutMetadata = fixture();
    expect(Object.hasOwn(withoutMetadata.sections[0], 'metadata')).toBe(false);
    const document = PreparedDocumentSchema.parse({
      ...withoutMetadata,
      sections: [
        { ...withoutMetadata.sections[0], metadata },
        ...withoutMetadata.sections.slice(1),
      ],
    });
    const section = document.sections[0];
    expect(section.metadata).toBeDefined();
    if (section.metadata === undefined) {
      throw new Error('Section metadata must be present');
    }
    expect(JSON.stringify(section.metadata)).toBe(JSON.stringify(metadata));
    expect(Object.hasOwn(section.metadata, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(section.metadata)).toBe(Object.prototype);
    expect(section.localId).toBe(withoutMetadata.sections[0].localId);
    expect(section.invocationId).toBe(withoutMetadata.sections[0].invocationId);
    expect(section.location).toEqual(withoutMetadata.sections[0].location);
    expect(document.historicalReviews).toEqual(withoutMetadata.historicalReviews);
    expect(
      PreparedDocumentSchema.safeParse({
        ...withoutMetadata,
        sections: [
          { ...withoutMetadata.sections[0], metadata: { factor: Number.NaN } },
          ...withoutMetadata.sections.slice(1),
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects non-JSON historical fields without silently dropping them', () => {
    const review = fixture().historicalReviews[0];
    for (const invalid of [undefined, () => 1, Number.NaN, new Date()]) {
      expect(
        HistoricalReviewSchema.safeParse({
          ...review,
          originalFields: { nested: { invalid } },
        }).success,
      ).toBe(false);
    }
  });

  it('rejects contradictory execution identity metadata for every placement kind', () => {
    const rootSection = fixture().sections[0];
    for (const localId of ['different', undefined]) {
      const section = fixture();
      section.sections[0].localId = localId;
      expect(PreparedDocumentSchema.safeParse(section).success).toBe(false);
    }
    for (const [sectionIndex, section] of fixture().sections.entries()) {
      for (const [itemIndex] of section.items.entries()) {
        const changed = fixture();
        changed.sections[sectionIndex].items[itemIndex].invocationId =
          'root/other';
        expect(diagnosticCodes(changed)).toContain(
          'DOCUMENT_IDENTITY_MISMATCH',
        );
      }
    }
    expect(
      rootSection.items.find((item) => item.kind === 'symbolRef')?.localId,
    ).toBe('area');
  });

  it('validates dependency-only execution symbol namespaces without requiring a display placement', () => {
    const symbol = {
      id: '["symbol","root/材料","面積"]',
      glyph: 'A_{dep}',
      valueTree: {
        rootKey: 'n1',
        nodes: [
          {
            key: 'n1',
            mode: 'LITERAL',
            literal: { kind: 'number', value: 6 },
          },
        ],
      },
    };
    const value = { ...fixture(), detachedSymbols: [symbol] };
    expect(PreparedDocumentSchema.safeParse(value).success).toBe(true);
    for (const id of [
      'bare-legacy-id',
      '[ "symbol", "root", "area" ]',
      '["text","root","area"]',
      '["symbol","root",""]',
      JSON.stringify(['symbol', 'root', '\uD800']),
      JSON.stringify(['symbol', '\uDFFF', 'area']),
    ]) {
      expect(
        diagnosticCodes({ ...value, detachedSymbols: [{ ...symbol, id }] }),
      ).toContain('DOCUMENT_IDENTITY_MISMATCH');
    }
    for (const metadata of [
      { localId: 'wrong' },
      { invocationId: 'root/wrong' },
    ]) {
      expect(
        diagnosticCodes({
          ...value,
          detachedSymbols: [{ ...symbol, metadata }],
        }),
      ).toContain('DOCUMENT_IDENTITY_MISMATCH');
    }
    expect(
      PreparedDocumentSchema.safeParse({
        ...value,
        detachedSymbols: [
          {
            ...symbol,
            metadata: { invocationId: 'root/材料', localId: '面積' },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      PreparedDocumentSchema.safeParse({
        ...value,
        source: {
          kind: 'legacy',
          fixtureId: 'original',
          fixtureSha256: 'a'.repeat(64),
        },
        detachedSymbols: [{ ...symbol, id: 'bare-legacy-id' }],
      }).success,
    ).toBe(true);
  });
});

describe('resolved and legacy asset contracts', () => {
  it('binds decoded bytes to hash and declared media without claiming image decode', () => {
    const asset = fixture().assets[0];
    expect(ResolvedAssetSchema.safeParse(asset).success).toBe(true);
    expect(
      ResolvedAssetSchema.safeParse({
        ...asset,
        asset: { ...asset.asset, sha256: '0'.repeat(64) },
      }).success,
    ).toBe(false);
    expect(
      ResolvedAssetSchema.safeParse({
        ...asset,
        dataUrl: asset.dataUrl.replace('image/png', 'image/jpeg'),
      }).success,
    ).toBe(false);
    expect(
      ResolvedAssetSchema.safeParse({
        ...asset,
        dataUrl: 'https://example.com/asset.png',
      }).success,
    ).toBe(false);
    expect(
      ResolvedAssetSchema.safeParse({
        ...asset,
        dataUrl: 'data:image/png;base64,%%%',
      }).success,
    ).toBe(false);
  });

  it('keeps caption and alt additions separate from recovered byte identity', () => {
    const entry = {
      originalFixtureSha256: '1'.repeat(64),
      figureId: 'original-figure',
      originalUrl: 'https://example.com/original.png',
      localPath: 'assets/original.png',
      contentSha256: fixture().assets[0].asset.sha256,
      additions: { caption: 'Recovered original', alt: 'Original diagram' },
    };
    expect(
      LegacyAssetManifestSchema.safeParse({
        manifestVersion: '1',
        entries: [entry],
      }).success,
    ).toBe(true);
    expect(
      LegacyAssetManifestSchema.safeParse({
        manifestVersion: '1',
        entries: [entry, entry],
      }).success,
    ).toBe(false);
  });
});
