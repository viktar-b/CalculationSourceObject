import {
  CalculationSourceObjectSchema,
  PreparedDocumentSchema,
} from '@viktar-b/cso-core';
import {
  PreparedFormulaSheet,
  prepareLegacyDocument,
} from '@viktar-b/cso-react';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

Object.assign(globalThis, { React });
const source = () =>
  CalculationSourceObjectSchema.parse({
    schemaVersion: '1.0.0',
    title: 'Context selection',
    source: {
      id: 'context',
      metadata: {
        purpose: 'Check a repeated calculation',
        assumptions: [
          null,
          '',
          { approvedBy: 'Historical approval' },
          false,
          0,
          { 'path/~': 'Escaped key' },
        ],
      },
    },
    rootSectionIds: ['root'],
    sections: [
      {
        id: 'root',
        title: 'Calculation',
        metadata: { limitations: 'Root qualification' },
        items: [
          {
            kind: 'symbol',
            symbol: {
              id: 'result',
              glyph: 'r',
              metadata: { description: 'Shared definition' },
              valueTree: {
                rootKey: 'active',
                nodes: [
                  { key: 'active', mode: 'SYMBOL', symbol: { id: 'width' } },
                  { key: 'unused', mode: 'SYMBOL', symbol: { id: 'archive' } },
                ],
                result: { kind: 'number', value: 2 },
              },
            },
            metadata: { explanation: 'First placement' },
          },
          {
            kind: 'section',
            id: 'child',
            metadata: { explanation: 'Child placement' },
          },
          {
            kind: 'symbolRef',
            id: 'result',
            metadata: { explanation: 'Second placement' },
          },
          {
            kind: 'text',
            id: 'note',
            metadata: { note: 'Text placement' },
            text: { content: 'A note', metadata: { credit: 'Text credit' } },
          },
        ],
      },
      {
        id: 'child',
        title: 'Details',
        metadata: { assumptions: ['Child assumption'] },
        items: [],
      },
    ],
    detachedItems: [
      {
        kind: 'symbol',
        symbol: {
          id: 'width',
          glyph: 'w',
          description: 'Design width',
          unit: 'mm',
          metadata: {
            limitations: 'Uniform widths only',
            approvedBy: 'Hidden review',
          },
          valueTree: {
            rootKey: 'active',
            nodes: [{ key: 'active', mode: 'SYMBOL', symbol: { id: 'basis' } }],
            result: { kind: 'number', value: 2 },
          },
        },
      },
      {
        kind: 'symbol',
        symbol: {
          id: 'basis',
          glyph: 'b',
          description: 'Reference width',
          valueTree: {
            rootKey: 'n',
            nodes: [
              {
                key: 'n',
                mode: 'LITERAL',
                literal: { kind: 'number', value: 2 },
              },
            ],
            result: { kind: 'number', value: 2 },
          },
        },
      },
      {
        kind: 'symbol',
        symbol: {
          id: 'archive',
          glyph: 'a',
          description: 'Inactive archive',
          valueTree: {
            rootKey: 'n',
            nodes: [
              {
                key: 'n',
                mode: 'LITERAL',
                literal: { kind: 'number', value: 2 },
              },
            ],
            result: { kind: 'number', value: 2 },
          },
        },
      },
    ],
  });
const prepare = (cso = source()) =>
  prepareLegacyDocument({
    cso,
    fixtureId: 'synthetic-context',
    fixtureSha256: 'a'.repeat(64),
    assets: [],
    manifest: { manifestVersion: '1', entries: [] },
    historicalReviews: [
      {
        scope: 'historical',
        originalSource: {
          id: 'older',
          sha256: 'a'.repeat(64),
          format: 'synthetic',
        },
        attribution: 'Historical only',
        originalFields: {
          source: { metadata: { purpose: 'Wrong historical purpose' } },
        },
      },
    ],
  });
const render = (document: ReturnType<typeof prepare>) =>
  renderToStaticMarkup(createElement(PreparedFormulaSheet, { document }));

describe('prepared engineering context', () => {
  test('places shared definitions, local context and transitive unplaced operands together', () => {
    const cso = source();
    const before = structuredClone(cso);
    const document = prepare(cso);
    expect(cso).toEqual(before);
    const [first, child, repeated, text] = document.sections[0].items;
    expect(first.context.map((field) => field.value)).toEqual([
      {
        kind: 'text',
        value: 'Shared definition',
        path: '/sections/0/items/0/symbol/metadata/description',
      },
      {
        kind: 'text',
        value: 'First placement',
        path: '/sections/0/items/0/contextSource/metadata/explanation',
      },
    ]);
    expect(repeated.context.map((field) => field.value)).toContainEqual({
      kind: 'text',
      value: 'Second placement',
      path: '/sections/0/items/2/contextSource/metadata/explanation',
    });
    expect(child.context[0].label).toBe('Explanation');
    expect(text.context.map((field) => field.label)).toEqual([
      'Note',
      'Credit',
    ]);
    if (first.kind !== 'symbol' || repeated.kind !== 'symbolRef') {
      throw new Error('Expected symbol placements');
    }
    expect(first.operands.map((operand) => operand.symbolId)).toEqual([
      'width',
      'basis',
    ]);
    expect(repeated.operands).toEqual(first.operands);
    const html = render(document);
    expect(html.match(/Uniform widths only/g)).toHaveLength(2);
    expect(html).toContain('Child assumption');
    for (const hidden of [
      'Hidden review',
      'Inactive archive',
      'Historical approval',
      'Wrong historical purpose',
    ]) {
      expect(html).not.toContain(hidden);
    }
  });

  test('keeps exact HTML after serialization and history removal, replacement or reordering', () => {
    const document = prepare();
    const html = render(document);
    const roundTrip = PreparedDocumentSchema.parse(
      JSON.parse(JSON.stringify(document)),
    );
    expect(render(roundTrip)).toBe(html);
    for (const history of [
      [],
      [...document.historicalReviews].reverse(),
      document.historicalReviews.slice(1),
    ]) {
      expect(render({ ...roundTrip, historicalReviews: history })).toBe(html);
    }
  });

  test('retains original array positions, escaped keys, false and zero in selected source pointers', () => {
    const document = prepare();
    const html = render(document);
    expect(html).toContain(
      'data-engineering-value="/sourceMetadata/assumptions/3">false',
    );
    expect(html).toContain(
      'data-engineering-value="/sourceMetadata/assumptions/4">0',
    );
    expect(html).toContain(
      'data-engineering-value="/sourceMetadata/assumptions/5/path~1~0">Escaped key',
    );
    expect(document.sourceMetadata?.assumptions).toEqual(
      source().source.metadata?.assumptions,
    );
  });

  test('rejects stale source pointers, changed displayed values and historical-review pointers', () => {
    for (const change of [
      (document: ReturnType<typeof prepare>) => {
        document.sourceMetadata = {
          ...document.sourceMetadata,
          purpose: 'Changed source',
        };
      },
      (document: ReturnType<typeof prepare>) => {
        document.context[0].value = {
          kind: 'text',
          value: 'Wrong value',
          path: '/sourceMetadata/purpose',
        };
      },
      (document: ReturnType<typeof prepare>) => {
        document.context[0].path = '/sourceMetadata/missing';
      },
      (document: ReturnType<typeof prepare>) => {
        document.context[0].path =
          '/historicalReviews/0/originalFields/source/metadata/purpose';
      },
    ]) {
      const document = prepare();
      change(document);
      expect(PreparedDocumentSchema.safeParse(document).success).toBe(false);
      expect(() => render(document)).toThrow();
    }
  });

  test('reprepares operand context when an operand receives its own placement', () => {
    const cso = source();
    cso.sections[0].items.push({ kind: 'symbolRef', id: 'basis' });
    const document = prepare(cso);
    const first = document.sections[0].items[0];
    if (first.kind !== 'symbol') {
      throw new Error('Expected formula');
    }
    expect(first.operands.map((operand) => operand.symbolId)).toEqual([
      'width',
    ]);
    expect(render(document).match(/Reference width/g)).toHaveLength(1);
  });

  test('rejects old documents and incomplete context instead of silently reconstructing it', () => {
    const document = prepare();
    expect(
      PreparedDocumentSchema.safeParse({ ...document, documentVersion: '1' })
        .success,
    ).toBe(false);
    expect(
      PreparedDocumentSchema.safeParse({ ...document, context: undefined })
        .success,
    ).toBe(false);
    const first = document.sections[0].items[0];
    if (first.kind !== 'symbol') {
      throw new Error('Expected formula');
    }
    first.operands.push({ symbolId: 'missing', context: [] });
    expect(PreparedDocumentSchema.safeParse(document).success).toBe(false);
  });
});
