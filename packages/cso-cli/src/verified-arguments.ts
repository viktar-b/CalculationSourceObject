import { resolve } from 'node:path';
import { parseCliArgs, UsageError } from './arguments.ts';

export type VerifiedOptions = {
  readonly sourcePath: string;
  readonly functionName: string;
  readonly inputs: Record<string, number>;
  readonly referencePath?: string;
} & (
  | { readonly command: 'verify' }
  | {
      readonly command: 'pdf';
      readonly outPath: string;
      readonly retainEvidence: boolean;
    }
  | {
      readonly command: 'html';
      readonly outPath: string;
      readonly retainEvidence: boolean;
      readonly checkLayout: boolean;
    }
);

export function parseVerifiedArgs(
  command: 'verify' | 'pdf' | 'html',
  args: readonly string[],
): VerifiedOptions {
  const [source, ...options] = args;
  if (!source || source.startsWith('--')) {
    throw new UsageError('A source file is required');
  }
  const forwarded = ['--source', source];
  const seen = new Set<string>();
  let referencePath: string | undefined;
  let outPath: string | undefined;
  let retainEvidence = true;
  let checkLayout = false;
  for (let index = 0; index < options.length; ) {
    const key = options[index];
    if (key === '--no-evidence' || key === '--check-layout') {
      if (
        (key === '--no-evidence' && command === 'verify') ||
        (key === '--check-layout' && command !== 'html')
      ) {
        throw new UsageError(`Unknown option ${key}`);
      }
      if (seen.has(key)) {
        throw new UsageError(`${key} was provided more than once`);
      }
      seen.add(key);
      if (key === '--no-evidence') retainEvidence = false;
      else checkLayout = true;
      index += 1;
      continue;
    }
    const value = options[index + 1];
    if (
      ![
        '--function',
        '--input',
        '--reference',
        '--format',
        ...(command !== 'verify' ? ['--out'] : []),
      ].includes(key)
    ) {
      throw new UsageError(`Unknown option ${key}`);
    }
    if (!value || value.startsWith('--')) {
      throw new UsageError(`${key} requires a value`);
    }
    if (key !== '--input' && seen.has(key)) {
      throw new UsageError(`${key} was provided more than once`);
    }
    seen.add(key);
    if (key === '--format') {
      if (value !== 'json') {
        throw new UsageError('--format must be json');
      }
    } else if (key === '--reference') {
      referencePath = resolve(value);
    } else if (key === '--out') {
      outPath = resolve(value);
    } else {
      forwarded.push(key, value);
    }
    index += 2;
  }
  if (command !== 'verify' && !outPath) {
    throw new UsageError('--out is required');
  }
  // Share numeric/identifier normalization with the installed development path.
  const parsed = parseCliArgs([...forwarded, '--out', outPath ?? '.']);
  const common = {
    sourcePath: parsed.sourcePath,
    functionName: parsed.functionName,
    inputs: parsed.inputs,
    referencePath,
  };
  if (command === 'html') {
    return {
      ...common,
      command,
      outPath: parsed.outPath,
      retainEvidence,
      checkLayout,
    };
  }
  if (command === 'pdf') {
    return { ...common, command, outPath: parsed.outPath, retainEvidence };
  }
  return { ...common, command };
}

export function verifiedHelp(command: 'verify' | 'pdf' | 'html'): string {
  if (command === 'html')
    return `Usage: cso html <file.cso.py> --function <name> [--input <name=number>] [--reference <file.json>] --out <path.html> [--format json] [--no-evidence] [--check-layout]

Verify one captured execution and atomically publish standalone HTML with embedded CSS/assets.
--check-layout uses Chromium to check assets, presentation and screen/print overflow before publication.
Without --check-layout, no browser runs and rendering is not_applicable. Visual inspection stays pending.
--no-evidence omits the sibling evidence bundle; verification and atomic replacement still apply.
Inputs, reference matching, JSON reports, PYTHON and exit codes follow cso verify.
Paths resolve against the caller directory. --help executes neither Python nor Chromium.
`;

  return `Usage: cso ${command} <file.cso.py> --function <name> [--input <name=number>] [--reference <file.json>]${command === 'pdf' ? ' --out <path.pdf>' : ''} [--format json]${command === 'pdf' ? ' [--no-evidence]' : ''}

${command === 'verify' ? 'Execute once with installed cs-object and independently evaluate every documented result.' : 'Verify once, render the captured execution, and atomically replace the PDF. Evidence is retained unless --no-evidence is set.'}
Repeat --input for distinct parameters. Duplicate, unknown and invalid inputs fail.
--reference captures one explicit versioned reference file. Missing matches are not_applicable.
--format json emits one public CommandReport, including on errors.
${command === 'pdf' ? '--no-evidence writes only the PDF; no sibling evidence bundle or stderr locator.\n' : ''}--help shows this command help without executing Python.
Paths resolve against the caller directory. PYTHON selects the installed interpreter.
Exit codes: 0 success, 1 verification/generation failure, 2 invalid usage.
Tolerance: abs(actual - expected) <= max(1e-9, 1e-12 * max(abs(actual), abs(expected))).
Document, rendering and visual checks do not apply to verify.
${command === 'pdf' ? 'PDF evidence is retained at <output>.evidence/<manifest-hash>/ unless --no-evidence is set; its locator/hash goes to stderr.\nGenerated PDFs have pending visual inspection. Evidence alone is not proof of PDF publication.\n' : ''}`;
}
