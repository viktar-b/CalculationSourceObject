import { expect, test } from 'vitest';
import {
  reproducePredicate,
  usedReferenceNames,
} from '../src/verification/branches.ts';

const outputKey = JSON.stringify(['child', 'result']);
const direct = [
  {
    key: 'n1',
    mode: 'FUNCTION',
    funcSpec: { id: 'fg.gt' },
    funcArgs: [{ key: 'n2' }, { key: 'n3' }],
  },
  {
    key: 'n2',
    mode: 'SYMBOL',
    ref: { kind: 'output', call: 'child', output: 'result' },
  },
  { key: 'n3', mode: 'LITERAL', literal: { kind: 'number', value: 0 } },
];

test('predicate reproduction resolves the exact call binding and public output', () => {
  expect(reproducePredicate(direct, 'n1', new Map([[outputKey, 2]]))).toEqual({
    value: true,
    usedKeys: ['n1', 'n2', 'n3'],
  });
  expect(
    reproducePredicate(
      direct,
      'n1',
      new Map([[JSON.stringify(['other', 'result']), 2]]),
    ),
  ).toBeUndefined();
  expect(usedReferenceNames(direct, 'n1', new Map([[outputKey, 2]]))).toEqual([
    outputKey,
  ]);
});

test('short-circuited output references do not become applicability dependencies', () => {
  const lazy = [
    {
      key: 'root',
      mode: 'FUNCTION',
      funcSpec: { id: 'fg.or' },
      funcArgs: [{ key: 'guard' }, { key: 'n1' }],
    },
    {
      key: 'guard',
      mode: 'FUNCTION',
      funcSpec: { id: 'fg.le' },
      funcArgs: [{ key: 'width' }, { key: 'n3' }],
    },
    { key: 'width', mode: 'SYMBOL', ref: { kind: 'name', name: 'width' } },
    ...direct,
  ];
  const values = new Map([
    ['width', -1],
    [outputKey, -1],
  ]);
  expect(reproducePredicate(lazy, 'root', values)).toEqual({
    value: true,
    usedKeys: ['guard', 'n3', 'root', 'width'],
  });
  expect(usedReferenceNames(lazy, 'root', values)).toEqual(['width']);
  values.set('width', 1);
  expect(usedReferenceNames(lazy, 'root', values)).toEqual([
    'width',
    outputKey,
  ]);
});

test('conditional numeric operands preserve their selected output dependency', () => {
  const conditional = [
    {
      key: 'n1',
      mode: 'FUNCTION',
      funcSpec: { id: 'fg.gt' },
      funcArgs: [{ key: 'selected' }, { key: 'n3' }],
    },
    {
      key: 'selected',
      mode: 'FUNCTION',
      funcSpec: { id: 'fg.cnd' },
      funcArgs: [{ key: 'guard' }, { key: 'n2' }, { key: 'one' }],
    },
    {
      key: 'guard',
      mode: 'FUNCTION',
      funcSpec: { id: 'fg.ge' },
      funcArgs: [{ key: 'width' }, { key: 'n3' }],
    },
    { key: 'width', mode: 'SYMBOL', ref: { kind: 'name', name: 'width' } },
    { key: 'one', mode: 'LITERAL', literal: { kind: 'number', value: 1 } },
    ...direct.slice(1),
  ];
  const values = new Map([
    ['width', -1],
    [outputKey, -1],
  ]);
  expect(reproducePredicate(conditional, 'n1', values)).toEqual({
    value: true,
    usedKeys: ['guard', 'n1', 'n3', 'one', 'selected', 'width'],
  });
  expect(usedReferenceNames(conditional, 'n1', values)).toEqual(['width']);
});

test.each([
  [-1, -1, false],
  [-1, 1, true],
  [1, -1, true],
  [1, 1, false],
] satisfies [number, number, boolean][])(
  'NOT/XOR track eager operands and lazy dependencies at %s, %s',
  (width, child, expected) => {
    const nodes = [
      {
        key: 'root',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.xor' },
        funcArgs: [{ key: 'guard' }, { key: 'n1' }],
      },
      {
        key: 'guard',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.gt' },
        funcArgs: [{ key: 'width' }, { key: 'n3' }],
      },
      { key: 'width', mode: 'SYMBOL', ref: { kind: 'name', name: 'width' } },
      {
        key: 'not',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.not' },
        funcArgs: [{ key: 'root' }],
      },
      ...direct,
    ];
    const values = new Map([
      ['width', width],
      [outputKey, child],
    ]);
    expect(reproducePredicate(nodes, 'root', values)).toEqual({
      value: expected,
      usedKeys: ['guard', 'n1', 'n2', 'n3', 'root', 'width'],
    });
    expect(reproducePredicate(nodes, 'not', values)?.value).toBe(!expected);
    expect(usedReferenceNames(nodes, 'root', values)).toEqual([
      'width',
      outputKey,
    ]);
    expect(usedReferenceNames(nodes, 'not', values)).toEqual([
      'width',
      outputKey,
    ]);
  },
);
