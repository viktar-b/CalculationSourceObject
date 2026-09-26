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

export type ValueRole = 'number' | 'comparison';
type TypedEvaluation = (
  values: readonly number[],
  kinds: readonly NumericKind[],
) => NumericResult;
type Operation =
  | {
      readonly kind: 'numeric';
      readonly operands: readonly ValueRole[];
      readonly evaluate: (...values: number[]) => NumericResult;
      readonly typed: TypedEvaluation;
    }
  | {
      readonly kind: 'comparison';
      readonly operands: readonly ValueRole[];
      readonly compare: (left: number, right: number) => boolean;
    }
  | { readonly kind: 'conditional'; readonly operands: readonly ValueRole[] };

const withKind = (result: NumericResult, kind: NumericKind): NumericResult =>
  result.ok
    ? {
        ...result,
        value: kind === 'int' && result.value === 0 ? 0 : result.value,
        numericKind: kind,
      }
    : result;
const binary = (
  exact: (a: number, b: number) => NumericResult,
  approximate: (a: number, b: number) => number,
): Operation => ({
  kind: 'numeric',
  operands: ['number', 'number'],
  evaluate: exact,
  typed: ([left, right], kinds) =>
    kinds.every((kind) => kind === 'int')
      ? withKind(exact(left, right), 'int')
      : validateNumber(approximate(left, right), 'float'),
});
/** Own operation roles and evaluation together; rendering has a broader vocabulary. */
const operations = new Map<string, Operation>([
  ['fg.add', binary(add, (a, b) => a + b)],
  ['fg.subtract', binary(subtract, (a, b) => a - b)],
  ['fg.multiply', binary(multiply, (a, b) => a * b)],
  [
    'fg.divide',
    {
      kind: 'numeric',
      operands: ['number', 'number'],
      evaluate: divide,
      typed: ([a, b]) =>
        b === 0 ? divide(a, b) : validateNumber(a / b, 'float'),
    },
  ],
  [
    'fg.pow',
    {
      kind: 'numeric',
      operands: ['number', 'number'],
      evaluate: power,
      typed: ([a, b], kinds) => {
        if ((a === 0 && b < 0) || (a < 0 && !Number.isInteger(b)))
          return power(a, b);
        return kinds.every((kind) => kind === 'int') && b >= 0
          ? withKind(power(a, b), 'int')
          : validateNumber(a ** b, 'float');
      },
    },
  ],
  [
    'fg.sqrt',
    {
      kind: 'numeric',
      operands: ['number'],
      evaluate: squareRoot,
      typed: ([a]) =>
        a < 0 ? squareRoot(a) : validateNumber(Math.sqrt(a), 'float'),
    },
  ],
  [
    'fg.uminus',
    {
      kind: 'numeric',
      operands: ['number'],
      evaluate: unaryMinus,
      typed: ([a], kinds) =>
        validateNumber(kinds[0] === 'int' && a === 0 ? 0 : -a, kinds[0]),
    },
  ],
  [
    'fg.pi',
    {
      kind: 'numeric',
      operands: [],
      evaluate: () => validateNumber(Math.PI, 'float'),
      typed: () => validateNumber(Math.PI, 'float'),
    },
  ],
  [
    'fg.ceil',
    {
      kind: 'numeric',
      operands: ['number'],
      evaluate: (a) => validateNumber(Math.ceil(a) || 0, 'int'),
      typed: ([a]) => validateNumber(Math.ceil(a) || 0, 'int'),
    },
  ],
  [
    'fg.round',
    {
      kind: 'numeric',
      operands: ['number'],
      evaluate: (a) => validateNumber(roundInteger(a), 'int'),
      typed: ([a]) => validateNumber(roundInteger(a), 'int'),
    },
  ],
  [
    'fg.max',
    {
      kind: 'numeric',
      operands: ['number', 'number'],
      evaluate: (a, b) => validateNumber(a >= b ? a : b),
      typed: ([a, b], kinds) => {
        const index = a >= b ? 0 : 1;
        const value = index === 0 ? a : b;
        return validateNumber(
          kinds[index] === 'int' && value === 0 ? 0 : value,
          kinds[index],
        );
      },
    },
  ],
  [
    'fg.lt',
    {
      kind: 'comparison',
      operands: ['number', 'number'],
      compare: (a, b) => a < b,
    },
  ],
  [
    'fg.le',
    {
      kind: 'comparison',
      operands: ['number', 'number'],
      compare: (a, b) => a <= b,
    },
  ],
  [
    'fg.gt',
    {
      kind: 'comparison',
      operands: ['number', 'number'],
      compare: (a, b) => a > b,
    },
  ],
  [
    'fg.ge',
    {
      kind: 'comparison',
      operands: ['number', 'number'],
      compare: (a, b) => a >= b,
    },
  ],
  [
    'fg.cnd',
    { kind: 'conditional', operands: ['comparison', 'number', 'number'] },
  ],
]);

type ResolvedOperation =
  | { readonly ok: true; readonly operation: Operation }
  | NumericFailure;
export function resolveOperation(
  functionId: string,
  operandCount: number,
): ResolvedOperation {
  const operation = operations.get(functionId);
  if (operation === undefined)
    return failure(
      'UNSUPPORTED_FUNCTION',
      `Function ${functionId} is outside the verified numeric subset.`,
    );
  if (operandCount !== operation.operands.length)
    return failure(
      'INVALID_FUNCTION_ARITY',
      `${functionId} expects ${operation.operands.length} operands, received ${operandCount}.`,
    );
  return { ok: true, operation };
}
export function validateOperation(
  functionId: string,
  operandCount: number,
): OperationValidationResult {
  const resolved = resolveOperation(functionId, operandCount);
  return resolved.ok ? { ok: true } : resolved;
}
export function evaluateComparison(
  functionId: string,
  left: number,
  right: number,
): boolean | NumericFailure {
  const resolved = resolveOperation(functionId, 2);
  if (!resolved.ok || resolved.operation.kind !== 'comparison')
    return failure(
      'INVALID_CONDITIONAL',
      'A conditional test requires one numeric comparison.',
    );
  return resolved.operation.compare(left, right);
}
export function evaluateOperation(
  functionId: string,
  operands: readonly number[],
  numericKinds?: readonly (NumericKind | undefined)[],
): NumericResult {
  const resolved = resolveOperation(functionId, operands.length);
  if (!resolved.ok) return resolved;
  for (const [index, operand] of operands.entries()) {
    const validated = validateNumber(operand, numericKinds?.[index]);
    if (!validated.ok) return validated;
  }
  const operation = resolved.operation;
  switch (operation.kind) {
    case 'comparison':
      return failure(
        'NONNUMERIC_FORMULA',
        'Comparisons require a conditional test.',
      );
    case 'conditional':
      return failure(
        'INVALID_CONDITIONAL',
        'Conditional evaluation requires a formula graph.',
      );
    case 'numeric': {
      const kinds = numericKinds?.filter(
        (kind): kind is NumericKind => kind !== undefined,
      );
      return kinds !== undefined && kinds.length === operands.length
        ? operation.typed(operands, kinds)
        : operation.evaluate(...operands);
    }
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
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
