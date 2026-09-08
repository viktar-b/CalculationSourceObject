import { PythonIdentifierSchema } from '@viktar-b/cso-core';
import { resolve } from 'node:path';

export class UsageError extends Error {}

export interface DevelopmentOptions {
  readonly sourcePath: string;
  readonly functionName: string;
  readonly inputs: Record<string, number>;
  readonly outPath: string;
}

const numericPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function inputNumber(text: string): number {
  const value = Number(text);
  if (
    !numericPattern.test(text) ||
    !Number.isFinite(value) ||
    (Number.isInteger(value) && !Number.isSafeInteger(value))
  ) {
    throw new UsageError(
      'Inputs must be finite JSON numbers in the safe integer range',
    );
  }
  return value;
}

// This option accepts a flat numeric object. Parse each JSON key before checking
// duplicates, including escaped spellings of the same parameter name.
function jsonInputs(text: string): [string, number][] {
  const entries: [string, number][] = [];
  const body = text.trim();
  try {
    JSON.parse(body);
  } catch {
    throw new UsageError('--inputs-json must be valid JSON');
  }
  if (!body.startsWith('{') || !body.endsWith('}')) {
    throw new UsageError('--inputs-json must be a JSON object of numbers');
  }
  let rest = body.slice(1, -1).trim();
  while (rest.length > 0) {
    const match =
      /^("(?:[^"\\]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*")\s*:\s*([^,]+)(,|$)/.exec(
        rest,
      );
    if (!match || !match[1] || !match[2]) {
      throw new UsageError('--inputs-json must be a JSON object of numbers');
    }
    const key: unknown = JSON.parse(match[1]);
    if (typeof key !== 'string') throw new UsageError('Invalid input name');
    entries.push([key, inputNumber(match[2].trim())]);
    rest = rest.slice(match[0].length).trim();
    if (match[3] === ',' && rest.length === 0) {
      throw new UsageError('--inputs-json cannot have a trailing comma');
    }
  }
  return entries;
}

export function parseCliArgs(args: readonly string[]): DevelopmentOptions {
  const values = new Map<string, string>();
  const inputs = new Map<string, number>();
  const setInput = (spelling: string, value: number) => {
    if (!PythonIdentifierSchema.safeParse(spelling).success) {
      throw new UsageError(`Input ${spelling} is not a valid Python parameter`);
    }
    // Python applies NFKC normalization when parsing source identifiers.
    const name = spelling.normalize('NFKC');
    if (!PythonIdentifierSchema.safeParse(name).success) {
      throw new UsageError(
        `Input ${spelling} does not normalize to a valid Python parameter`,
      );
    }
    if (inputs.has(name))
      throw new UsageError(`Input ${name} was provided more than once`);
    inputs.set(name, value);
  };
  const allowed = new Set([
    '--source',
    '--function',
    '--out',
    '--inputs-json',
    '--input',
  ]);
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!option || !allowed.has(option))
      throw new UsageError(`Unknown option ${option}`);
    if (!value || value.startsWith('--'))
      throw new UsageError(`${option} requires a value`);
    if (option !== '--input') {
      if (values.has(option))
        throw new UsageError(`${option} was provided more than once`);
      values.set(option, value);
    }
    if (option === '--input') {
      const separator = value.indexOf('=');
      if (separator < 1)
        throw new UsageError('--input must use name=value format');
      setInput(
        value.slice(0, separator),
        inputNumber(value.slice(separator + 1)),
      );
    } else if (option === '--inputs-json') {
      for (const [name, number] of jsonInputs(value)) setInput(name, number);
    }
  }
  const source = values.get('--source');
  const functionName = values.get('--function');
  const out = values.get('--out');
  if (!source) throw new UsageError('--source is required');
  if (!functionName || !PythonIdentifierSchema.safeParse(functionName).success)
    throw new UsageError('--function requires a valid Python identifier');
  const normalizedFunction = functionName.normalize('NFKC');
  if (!PythonIdentifierSchema.safeParse(normalizedFunction).success) {
    throw new UsageError(
      '--function does not normalize to a valid Python identifier',
    );
  }
  if (!out) throw new UsageError('--out is required');
  return {
    sourcePath: resolve(source),
    functionName: normalizedFunction,
    outPath: resolve(out),
    inputs: Object.fromEntries(inputs),
  };
}

export const help = `Usage: cso <verify|pdf|bindings|dev-export|dev-render> [arguments]
Use cso <command> --help for usage. Development commands require
--source <file.cso.py> --function <name> --out <path>.

verify evaluates documented formulas and optional independent references.
Development export/render establishes no numerical verification or independent
reference agreement. Inspect every PDF page before delivery.

Commands:
  bindings               Generate typed calculation handles; --check reports stale files without writing.
  dev-export             Export CSO JSON using the selected installed Python module.
  dev-render             Export once and render a development PDF with installed React/CSS.
  verify                 Execute once and verify formulas; use cso verify --help.
  pdf                    Verify once, retain evidence unless --no-evidence, and atomically publish a PDF.

Options:
  --input <name=number>   Repeat for distinct Python function parameters.
  --inputs-json <object> Flat JSON object of numeric parameters; duplicates rejected.
  --help                 Show usage without executing Python or launching Chromium.

Paths resolve from the caller's directory. Set PYTHON to the interpreter with the
cso-python wheel installed. dev-render requires Playwright Chromium.
Development exit codes: 0 exported/rendered, 1 execution/render/write failed,
2 invalid usage. verify/pdf --format json emit one public CommandReport.
`;
