import { z } from 'zod';

export const NumericKindSchema = z.enum(['int', 'float']);
export type NumericKind = z.infer<typeof NumericKindSchema>;
export const numericValueShape = {
  value: z.number().finite(),
  numericKind: NumericKindSchema.optional(),
};

/** Missing kind retains the conservative range policy of older captures. */
export const refineNumericValue = (
  record: { readonly value: number; readonly numericKind?: NumericKind },
  ctx: z.RefinementCtx,
): void => {
  if (record.numericKind === 'int' && !Number.isInteger(record.value)) {
    ctx.addIssue({
      code: 'custom',
      path: ['value'],
      message: 'Python int evidence requires an integer',
      params: { diagnosticCode: 'NUMERIC_KIND_MISMATCH' },
    });
  } else if (
    record.numericKind !== 'float' &&
    Number.isInteger(record.value) &&
    !Number.isSafeInteger(record.value)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['value'],
      message: 'Integer exceeds the supported exact range',
      params: { diagnosticCode: 'UNSUPPORTED_NUMERIC_RANGE' },
    });
  }
};
