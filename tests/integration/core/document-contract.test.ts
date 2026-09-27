import { describe, expect, it } from 'vitest';
import orderedContent from '../../fixtures/contract-cases/ordered-content.json';
import repeatedExecution from '../../fixtures/contract-cases/repeated-nested-success.json';
import { CalculationSourceObjectSchema } from '@cs-object/core';
import {
  BoundPreparedDocumentSchema,
  HistoricalReviewSchema,
  PreparedDocumentSchema,
  ResolvedAssetSchema,
} from '@cs-object/core';
import { ExecutionPayloadSchema } from '@cs-object/core';

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
});
