import type { core } from 'zod';
import { ValueTreeJsonDocumentSchema } from './schema.ts';
import type { ValueTreeJsonDocument } from './types.ts';

export class ValueTreeJsonValidationError extends Error {
  readonly issues: core.$ZodIssue[];
  readonly sourceName?: string;

  constructor(issues: core.$ZodIssue[], sourceName?: string) {
    const label = sourceName ? ` for ${sourceName}` : '';
    super(
      `Invalid value-tree JSON${label}:\n${issues
        .map(
          (issue) => `- ${issue.path.join('.') || '<root>'}: ${issue.message}`,
        )
        .join('\n')}`,
    );
    this.name = 'ValueTreeJsonValidationError';
    this.issues = issues;
    this.sourceName = sourceName;
  }
}

export type SafeParseValueTreeJsonResult =
  | {
      readonly success: true;
      readonly data: ValueTreeJsonDocument;
    }
  | {
      readonly success: false;
      readonly error: ValueTreeJsonValidationError;
    };

export const parseValueTreeJson = (
  source: unknown,
  sourceName?: string,
): ValueTreeJsonDocument => {
  const result = ValueTreeJsonDocumentSchema.safeParse(source);

  if (!result.success) {
    throw new ValueTreeJsonValidationError(result.error.issues, sourceName);
  }

  return result.data;
};

export const safeParseValueTreeJson = (
  source: unknown,
  sourceName?: string,
): SafeParseValueTreeJsonResult => {
  const result = ValueTreeJsonDocumentSchema.safeParse(source);

  if (!result.success) {
    return {
      success: false,
      error: new ValueTreeJsonValidationError(result.error.issues, sourceName),
    };
  }

  return {
    success: true,
    data: result.data,
  };
};
