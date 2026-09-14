import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ExecutionResponseSchema,
  PreparedDocumentSchema,
} from '@viktar-b/cso-core';
import {
  DocumentPreparationError,
  PreparedFormulaSheet,
  prepareExecutionDocument,
  prepareLegacyDocument,
} from '@viktar-b/cso-react';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

Object.assign(globalThis, { React });
const root = resolve(import.meta.dirname, '../../..');
const read = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const execution = (name: string) => {
  const response = ExecutionResponseSchema.parse(
    read(`tests/fixtures/contract-cases/${name}.json`),
  );
  if (!response.ok) {
    throw new Error('Expected successful fixture');
  }
  return response.execution;
};

describe('Prepared document rendering and preservation', () => {
  test('prepares current execution context independently of matching historical reviews', () => {
    const payload = execution('repeated-nested-success');
    payload.cso.source.metadata = { purpose: 'Current purpose' };
    const placement = payload.cso.sections[0].items[0];
    placement.metadata = {
      ...placement.metadata,
      explanation: 'Current placement',
    };
    const document = prepareExecutionDocument({
      execution: payload,
      assets: [],
      historicalReviews: [
        {
          scope: 'historical',
          originalSource: {
            id: payload.entry.moduleId,
            sha256: payload.entry.sourceHash,
            format: 'Old record',
          },
          attribution: 'Historical only',
          originalFields: {
            source: { metadata: { purpose: 'Obsolete purpose' } },
          },
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(PreparedFormulaSheet, { document }),
    );
    expect(html).toContain('Current purpose');
    expect(html).toContain('Current placement');
    expect(html).not.toContain('Obsolete purpose');
    for (const historicalReviews of [
      [],
      [...document.historicalReviews].reverse(),
    ]) {
      const roundTrip = PreparedDocumentSchema.parse(
        JSON.parse(JSON.stringify({ ...document, historicalReviews })),
      );
      expect(
        renderToStaticMarkup(
          createElement(PreparedFormulaSheet, { document: roundTrip }),
        ),
      ).toBe(html);
    }
  });
  test('preserves signed zero and ordinary scalar inputs in the execution header', () => {
    const document = prepareExecutionDocument({
      execution: execution('single-success'),
      assets: [],
    });
    if (document.source.kind !== 'execution')
      throw new Error('Expected execution source');
    document.source.resolvedInputs = {
      negativeZero: -0,
      positiveZero: 0,
      number: -2.5,
    };
    const html = renderToStaticMarkup(
      createElement(PreparedFormulaSheet, { document }),
    );
    expect(html).toContain(
      'negativeZero = -0, positiveZero = 0, number = -2.5',
    );
    expect(Object.is(document.source.resolvedInputs.negativeZero, -0)).toBe(
      true,
    );
  });
  test('presents useful engineering context while retaining audit and empty values in JSON', () => {
    const payload = execution('single-success');
    payload.cso.source.metadata = {
      purpose: 'Calculate the panel area',
      assumptions: {
        openings: false,
        allowance: 0,
        conditions: ['Uniform thickness', null, 'Uniform thickness'],
        audit: { approvedBy: 'Hidden reviewer' },
        localId: 'Hidden local ID',
        unused: [],
      },
      designBasis: 'Rectangular geometry',
      arbitraryExtension: { note: 'Evidence-only extension' },
      approval: 'Historical approval',
      ['__proto__']: { retained: true },
    };
    const document = prepareExecutionDocument({
      execution: payload,
      assets: [],
    });
    const before = JSON.stringify(document);
    const html = renderToStaticMarkup(
      createElement(PreparedFormulaSheet, { document }),
    );
    for (const value of [
      'Calculate the panel area',
      'Rectangular geometry',
      'openings',
      'false',
      'allowance',
      '0',
    ])
      expect(html).toContain(value);
    expect(html.match(/Uniform thickness/g)).toHaveLength(2);
    for (const value of [
      'Hidden reviewer',
      'Hidden local ID',
      'Evidence-only extension',
      'Historical approval',
      'Empty list',
    ])
      expect(html).not.toContain(value);
    expect(html).toContain(
      'data-engineering-field="/sourceMetadata/assumptions"',
    );
    expect(html.indexOf('Calculate the panel area')).toBeLessThan(
      html.indexOf('data-symbol-id='),
    );
    expect(JSON.stringify(document)).toEqual(before);
    expect(JSON.parse(before).sourceMetadata).toEqual(
      payload.cso.source.metadata,
    );
  });
  test('presents an authored formula limitation beside its symbol without printing node serialization', () => {
    const payload = execution('single-success');
    const item = payload.cso.sections[0].items.find(
      (item) => item.kind === 'symbol',
    );
    if (item?.kind !== 'symbol') throw new Error('Expected symbol');
    item.symbol.metadata = {
      ...item.symbol.metadata,
      limitations: 'Valid for a rectangular panel only',
      audit: { reviewer: 'Evidence reviewer' },
    };
    const document = prepareExecutionDocument({
      execution: payload,
      assets: [],
    });
    const html = renderToStaticMarkup(
      createElement(PreparedFormulaSheet, { document }),
    );
    expect(html).toContain('Valid for a rectangular panel only');
    expect(html).not.toContain('Evidence reviewer');
    expect(html).toContain('/symbol/metadata/limitations');
    expect(JSON.parse(JSON.stringify(document.historicalReviews))).toEqual(
      document.historicalReviews,
    );
  });

  test('retains explicitly empty authored metadata containers', () => {
    const payload = execution('single-success');
    const item = payload.cso.sections[0].items.find(
      (item) => item.kind === 'symbol',
    );
    if (item?.kind !== 'symbol') throw new Error('Expected symbol');
    item.symbol.valueTree.metadata = {};
    item.symbol.valueTree.nodes[0].metadata = {};
    payload.cso.source.metadata = {};
    const document = prepareExecutionDocument({
      execution: payload,
      assets: [],
    });
    expect(document.historicalReviews[0].originalFields.symbols).toMatchObject([
      { valueTree: { metadata: {}, nodes: [{ metadata: {} }] } },
      {},
    ]);
    const legacyDocument = prepareLegacyDocument({
      cso: {
        ...payload.cso,
        sections: payload.cso.sections.map((section) => ({
          ...section,
          items: section.items.map((item) => ({ ...item, metadata: {} })),
        })),
      },
      fixtureId: 'empty-metadata',
      fixtureSha256: payload.entry.sourceHash,
      assets: [],
      manifest: { manifestVersion: '1', entries: [] },
    });
    expect(
      legacyDocument.historicalReviews[0].originalFields.placements,
    ).toMatchObject([{ metadata: {} }, { metadata: {} }]);

    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });
  test.each(['legacy', 'execution'])(
    'preserves %s symbol, reference and child placement metadata',
    (mode) => {
      const payload = execution('repeated-nested-success');
      const authored = {
        explanation: 'Placement explanation',
        audit: { approvedBy: 'Placement reviewer' },
        items: [],
        ['__proto__']: 'Own placement field',
      };
      const expected = [];
      for (const kind of ['symbol', 'symbolRef', 'section']) {
        const section = payload.cso.sections.find((section) =>
          section.items.some((item) => item.kind === kind),
        );
        const index = section?.items.findIndex((item) => item.kind === kind);
        if (!section || index === undefined || index < 0)
          throw new Error(`Expected ${kind} placement`);
        const item = section.items[index];
        item.metadata = { ...item.metadata, ...authored };
        expected.push({
          id: item.kind === 'symbol' ? item.symbol.id : item.id,
          kind,
          sourcePlacementId: JSON.stringify([section.id, index]),
          metadata: mode === 'legacy' ? item.metadata : authored,
        });
      }
      const before = JSON.stringify(payload);
      const document =
        mode === 'legacy'
          ? prepareLegacyDocument({
              cso: payload.cso,
              fixtureId: 'placement-probe',
              fixtureSha256: payload.entry.sourceHash,
              assets: [],
              manifest: { manifestVersion: '1', entries: [] },
            })
          : prepareExecutionDocument({ execution: payload, assets: [] });
      const records = document.historicalReviews[0].originalFields.placements;
      expect(records).toHaveLength(3);
      expect(records).toEqual(expect.arrayContaining(expected));
      expect(JSON.stringify(payload)).toEqual(before);

      expect(JSON.parse(JSON.stringify(document))).toEqual(document);
    },
  );
  test.each([true, false])(
    'attributes execution definitions by active reachability: %s',
    (referenced) => {
      const payload = execution('single-success');
      const section = payload.cso.sections[0];
      const width = section.items[0];
      const area = section.items[1];
      if (width.kind !== 'symbol' || area.kind !== 'symbol')
        throw new Error('Expected width and area');
      width.symbol.metadata = {
        ...width.symbol.metadata,
        symbolVerification: 'Width review',
        ['__proto__']: 'Own symbol metadata',
      };
      area.symbol.metadata = {
        ...area.symbol.metadata,
        symbolVerification: 'Area review',
      };
      const { symbolVerification: _verification, ...runtime } =
        area.symbol.metadata;
      section.items = referenced
        ? [
            area,
            {
              kind: 'symbolRef',
              id: area.symbol.id,
              metadata: runtime,
            },
          ]
        : [width];
      if (!referenced) {
        width.symbol.valueTree.nodes.push({
          key: 'unused',
          mode: 'SYMBOL',
          symbol: { id: area.symbol.id },
        });
      }
      payload.cso.detachedItems = [referenced ? width : area];
      const before = JSON.stringify(payload);
      const document = prepareExecutionDocument({
        execution: payload,
        assets: [],
      });
      const history = document.historicalReviews[0].originalFields;
      expect(history.symbols).toMatchObject([
        {
          id: referenced ? area.symbol.id : width.symbol.id,
          glyph: referenced ? area.symbol.glyph : width.symbol.glyph,
          additionalFields: {
            glyphPlaintext: referenced
              ? area.symbol.glyphPlaintext
              : width.symbol.glyphPlaintext,
          },
          metadata: referenced
            ? { symbolVerification: 'Area review' }
            : {
                symbolVerification: 'Width review',
                ['__proto__']: 'Own symbol metadata',
              },
        },
      ]);
      expect(history.referencedSymbols).toEqual(
        referenced
          ? [
              {
                id: width.symbol.id,
                glyph: width.symbol.glyph,
                additionalFields: {
                  glyphPlaintext: width.symbol.glyphPlaintext,
                  description: width.symbol.description,
                  unit: width.symbol.unit,
                },
                metadata: {
                  symbolVerification: 'Width review',
                  ['__proto__']: 'Own symbol metadata',
                },
              },
            ]
          : undefined,
      );
      expect(JSON.stringify(payload)).toEqual(before);

      expect(JSON.parse(JSON.stringify(document))).toEqual(document);
    },
  );
  test('attributes execution source identity and complete supported origin separately from source context', () => {
    const payload = execution('single-success');
    payload.cso.source.id = 'upstream source identity';
    payload.cso.source.origin = {
      id: 'original identity',
      format: 'Original format',
      metadata: {
        audit: {
          approvedBy: 'Original reviewer',
          ['__proto__']: 'Own origin field',
        },
        qualifiers: [],
      },
    };
    const before = JSON.stringify(payload);
    const document = prepareExecutionDocument({
      execution: payload,
      assets: [],
    });
    expect(document.sourceMetadata).toEqual(payload.cso.source.metadata);
    expect(document.historicalReviews[0].originalFields.source).toEqual({
      id: payload.cso.source.id,
      origin: payload.cso.source.origin,
    });
    expect(JSON.stringify(payload)).toEqual(before);
    const unsupported = {
      ...payload,
      cso: {
        ...payload.cso,
        source: {
          ...payload.cso.source,
          origin: { ...payload.cso.source.origin, unsupported: true },
        },
      },
    };
    expect(() =>
      prepareExecutionDocument({ execution: unsupported, assets: [] }),
    ).toThrow(DocumentPreparationError);

    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });
  test('preserves execution source context separately from historical review', () => {
    const payload = execution('single-success');
    payload.cso.source.metadata = JSON.parse(
      '{"purpose":"Qualifying source purpose","assumptions":{"openings":false,"factors":[1,null,2],"exceptions":[]},"approval":{"status":"approved"},"__proto__":{"meaning":"ordinary source context"},"constructor":"source-constructor","empty":{}}',
    );
    const original = JSON.stringify(payload);
    const document = prepareExecutionDocument({
      execution: payload,
      assets: [],
    });
    expect(document.sourceMetadata).toEqual(payload.cso.source.metadata);
    expect(Object.hasOwn(document.sourceMetadata ?? {}, '__proto__')).toBe(
      true,
    );
    expect(document.historicalReviews).toHaveLength(1);
    expect(document.historicalReviews[0].originalFields.source).toEqual({
      id: payload.cso.source.id,
    });
    expect(document.historicalReviews[0].originalFields).not.toHaveProperty(
      'source.metadata',
    );
    expect(JSON.stringify(payload)).toEqual(original);

    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });
  test('keeps cross-invocation symbol identity with its own placement location', () => {
    const payload = execution('repeated-nested-success');
    const reference = payload.cso.sections[0].items.find(
      (item) => item.kind === 'symbolRef',
    );
    const target = payload.invocations[1].symbols[0];
    if (!reference || !target) {
      throw new Error('Expected a repeated symbol and child definition');
    }
    const location = reference.metadata?.location;
    reference.id = target.symbolId;
    reference.metadata = { ...reference.metadata, invocationId: 'root' };
    const document = prepareExecutionDocument({
      execution: payload,
      assets: [],
    });
    expect(document.sourceMetadata).toEqual(payload.cso.source.metadata);
    const prepared = document.sections[0].items.find(
      (item) => item.kind === 'symbolRef',
    );
    expect(prepared).toMatchObject({
      id: target.symbolId,
      localId: target.localId,
      invocationId: payload.invocations[1].id,
      location,
    });
  });
  test('keeps child section identity with parent call-site provenance', () => {
    const payload = execution('two-panel-success');
    const parent = payload.cso.sections[0];
    const placement = parent.items.find((item) => item.kind === 'section');
    const target = payload.cso.sections.find(
      (section) => section.id === placement?.id,
    );
    const invocation = payload.invocations.find(
      (item) => item.id === target?.metadata?.invocationId,
    );
    if (!placement || !target || !invocation || !('callSite' in invocation)) {
      throw new Error('Expected a child section invocation');
    }
    placement.metadata = {
      invocationId: payload.entry.invocationId,
      location: invocation.callSite,
    };
    const document = prepareExecutionDocument({
      execution: payload,
      assets: [],
    });
    const prepared = document.sections
      .find((section) => section.id === parent.id)
      ?.items.find((item) => item.kind === 'section');
    expect(prepared).toMatchObject({
      id: target.id,
      localId: target.metadata?.localId,
      invocationId: invocation.id,
      location: invocation.callSite,
    });
    expect(
      renderToStaticMarkup(createElement(PreparedFormulaSheet, { document })),
    ).toContain('data-prepared-document');
  });
  test.each([
    'single-success',
    'two-panel-success',
    'two-panel-width-1',
    'repeated-nested-success',
  ])('prepares exact execution binding for %s', (name) => {
    const payload = execution(name);
    const document = prepareExecutionDocument({
      execution: payload,
      assets: [],
    });
    expect(document.source).toEqual({
      kind: 'execution',
      entryModuleId: payload.entry.moduleId,
      entrySourceHash: payload.entry.sourceHash,
      sourceClosureHash: payload.sourceClosureHash,
      function: payload.entry.function,
      resolvedInputs: payload.entry.resolvedInputs,
    });
    expect(
      document.sections
        .flatMap((section) => section.items)
        .filter((item) => item.kind === 'symbol'),
    ).toHaveLength(payload.observations.length);
    expect(
      renderToStaticMarkup(createElement(PreparedFormulaSheet, { document })),
    ).toContain('Numerical verification is reported separately');
  });
  test('retains standalone text, repeated symbols, child order and parent restoration', () => {
    const document = PreparedDocumentSchema.parse(
      read('tests/fixtures/contract-cases/ordered-content.json'),
    );
    const html = renderToStaticMarkup(
      createElement(PreparedFormulaSheet, { document }),
    );
    expect(html.match(/data-symbol-id=/g)).toHaveLength(2);
    const ids = [
      'intro',
      'area-definition',
      'detail-call',
      'diagram',
      'detail-note',
      'area-repeat',
      'summary',
    ];
    for (let i = 1; i < ids.length; i++) {
      expect(html.indexOf(`data-source-placement="${ids[i]}"`)).toBeGreaterThan(
        html.indexOf(`data-source-placement="${ids[i - 1]}"`),
      );
    }
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).not.toContain('Original reviewer');
    expect(JSON.parse(JSON.stringify(document.historicalReviews))).toEqual(
      document.historicalReviews,
    );
  });
  test('rejects unknown/missing authored content without filtering it out', () => {
    const payload = execution('single-success');
    const section = payload.cso.sections[0];
    if (!section) {
      throw new Error('Expected section');
    }
    section.items.push({ kind: 'unknown', id: 'unsupported' });
    expect(() =>
      prepareExecutionDocument({ execution: payload, assets: [] }),
    ).toThrow();
  });
  test('rejects tampered captured asset and invalid tree even when called directly', () => {
    const document = PreparedDocumentSchema.parse(
      read('tests/fixtures/contract-cases/ordered-content.json'),
    );
    const asset = document.assets[0];
    if (!asset) {
      throw new Error('Expected asset');
    }
    asset.dataUrl = 'https://example.com/remote.png';
    expect(() =>
      renderToStaticMarkup(createElement(PreparedFormulaSheet, { document })),
    ).toThrow();
  });
  test('requires a repeated placement location rather than inventing its definition location', () => {
    const payload = execution('two-panel-success');
    const section = payload.cso.sections[0];
    if (!section) {
      throw new Error('Expected root');
    }
    const repeated = section.items.find((item) => item.kind === 'symbolRef');
    if (!repeated) {
      throw new Error('Expected repeated placement');
    }
    repeated.metadata = undefined;
    expect(() =>
      prepareExecutionDocument({ execution: payload, assets: [] }),
    ).toThrow(DocumentPreparationError);
  });
  test.each(['literal', 'symbol', 'unused-symbol'])(
    'long additions distinguish %s formulas from substitution',
    (mode) => {
      const document = PreparedDocumentSchema.parse(
        read(
          'tests/integration/fixtures/demo-preservation/synthetic-pagination.prepared.json',
        ),
      );
      const item = document.sections
        .flatMap((section) => section.items)
        .find((item) => item.kind === 'symbol');
      if (item?.kind !== 'symbol') throw new Error('Expected long addition');
      const literal = item.symbol.valueTree.nodes.find(
        (node) => node.mode === 'LITERAL',
      );
      if (!literal) throw new Error('Expected literal term');
      if (mode !== 'literal') {
        const id = '["symbol","root","addition-input"]';
        document.detachedSymbols.push({
          id,
          glyph: 'input',
          valueTree: {
            rootKey: 'value',
            nodes: [
              {
                key: 'value',
                mode: 'LITERAL',
                literal: { kind: 'number', value: 123 },
              },
            ],
            result: { kind: 'number', value: 123 },
          },
        });
        if (mode === 'symbol')
          item.symbol.valueTree.nodes = item.symbol.valueTree.nodes.map(
            (node) =>
              node.key === literal.key
                ? { key: node.key, mode: 'SYMBOL', symbol: { id } }
                : node,
          );
        else
          item.symbol.valueTree.nodes.push({
            key: 'unused',
            mode: 'SYMBOL',
            symbol: { id },
          });
      }
      const html = renderToStaticMarkup(
        createElement(PreparedFormulaSheet, { document }),
      );
      expect(html.match(/aria-label="Substitution"/g)).toHaveLength(2);
      expect(html.match(/aria-label="Formula"/g) ?? []).toHaveLength(
        mode === 'symbol' ? 2 : 0,
      );
      if (mode === 'symbol') {
        expect(html).toContain('input');
        expect(html).toContain('123');
      }
    },
  );
  test('wrapped addition retains parentheses around a right-nested addition', () => {
    const document = PreparedDocumentSchema.parse(
      read(
        'tests/integration/fixtures/demo-preservation/synthetic-pagination.prepared.json',
      ),
    );
    const symbol = document.sections
      .flatMap((section) => section.items)
      .find((item) => item.kind === 'symbol');
    if (symbol?.kind !== 'symbol') {
      throw new Error('Expected synthetic formula');
    }
    const root = symbol.symbol.valueTree.nodes.find(
      (node) => node.key === 'a26',
    );
    if (!root?.funcArgs) {
      throw new Error('Expected addition');
    }
    root.funcArgs[1] = { key: 'a3' };
    symbol.symbol.valueTree.result = { kind: 'number', value: 331 };
    const html = renderToStaticMarkup(
      createElement(PreparedFormulaSheet, { document }),
    );
    expect(html.match(/<mo>\(<\/mo>/g)?.length).toBeGreaterThanOrEqual(2);
  });
  test('preserves authored section metadata', () => {
    const payload = execution('single-success');
    const section = payload.cso.sections[0];
    if (!section?.metadata) {
      throw new Error('Expected section metadata');
    }
    const authored = JSON.parse(
      '{"designBasis":"Uniform section, no openings","sourceApproval":"DB, historical","nested":{"factors":[1,null,true]},"__proto__":{"meaning":"ordinary JSON data"}}',
    );
    section.metadata = { ...section.metadata, ...authored };
    const document = prepareExecutionDocument({
      execution: payload,
      assets: [],
    });
    expect(document.sections[0]?.metadata).toEqual(authored);

    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });
  test.each([{ audit: { approvedBy: 'DB' } }, { status: 'approved' }])(
    'attributes nested or value-based review metadata as historical: %j',
    (metadata) => {
      const payload = execution('single-success');
      payload.cso.sections[0].metadata = {
        ...payload.cso.sections[0].metadata,
        ...metadata,
      };
      const document = prepareExecutionDocument({
        execution: payload,
        assets: [],
      });

      expect(JSON.parse(JSON.stringify(document))).toEqual(document);
    },
  );
  test.each(['execution-v1', 'legacy-cso'] as const)(
    'rejects display-colliding symbol definitions through %s preparation',
    (mode) => {
      const payload = execution('single-success');
      expect(payload.authoring).toBeUndefined();
      const definitions = payload.cso.sections[0]?.items.filter(
        (item) => item.kind === 'symbol',
      );
      const first = definitions?.[0];
      const second = definitions?.[1];
      if (first?.kind !== 'symbol' || second?.kind !== 'symbol') {
        throw new Error('Expected two symbol definitions');
      }
      first.symbol.glyph = 'times';
      second.symbol.glyph = 'xx';

      let caught: unknown;
      try {
        if (mode === 'legacy-cso') {
          prepareLegacyDocument({
            cso: payload.cso,
            fixtureId: 'notation-v1',
            fixtureSha256: payload.entry.sourceHash,
            assets: [],
            manifest: { manifestVersion: '1', entries: [] },
          });
        } else {
          prepareExecutionDocument({ execution: payload, assets: [] });
        }
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(DocumentPreparationError);
      if (!(caught instanceof DocumentPreparationError)) {
        throw new Error('Expected document preparation failure');
      }
      expect(caught.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'DUPLICATE_GLYPH',
            symbolId: second.symbol.id,
          }),
        ]),
      );
    },
  );
  test('rejects a display collision in a directly supplied prepared document', () => {
    const document = prepareExecutionDocument({
      execution: execution('single-success'),
      assets: [],
    });
    const definitions = document.sections.flatMap((section) =>
      section.items.filter((item) => item.kind === 'symbol'),
    );
    const first = definitions[0];
    const second = definitions[1];
    if (first?.kind !== 'symbol' || second?.kind !== 'symbol') {
      throw new Error('Expected two prepared symbol definitions');
    }
    first.symbol.glyph = 'times';
    second.symbol.glyph = 'xx';

    const result = PreparedDocumentSchema.safeParse(document);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            params: expect.objectContaining({
              diagnosticCode: 'DUPLICATE_GLYPH',
              symbolId: second.symbol.id,
            }),
          }),
        ]),
      );
    }
    expect(() =>
      renderToStaticMarkup(createElement(PreparedFormulaSheet, { document })),
    ).toThrow();
  });
});
