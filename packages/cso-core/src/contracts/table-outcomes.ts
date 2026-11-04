import { z } from 'zod';
import { NonemptyStringSchema } from './common.ts';

const resultFields = {
  invocationId: NonemptyStringSchema,
  callPath: NonemptyStringSchema.optional(),
};
const BooleanResultSchema = z.strictObject({
  ...resultFields,
  value: z.boolean(),
  reasons: z.array(NonemptyStringSchema).min(1).optional(),
});
const BooleanCellsSchema = z.array(
  z.strictObject({
    heading: NonemptyStringSchema,
    results: z.array(BooleanResultSchema),
  }),
);
const rowFields = {
  id: NonemptyStringSchema,
  label: NonemptyStringSchema,
  predicateText: z.string(),
  predicateSymbolId: NonemptyStringSchema.optional(),
};
export const PreparedOutcomeRowSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('boolean'),
    ...rowFields,
    cells: BooleanCellsSchema,
  }),
  z.strictObject({
    kind: z.literal('check'),
    ...rowFields,
    cells: BooleanCellsSchema,
  }),
  z.strictObject({
    kind: z.literal('applicability'),
    ...rowFields,
    cells: BooleanCellsSchema,
  }),
  z.strictObject({
    kind: z.literal('branch'),
    ...rowFields,
    cells: z.array(
      z.strictObject({
        heading: NonemptyStringSchema,
        results: z.array(
          z.strictObject({
            ...resultFields,
            value: NonemptyStringSchema,
            conditionHolds: z.boolean(),
            symbolId: NonemptyStringSchema,
            nodeKey: NonemptyStringSchema,
            quantitySymbolId: NonemptyStringSchema,
            branchSymbolId: NonemptyStringSchema,
            conditionSymbolId: NonemptyStringSchema,
          }),
        ),
      }),
    ),
  }),
]);
export type PreparedOutcomeRow = z.infer<typeof PreparedOutcomeRowSchema>;
