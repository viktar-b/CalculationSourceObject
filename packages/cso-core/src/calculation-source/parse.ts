import type { core } from 'zod';
import { CalculationSourceObjectSchema } from './object-schema.ts';
import type { CalculationSourceObject } from './object-schema.ts';

export class CalculationSourceValidationError extends Error {
  readonly issues: core.$ZodIssue[];
  readonly sourceName?: string;

  constructor(issues: core.$ZodIssue[], sourceName?: string) {
    const label = sourceName ? ` for ${sourceName}` : '';
    super(
      `Invalid calculation source JSON${label}:\n${issues
        .map(
          (issue) => `- ${issue.path.join('.') || '<root>'}: ${issue.message}`,
        )
        .join('\n')}`,
    );
    this.name = 'CalculationSourceValidationError';
    this.issues = issues;
    this.sourceName = sourceName;
  }
}

export type SafeParseCalculationSourceJsonResult =
  | {
      readonly success: true;
      readonly data: CalculationSourceObject;
    }
  | {
      readonly success: false;
      readonly error: CalculationSourceValidationError;
    };

export const parseCalculationSourceJson = (
  source: unknown,
  sourceName?: string,
): CalculationSourceObject => {
  const result = CalculationSourceObjectSchema.safeParse(source);

  if (!result.success) {
    throw new CalculationSourceValidationError(result.error.issues, sourceName);
  }

  return result.data;
};

export const safeParseCalculationSourceJson = (
  source: unknown,
  sourceName?: string,
): SafeParseCalculationSourceJsonResult => {
  const result = CalculationSourceObjectSchema.safeParse(source);

  if (!result.success) {
    return {
      success: false,
      error: new CalculationSourceValidationError(
        result.error.issues,
        sourceName,
      ),
    };
  }

  return {
    success: true,
    data: result.data,
  };
};
