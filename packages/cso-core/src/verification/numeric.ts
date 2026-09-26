import { numericValueIssue, type NumericKind } from '../contracts/numbers.ts';
import type { Comparison, Diagnostic } from '../contracts/common.ts';
import type { NumericPolicy } from '../contracts/reports.ts';

export type NumericResult =
  | {
      readonly ok: true;
      readonly value: number;
      readonly numericKind?: NumericKind;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly valueDisplay?: Diagnostic['valueDisplay'];
    };
export type NumericFailure = Extract<NumericResult, { readonly ok: false }>;
export type OperationValidationResult = { readonly ok: true } | NumericFailure;

export const numericPolicy: NumericPolicy = Object.freeze({
  absoluteTolerance: 1e-9,
  relativeTolerance: 1e-12,
  numberDomain: 'finite-real-typed-safe-integer',
});

const maximumSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
const minimumSafeInteger = -maximumSafeInteger;

function numberDisplay(value: number): NonNullable<Diagnostic['valueDisplay']> {
  return {
    kind:
      Number.isFinite(value) && Number.isInteger(value)
        ? 'python-int'
        : 'python-float',
    text: Object.is(value, -0) ? '-0' : String(value),
  };
}

function failure(
  code: string,
  message: string,
  valueDisplay?: Diagnostic['valueDisplay'],
): NumericFailure {
  if (valueDisplay === undefined) {
    return { ok: false, code, message };
  }
  return { ok: false, code, message, valueDisplay };
}

export function validateNumber(
  value: number,
  numericKind?: NumericKind,
): NumericResult {
  const issue = numericValueIssue({ value, numericKind });
  if (issue) {
    return failure(
      issue.code,
      issue.message,
      issue.code === 'NUMERIC_KIND_MISMATCH' ? undefined : numberDisplay(value),
    );
  }
  return {
    ok: true,
    value,
    ...(numericKind === undefined ? {} : { numericKind }),
  };
}

function unsafeInteger(value: bigint): NumericResult {
  const text = value.toString();
  return failure(
    'UNSUPPORTED_NUMERIC_RANGE',
    `Integer-valued operation result ${text} is outside the supported exact range.`,
    { kind: 'python-int', text },
  );
}

function validateExactInteger(
  value: bigint,
  binary64Value: number,
): NumericResult {
  if (value < minimumSafeInteger || value > maximumSafeInteger) {
    return unsafeInteger(value);
  }
  return { ok: true, value: binary64Value };
}

function add(left: number, right: number): NumericResult {
  if (Number.isInteger(left) && Number.isInteger(right)) {
    return validateExactInteger(BigInt(left) + BigInt(right), left + right);
  }
  return validateNumber(left + right);
}

function subtract(left: number, right: number): NumericResult {
  if (Number.isInteger(left) && Number.isInteger(right)) {
    return validateExactInteger(BigInt(left) - BigInt(right), left - right);
  }
  return validateNumber(left - right);
}

function multiply(left: number, right: number): NumericResult {
  if (Number.isInteger(left) && Number.isInteger(right)) {
    return validateExactInteger(BigInt(left) * BigInt(right), left * right);
  }
  return validateNumber(left * right);
}

function divide(left: number, right: number): NumericResult {
  if (right === 0) {
    return failure('DIVISION_BY_ZERO', 'Division by zero is not supported.');
  }
  return validateNumber(left / right);
}

function unitIntegerPower(base: number, exponent: number): number | undefined {
  if (base === 0) {
    return 0;
  }
  if (base === 1) {
    return 1;
  }
  if (base === -1) {
    return exponent % 2 === 0 ? 1 : -1;
  }
  return undefined;
}

function integerPower(base: number, exponent: number): NumericResult {
  if (exponent === 0) {
    return { ok: true, value: 1 };
  }
  const unitResult = unitIntegerPower(base, exponent);
  if (unitResult !== undefined) {
    return { ok: true, value: unitResult };
  }

  const factor = BigInt(base);
  let result = BigInt(1);
  for (let count = 0; count < exponent; count += 1) {
    result *= factor;
    if (result < minimumSafeInteger || result > maximumSafeInteger) {
      if (count + 1 === exponent) {
        return unsafeInteger(result);
      }
      const expression = `${base < 0 ? `(${base})` : String(base)} ** ${exponent}`;
      return failure(
        'UNSUPPORTED_NUMERIC_RANGE',
        `Exact result of ${base} raised to ${exponent} exceeds the supported range.`,
        { kind: 'unsupported', text: expression },
      );
    }
  }
  return validateExactInteger(result, base ** exponent);
}

function power(base: number, exponent: number): NumericResult {
  if (base === 0 && exponent < 0) {
    return failure(
      'ZERO_NEGATIVE_POWER',
      'Zero cannot be raised to a negative power.',
    );
  }
  if (base < 0 && !Number.isInteger(exponent)) {
    return failure(
      'NON_REAL_POWER',
      'A negative base raised to a non-integer power is not real.',
    );
  }
  if (
    !Object.is(base, -0) &&
    Number.isInteger(base) &&
    Number.isInteger(exponent) &&
    exponent >= 0
  ) {
    return integerPower(base, exponent);
  }
  return validateNumber(base ** exponent);
}

function squareRoot(value: number): NumericResult {
  if (value < 0) {
    return failure(
      'NEGATIVE_SQUARE_ROOT',
      'Square root of a negative number is not real.',
    );
  }
  return validateNumber(Math.sqrt(value));
}

function unaryMinus(value: number): NumericResult {
  return validateNumber(-value);
}

/** Python's one-argument round uses ties to even and returns an int. */
function roundInteger(value: number): number {
  const lower = Math.floor(value);
  const fraction = value - lower;
  const rounded =
    fraction < 0.5
      ? lower
      : fraction > 0.5
        ? lower + 1
        : lower % 2 === 0
          ? lower
          : lower + 1;
  return rounded === 0 ? 0 : rounded;
}

type Operation = {
  readonly arity: 0 | 1 | 2 | 3;
  readonly evaluate: (...operands: number[]) => NumericResult;
};
const booleanResult = (): NumericFailure =>
  failure('NONNUMERIC_FORMULA', 'Comparisons require a conditional test.');
const operations = new Map<string, Operation>([
  ['fg.add', { arity: 2, evaluate: add }],
  ['fg.subtract', { arity: 2, evaluate: subtract }],
  ['fg.multiply', { arity: 2, evaluate: multiply }],
  ['fg.divide', { arity: 2, evaluate: divide }],
  ['fg.pow', { arity: 2, evaluate: power }],
  ['fg.sqrt', { arity: 1, evaluate: squareRoot }],
  ['fg.uminus', { arity: 1, evaluate: unaryMinus }],
  ['fg.pi', { arity: 0, evaluate: () => validateNumber(Math.PI, 'float') }],
  [
    'fg.ceil',
    {
      arity: 1,
      evaluate: (value) => validateNumber(Math.ceil(value) || 0, 'int'),
    },
  ],
  [
    'fg.round',
    {
      arity: 1,
      evaluate: (value) => validateNumber(roundInteger(value), 'int'),
    },
  ],
  [
    'fg.max',
    {
      arity: 2,
      evaluate: (left, right) => validateNumber(left >= right ? left : right),
    },
  ],
  ['fg.lt', { arity: 2, evaluate: booleanResult }],
  ['fg.le', { arity: 2, evaluate: booleanResult }],
  ['fg.gt', { arity: 2, evaluate: booleanResult }],
  ['fg.ge', { arity: 2, evaluate: booleanResult }],
  [
    'fg.cnd',
    {
      arity: 3,
      evaluate: () =>
        failure(
          'INVALID_CONDITIONAL',
          'Conditional evaluation requires a formula graph.',
        ),
    },
  ],
]);

export function evaluateComparison(
  functionId: string,
  left: number,
  right: number,
): boolean | NumericFailure {
  switch (functionId) {
    case 'fg.lt':
      return left < right;
    case 'fg.le':
      return left <= right;
    case 'fg.gt':
      return left > right;
    case 'fg.ge':
      return left >= right;
    default:
      return failure(
        'INVALID_CONDITIONAL',
        'A conditional test requires one numeric comparison.',
      );
  }
}

function evaluateTypedOperation(
  functionId: string,
  operands: readonly number[],
  kinds: readonly NumericKind[],
): NumericResult {
  const [left, right] = operands;
  const integerOperands = kinds.every((kind) => kind === 'int');
  const withKind = (result: NumericResult, kind: NumericKind): NumericResult =>
    result.ok
      ? {
          ...result,
          value: kind === 'int' && result.value === 0 ? 0 : result.value,
          numericKind: kind,
        }
      : result;
  switch (functionId) {
    case 'fg.add':
      return integerOperands
        ? withKind(add(left, right), 'int')
        : validateNumber(left + right, 'float');
    case 'fg.subtract':
      return integerOperands
        ? withKind(subtract(left, right), 'int')
        : validateNumber(left - right, 'float');
    case 'fg.multiply':
      return integerOperands
        ? withKind(multiply(left, right), 'int')
        : validateNumber(left * right, 'float');
    case 'fg.divide':
      return right === 0
        ? divide(left, right)
        : validateNumber(left / right, 'float');
    case 'fg.pow':
      if ((left === 0 && right < 0) || (left < 0 && !Number.isInteger(right)))
        return power(left, right);
      return integerOperands && right >= 0
        ? withKind(power(left, right), 'int')
        : validateNumber(left ** right, 'float');
    case 'fg.sqrt':
      return left < 0
        ? squareRoot(left)
        : validateNumber(Math.sqrt(left), 'float');
    case 'fg.uminus':
      return validateNumber(
        kinds[0] === 'int' && left === 0 ? 0 : -left,
        kinds[0],
      );
    case 'fg.pi':
      return validateNumber(Math.PI, 'float');
    case 'fg.ceil':
      return validateNumber(Math.ceil(left) || 0, 'int');
    case 'fg.round':
      return validateNumber(roundInteger(left), 'int');
    case 'fg.max':
      return left >= right
        ? validateNumber(left, kinds[0])
        : validateNumber(right, kinds[1]);
    default:
      return booleanResult();
  }
}

type ResolvedOperation =
  | { readonly ok: true; readonly operation: Operation }
  | NumericFailure;

function resolveOperation(
  functionId: string,
  operandCount: number,
): ResolvedOperation {
  const operation = operations.get(functionId);
  if (operation === undefined) {
    return failure(
      'UNSUPPORTED_FUNCTION',
      `Function ${functionId} is outside the verified numeric subset.`,
    );
  }
  if (operandCount !== operation.arity) {
    return failure(
      'INVALID_FUNCTION_ARITY',
      `${functionId} expects ${operation.arity} operands, received ${operandCount}.`,
    );
  }
  return { ok: true, operation };
}

export function validateOperation(
  functionId: string,
  operandCount: number,
): OperationValidationResult {
  const resolved = resolveOperation(functionId, operandCount);
  return resolved.ok ? { ok: true } : resolved;
}

export function evaluateOperation(
  functionId: string,
  operands: readonly number[],
  numericKinds?: readonly (NumericKind | undefined)[],
): NumericResult {
  const resolved = resolveOperation(functionId, operands.length);
  if (!resolved.ok) {
    return resolved;
  }
  for (const [index, operand] of operands.entries()) {
    const validated = validateNumber(operand, numericKinds?.[index]);
    if (!validated.ok) {
      return validated;
    }
  }
  const kinds = numericKinds?.filter(
    (kind): kind is NumericKind => kind !== undefined,
  );
  if (kinds !== undefined && kinds.length === operands.length) {
    return evaluateTypedOperation(functionId, operands, kinds);
  }
  return resolved.operation.evaluate(...operands);
}

export function compareNumbers(
  actual: number,
  expected: number,
): { matches: boolean; comparison: Comparison } {
  const absoluteError = Math.abs(actual - expected);
  const effectiveTolerance = Math.max(
    numericPolicy.absoluteTolerance,
    numericPolicy.relativeTolerance *
      Math.max(Math.abs(actual), Math.abs(expected)),
  );
  return {
    matches: absoluteError <= effectiveTolerance,
    comparison: {
      actual,
      expected,
      absoluteError: Number.isFinite(absoluteError)
        ? absoluteError
        : 'overflow',
      absoluteTolerance: numericPolicy.absoluteTolerance,
      relativeTolerance: numericPolicy.relativeTolerance,
    },
  };
}
