import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  CalculationDefinitionResponseSchema,
  type CalculationDefinition,
  type CommandReport,
  type PreparedDocument,
} from '@cs-object/core';
import {
  prepareExecutionDocument,
  DocumentPreparationError,
} from '@cs-object/react';
import { captureAssets, sha256 } from './assets.ts';
import { HttpError } from './dev-errors.ts';
import { jsonBytes, type PresentationMapping } from './evidence.ts';
import { renderPreparedPdf, LayoutInspectionError } from './pdf-rendering.ts';
import { buildPreparedHtml } from './prepared-html.ts';
import { parseStrictJson } from './strict-json.ts';
import { executeAndVerify, type VerifiedCapture } from './verification.ts';
import type { VerifiedOptions } from './verified-arguments.ts';

export type DevTarget = Pick<
  VerifiedOptions,
  'sourcePath' | 'functionName' | 'referencePath'
>;
type Invocation = {
  definition: CalculationDefinition;
  inputs: Record<string, number>;
};
export type DevLimits = {
  maximumRuns: number;
  maximumBytes: number;
  maximumAgeMs: number;
};
type PdfState =
  | { kind: 'pending' }
  | { kind: 'rendering'; promise: Promise<Buffer> }
  | { kind: 'ready'; bytes: Buffer; presentation: PresentationMapping[] }
  | { kind: 'failed'; error: HttpError };
type Run = {
  id: string;
  outputs: Record<string, number>;
  checks: CommandReport['checks'];
  capture: VerifiedCapture;
  document: PreparedDocument;
  html: Buffer;
  bytes: number;
  expires: number;
  pdf: PdfState;
};
const defaults: DevLimits = {
  maximumRuns: 10,
  maximumBytes: 128 * 1024 * 1024,
  maximumAgeMs: 30 * 60_000,
};
function describe(options: DevTarget): CalculationDefinition {
  const env = { ...process.env };
  for (const key of ['PYTHONPATH', 'PYTHONHOME', 'NODE_PATH'])
    Reflect.deleteProperty(env, key);
  const result = spawnSync(
    process.env.PYTHON ?? 'python3',
    [
      '-I',
      '-m',
      'cso_python',
      'describe',
      options.sourcePath,
      '--function',
      options.functionName,
    ],
    {
      env,
      timeout: 30_000,
      killSignal: 'SIGKILL',
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (result.error || result.signal)
    throw new HttpError(
      422,
      result.error?.message ?? `Python terminated by ${result.signal}`,
    );
  const response = CalculationDefinitionResponseSchema.parse(
    parseStrictJson(
      new TextDecoder('utf-8', { fatal: true }).decode(result.stdout),
    ),
  );
  if (!response.ok)
    throw new HttpError(
      422,
      'Cannot describe the calculation',
      response.diagnostics,
    );
  if (result.status !== 0)
    throw new HttpError(422, 'Python describe did not exit successfully');
  return response.definition;
}

export function createDevRuntime(
  options: DevTarget,
  limits: DevLimits = defaults,
) {
  describe(options);
  const runs = new Map<string, Run>();
  let activePdf:
    | { run: Run; abort: AbortController; promise: Promise<Buffer> }
    | undefined;
  let closed = false;
  const retainedBytes = () =>
    [...runs.values()].reduce((sum, run) => sum + run.bytes, 0);
  function prune(extraBytes = 0, extraRuns = 0, keep?: Run) {
    if (
      extraBytes + (keep?.bytes ?? 0) > limits.maximumBytes ||
      extraRuns > limits.maximumRuns
    )
      throw new HttpError(
        413,
        'The retained report exceeds the local session limit',
      );
    for (const [id, run] of runs)
      if (run.expires <= Date.now() && run !== activePdf?.run && run !== keep)
        runs.delete(id);
    for (const [id, run] of runs) {
      if (
        retainedBytes() + extraBytes <= limits.maximumBytes &&
        runs.size + extraRuns <= limits.maximumRuns
      )
        break;
      if (run !== activePdf?.run && run !== keep) runs.delete(id);
    }
    if (
      retainedBytes() + extraBytes > limits.maximumBytes ||
      runs.size + extraRuns > limits.maximumRuns
    )
      throw new HttpError(
        413,
        'The retained report exceeds the local session limit',
      );
  }
  async function renderPdf(run: Run): Promise<Buffer> {
    if (run.pdf.kind === 'ready') return run.pdf.bytes;
    if (run.pdf.kind === 'rendering') return run.pdf.promise;
    if (run.pdf.kind === 'failed') throw run.pdf.error;
    if (activePdf)
      throw new HttpError(429, 'Another PDF is rendering; retry shortly');
    const abort = new AbortController();
    const timer = setTimeout(
      () => abort.abort(new Error('PDF rendering timed out')),
      90_000,
    );
    const promise = renderPreparedPdf(
      run.document,
      run.html.toString('utf8'),
      abort.signal,
    )
      .then((rendered) => {
        const addedBytes =
          rendered.pdf.length + jsonBytes(rendered.presentation).length;
        prune(addedBytes, 0, run);
        run.bytes += addedBytes;
        run.pdf = {
          kind: 'ready',
          bytes: rendered.pdf,
          presentation: rendered.presentation,
        };
        run.checks.rendering = { status: 'passed' };
        return rendered.pdf;
      })
      .catch((error: unknown) => {
        if (error instanceof HttpError && error.status === 413) {
          run.pdf = { kind: 'pending' };
          throw error;
        }
        const message =
          error instanceof Error ? error.message : 'PDF rendering failed';
        const failure = new HttpError(
          422,
          message,
          error instanceof LayoutInspectionError ? error.diagnostics : [],
        );
        run.pdf = { kind: 'failed', error: failure };
        run.checks.rendering = { status: 'failed' };
        throw failure;
      })
      .finally(() => {
        clearTimeout(timer);
        activePdf = undefined;
      });
    run.pdf = { kind: 'rendering', promise };
    activePdf = { run, abort, promise };
    return promise;
  }

  function assertOpen() {
    if (closed) throw new HttpError(503, 'Server is shutting down');
  }
  function execute({ definition, inputs }: Invocation) {
    assertOpen();
    const verified = executeAndVerify(
      { ...options, command: 'verify', inputs },
      30_000,
    );
    if (verified.kind === 'failed')
      throw new HttpError(
        422,
        'Calculation failed verification',
        verified.outcome.report.diagnostics,
      );
    const { execution } = verified.capture;
    if (
      execution.entry.moduleId !== definition.entryModuleId ||
      execution.entry.sourceHash !== definition.entrySourceHash ||
      execution.sourceClosureHash !== definition.sourceClosureHash ||
      execution.entry.function !== definition.function
    )
      throw new HttpError(
        409,
        'Calculation source changed during the request; calculate again',
      );
    if (!execution.authoring)
      throw new HttpError(422, 'Public output evidence is required');
    const outputs = Object.fromEntries(
      execution.authoring.outputs
        .filter(
          (output) => output.invocationId === execution.entry.invocationId,
        )
        .map((output) => [output.name, output.value]),
    );
    return { verified, execution, outputs };
  }
  function lookup(id: string): Run {
    assertOpen();
    prune();
    const run = runs.get(id);
    if (!run)
      throw new HttpError(
        404,
        'Run expired or does not exist; calculate again',
      );
    return run;
  }
  function summary(run: Run) {
    return structuredClone({
      id: run.id,
      outputs: run.outputs,
      checks: run.checks,
    });
  }
  function createRun(invocation: Invocation) {
    const { verified, execution, outputs } = execute(invocation);
    try {
      const document = prepareExecutionDocument({
        execution,
        assets: captureAssets(options.sourcePath, execution),
      });
      const independent =
        verified.report.checks.independentReferenceAgreement.status;
      const notice = `Source-to-document consistency passed. Independent numerical reference: ${independent === 'passed' ? 'passed' : 'pending, no matching reference'}. Human visual inspection is pending. These checks do not establish engineering approval.`;
      const html = Buffer.from(buildPreparedHtml(document, notice));
      const bytes =
        html.length +
        jsonBytes(document).length +
        verified.capture.executionBytes.length +
        (verified.capture.referenceBytes?.length ?? 0) +
        jsonBytes(verified.capture.verification).length;
      prune(bytes, 1);
      const run: Run = {
        id: randomUUID(),
        outputs,
        checks: {
          ...verified.report.checks,
          documentContent: { status: 'passed' },
          visualInspection: { status: 'pending' },
        },
        capture: verified.capture,
        document,
        html,
        bytes,
        expires: Date.now() + limits.maximumAgeMs,
        pdf: { kind: 'pending' },
      };
      runs.set(run.id, run);
      return summary(run);
    } catch (error) {
      if (error instanceof DocumentPreparationError)
        throw new HttpError(422, error.message, error.diagnostics);
      throw error;
    }
  }
  const expiry = setInterval(
    () => prune(),
    Math.min(limits.maximumAgeMs, 60_000),
  );
  expiry.unref();
  return {
    definition() {
      assertOpen();
      return describe(options);
    },
    calculate(invocation: Invocation) {
      return execute(invocation).outputs;
    },
    createRun,
    summary(id: string) {
      return summary(lookup(id));
    },
    html(id: string) {
      return lookup(id).html;
    },
    async pdf(id: string) {
      const bytes = await renderPdf(lookup(id));
      return { bytes, sha256: sha256(bytes) };
    },
    evidence(id: string) {
      const run = lookup(id);
      return jsonBytes({
        runId: run.id,
        execution: parseStrictJson(run.capture.executionBytes.toString('utf8')),
        document: run.document,
        verification: run.capture.verification,
        reference: run.capture.referenceBytes
          ? {
              sha256: sha256(run.capture.referenceBytes),
              content: parseStrictJson(
                run.capture.referenceBytes.toString('utf8'),
              ),
            }
          : null,
        checks: run.checks,
        artifacts: {
          html: { sha256: sha256(run.html) },
          pdf:
            run.pdf.kind === 'ready' ? { sha256: sha256(run.pdf.bytes) } : null,
        },
        presentation: run.pdf.kind === 'ready' ? run.pdf.presentation : [],
      });
    },
    async close() {
      closed = true;
      clearInterval(expiry);
      const rendering = activePdf;
      rendering?.abort.abort(new Error('Server is shutting down'));
      if (rendering) await Promise.allSettled([rendering.promise]);
      runs.clear();
    },
  };
}
