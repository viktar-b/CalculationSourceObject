import { z } from 'zod';

export const NumericKindSchema = z.enum(['int', 'float']);
export type NumericKind = z.infer<typeof NumericKindSchema>;
/** Shared by contract adapters and independent arithmetic evaluation. */
export const numericValueIssue = (record: {
  readonly value: number;
  readonly numericKind?: NumericKind;
}): { code: string; message: string } | undefined => {
  if (!Number.isFinite(record.value)) {
    return {
      code: 'NON_FINITE_NUMBER',
      message: `Expected a finite real number, received ${String(record.value)}.`,
    };
  }
  if (record.numericKind === 'int' && !Number.isInteger(record.value)) {
    return {
      code: 'NUMERIC_KIND_MISMATCH',
      message: 'Python int evidence requires an integer.',
    };
  }
  if (
    record.numericKind !== 'float' &&
    Number.isInteger(record.value) &&
    !Number.isSafeInteger(record.value)
  ) {
    return {
      code: 'UNSUPPORTED_NUMERIC_RANGE',
      message: `Integer-valued number ${String(record.value)} is outside the supported exact range.`,
    };
  }
  return undefined;
};

/** Extend with safeExtend so every enclosing record retains the numeric policy. */
export const NumericValueSchema = z
  .strictObject({
    value: z.number(),
    numericKind: NumericKindSchema.optional(),
  })
  .superRefine((record, ctx) => {
    const issue = numericValueIssue(record);
    if (issue)
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: issue.message,
        params: { diagnosticCode: issue.code },
      });
  });

/** A bare number has no evidence permitting the wider floating-point range. */
export const SupportedNumberSchema = z.number().superRefine((value, ctx) => {
  const issue = numericValueIssue({ value });
  if (issue)
    ctx.addIssue({
      code: 'custom',
      message: issue.message,
      params: { diagnosticCode: issue.code },
    });
});
