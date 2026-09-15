import { stringifyJson } from './json.ts';
import { spawnSync } from 'node:child_process';
import {
  ExecutionResponseSchema,
  contractIssuesToDiagnostics,
  type ExecutionResponse,
  type Diagnostic,
} from '@cs-object/core';
import { parseStrictJson } from './strict-json.ts';
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

export function runPythonExecution(options: VerifiedOptions): ExecutionAttempt {
  const environment = { ...process.env };
  for (const key of ['PYTHONPATH', 'PYTHONHOME', 'NODE_PATH']) {
    Reflect.deleteProperty(environment, key);
  }
  const result = spawnSync(
    process.env.PYTHON ?? 'python3',
    [
      '-I',
      '-m',
      'cso_python',
      'execute',
      options.sourcePath,
      '--function',
      options.functionName,
      '--inputs-json',
      stringifyJson(options.inputs),
    ],
    { env: environment, maxBuffer: 64 * 1024 * 1024 },
  );
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
