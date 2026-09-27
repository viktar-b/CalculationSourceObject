import type { Diagnostic } from '@cs-object/core';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly diagnostics: Diagnostic[] = [],
  ) {
    super(message);
  }
}
