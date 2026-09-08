import { describe, expect, test } from 'vitest';
import { PreparedDocumentSchema } from '../src/contracts/document.ts';

const document = () =>
  PreparedDocumentSchema.parse({
    documentVersion: '2',
    title: 'Synthetic context contract',
    source: {
      kind: 'legacy',
      fixtureId: 'context',
      fixtureSha256: 'a'.repeat(64),
    },
    sourceMetadata: {
      notes: [false, 0, { 'a/~': 'Exact source' }],
      ['__proto__']: 'Own source field',
    },
    context: [
      {
        label: 'Notes',
        path: '/sourceMetadata/notes',
        value: {
          kind: 'list',
          items: [
            { kind: 'text', path: '/sourceMetadata/notes/0', value: false },
            { kind: 'text', path: '/sourceMetadata/notes/1', value: 0 },
            {
              kind: 'record',
              entries: [
                {
                  label: 'a/~',
                  value: {
                    kind: 'text',
                    path: '/sourceMetadata/notes/2/a~1~0',
                    value: 'Exact source',
                  },
                },
              ],
            },
          ],
        },
      },
    ],
    rootSectionIds: ['root'],
    sections: [
      {
        id: 'root',
        title: 'Root',
        sourcePlacementId: 'heading',
        context: [],
        items: [],
      },
    ],
    detachedSymbols: [],
    assets: [],
    historicalReviews: [],
  });

describe('prepared context contract', () => {
  test('validates nested scalar bindings and preserves them through JSON', () => {
    const value = document();
    expect(
      PreparedDocumentSchema.parse(JSON.parse(JSON.stringify(value))),
    ).toEqual(value);
  });
  test.each([
    '/sourceMetadata/notes/01',
    '/sourceMetadata/notes/2/a~2',
    '/sourceMetadata/constructor',
    '/sourceMetadata/missing',
    '/historicalReviews/0/originalFields/note',
    '/context/0/label',
  ])(
    'rejects unresolved, malformed, inherited or non-source pointer %s',
    (path) => {
      const value = document();
      value.context = [
        {
          label: 'Invalid binding',
          path,
          value: { kind: 'text', path, value: 'Wrong' },
        },
      ];
      expect(PreparedDocumentSchema.safeParse(value).success).toBe(false);
    },
  );
  test('uses own-key identity when a retained field has a prototype-like name', () => {
    const value = document();
    const path = '/sourceMetadata/__proto__';
    value.context = [
      {
        label: 'Own data',
        path,
        value: { kind: 'text', path, value: 'Own source field' },
      },
    ];
    expect(PreparedDocumentSchema.safeParse(value).success).toBe(true);
  });
  test('reports a context binding diagnostic for changed display values', () => {
    const value = document();
    value.context[0].value = {
      kind: 'text',
      path: '/sourceMetadata/notes/1',
      value: 4,
    };
    const result = PreparedDocumentSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected invalid binding');
    }
    expect(
      result.error.issues.some(
        (issue) =>
          issue.code === 'custom' &&
          issue.params?.diagnosticCode === 'DOCUMENT_CONTEXT_SOURCE_MISMATCH',
      ),
    ).toBe(true);
  });
  test('rejects a leaf borrowed from a different retained field', () => {
    const value = document();
    value.context[0].value = {
      kind: 'text',
      path: '/sourceMetadata/__proto__',
      value: 'Own source field',
    };
    expect(PreparedDocumentSchema.safeParse(value).success).toBe(false);
  });
});
