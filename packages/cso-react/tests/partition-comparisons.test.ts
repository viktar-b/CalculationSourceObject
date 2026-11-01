import { describe, expect, it } from 'vitest';
import {
  partitionColumnAxis,
  partitionRowAxis,
} from '../src/formula-sheet/partition-comparisons.ts';

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

describe('partitionRowAxis', () => {
  it('repeats a group banner on the next slice and keeps authored order', () => {
    expect(
      partitionRowAxis(
        [
          { height: 20, repeat: true },
          { height: 40 },
          { height: 40 },
          { height: 20, repeat: true },
          { height: 40 },
        ],
        30,
        100,
      ),
    ).toEqual({
      groups: [
        [0, 1],
        [0, 2],
        [3, 4],
      ],
    });
  });

  it('uses a fresh page when the remainder cannot hold the next row', () => {
    expect(partitionRowAxis([{ height: 30 }, { height: 30 }], 20, 100, 55)).toEqual({
      groups: [[0], [1]],
    });
    expect(partitionRowAxis([{ height: 40 }, { height: 40 }], 20, 100, 50)).toEqual({
      groups: [[0, 1]],
    });
  });

  it('rejects one row that cannot fit with its repeated headings', () => {
    expect(
      partitionRowAxis([{ height: 80 }], 30, 100).unfit,
    ).toEqual({
      row: 0,
      required: 110,
      available: 100,
    });
  });
});
