import { describe, expect, it } from 'vitest';
import { partitionColumnAxis } from '../src/formula-sheet/partition-comparisons.ts';

describe('partitionColumnAxis', () => {
  it('keeps authored order and finishes one fitting group before the next', () => {
    expect(partitionColumnAxis([40, 40, 40], 20, 100)).toEqual({
      groups: [[0, 1], [2]],
    });
  });

  it('honors a cap without exceeding the measured width', () => {
    expect(partitionColumnAxis([20, 20, 20, 20], 30, 200, 2)).toEqual({
      groups: [
        [0, 1],
        [2, 3],
      ],
    });
    expect(partitionColumnAxis([30, 30, 30], 10, 80, 3)).toEqual({
      groups: [[0, 1], [2]],
    });
  });

  it('rejects one data column that cannot fit with its labels', () => {
    expect(partitionColumnAxis([80, 20], 30, 100).unfit).toEqual({
      column: 0,
      required: 110,
      available: 100,
    });
  });
});
