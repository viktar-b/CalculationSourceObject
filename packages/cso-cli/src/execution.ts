import { stringifyJson } from './json.ts';
import {
  ExecutionResponseSchema,
  contractIssuesToDiagnostics,
  type ExecutionResponse,
  type Diagnostic,
} from '@cs-object/core';
import { parseStrictJson } from './strict-json.ts';
import { runPythonProcess } from './python-process.ts';
import type { VerifiedOptions } from './verified-arguments.ts';

type ExecutionAttempt =
  | {
      kind: 'response';
      response: ExecutionResponse;
      bytes: Buffer;
      exitCode: number | null;
    }
  | { kind: 'failed'; diagnostics: Diagnostic[] };
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function runPythonExecution(
  options: VerifiedOptions,
  timeoutMs?: number,
): ExecutionAttempt {
  const result = runPythonProcess({
    command: 'execute',
    args: [
      options.sourcePath,
      '--function',
      options.functionName,
      '--inputs-json',
      stringifyJson(options.inputs),
    ],
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error || result.signal) {
    return {
      kind: 'failed',
      diagnostics: [
        {
          code: 'PYTHON_PROCESS_FAILED',
          stage: 'execution',
          message: result.error
            ? message(result.error)
            : `Python terminated by ${result.signal}`,
        },
      ],
    };
  }
  let raw: unknown;
  try {
    raw = parseStrictJson(
      new TextDecoder('utf-8', { fatal: true }).decode(result.stdout),
    );
  } catch (error) {
    return {
      kind: 'failed',
      diagnostics: [
        {
          code: 'INVALID_EXECUTION_JSON',
          stage: 'contract',
          message: message(error),
        },
      ],
    };
  }
  const parsed = ExecutionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      kind: 'failed',
      diagnostics: contractIssuesToDiagnostics(parsed.error.issues),
    };
  }
  return {
    kind: 'response',
    response: parsed.data,
    bytes: result.stdout,
    exitCode: result.status,
  };
}
