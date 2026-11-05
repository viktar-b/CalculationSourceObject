import { expect, test } from 'vitest';
import { PreparedOutcomeRowSchema } from '../src/contracts/table-outcomes.ts';

const row = {
  kind: 'boolean',
  id: 'positive-width',
  label: 'Width is positive',
  predicateText: 'w_{case} > 0',
  cells: [
    { heading: 'Zero', results: [{ invocationId: 'root/zero', value: false }] },
    {
      heading: 'Positive',
      results: [{ invocationId: 'root/positive', value: true }],
    },
    { heading: 'Missing', results: [] },
  ],
};
test('Boolean cells preserve true, false and missing as distinct states', () => {
  expect(PreparedOutcomeRowSchema.parse(row)).toEqual(row);
  expect(
    PreparedOutcomeRowSchema.safeParse({
      ...row,
      cells: [
        { heading: 'Zero', results: [{ invocationId: 'root/zero', value: 0 }] },
      ],
    }).success,
  ).toBe(false);
  expect(
    PreparedOutcomeRowSchema.safeParse({
      ...row,
      cells: [
        {
          heading: 'Positive',
          results: [{ invocationId: 'root/positive', value: 1 }],
        },
      ],
    }).success,
  ).toBe(false);
});
test('engineering and applicability roles retain raw predicates when a verdict is inapplicable', () => {
  for (const kind of ['check', 'applicability']) {
    const condition = {
      ...row,
      kind,
      cells: [
        {
          heading: 'Negative',
          results: [
            {
              invocationId: 'root/negative',
              callPath: 'first',
              value: true,
              reasons: ['Width is nonnegative'],
            },
          ],
        },
      ],
    };
    expect(PreparedOutcomeRowSchema.parse(condition)).toEqual(condition);
  }
  expect(
    PreparedOutcomeRowSchema.safeParse({ ...row, kind: 'pass' }).success,
  ).toBe(false);
  expect(
    PreparedOutcomeRowSchema.safeParse({ ...row, kind: 'branch' }).success,
  ).toBe(false);
});
