import { assertNever } from '../shared/assertNever.ts';
import { formatNumerical } from '../shared/formatNumerical.ts';
import type { SheetLiteral } from './types.ts';

export const emptyLiteral = (): SheetLiteral => ({ kind: 'empty' });

export const sheetLiteralFromJsonValue = (
  value: number | string | boolean | null,
): SheetLiteral => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { kind: 'number', value };
  }

  if (typeof value === 'boolean') {
    return { kind: 'boolean', value };
  }

  if (typeof value === 'string') {
    const parsedNumber = Number(value);

    return value.trim() !== '' && Number.isFinite(parsedNumber)
      ? { kind: 'number', value: parsedNumber }
      : { kind: 'string', value };
  }

  return emptyLiteral();
};

export const sheetLiteralToDraft = (literal: SheetLiteral): string => {
  switch (literal.kind) {
    case 'boolean':
      return literal.value ? 'true' : 'false';
    case 'empty':
      return '';
    case 'number':
      return `${literal.value}`;
    case 'string':
      return literal.value;
    default:
      return assertNever(literal);
  }
};

export const sheetLiteralToDisplayString = (
  literal: SheetLiteral | undefined | null,
): string => {
  switch (literal?.kind) {
    case undefined:
    case null:
    case 'empty':
      return 'NaN';
    case 'boolean':
      return literal.value ? 'true' : 'false';
    case 'number':
      return formatNumerical(literal.value);
    case 'string':
      return `"${literal.value}"`;
    default:
      return assertNever(literal);
  }
};

export const isSheetLiteralEmpty = (
  literal: SheetLiteral | undefined | null,
): boolean => literal?.kind === undefined || literal.kind === 'empty';
