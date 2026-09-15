import {
  CommandReportSchema,
  verifyExecution,
  type CommandReport,
  type ExecutionPayload,
  type VerificationReport,
} from '@cs-object/core';
import { initialReport } from './reports.ts';
import { captureReference } from './reference.ts';
import { runPythonExecution } from './execution.ts';
import type { VerifiedOptions } from './verified-arguments.ts';

export type CommandOutcome = {
  report: CommandReport;
  exitCode: 0 | 1 | 2;
};
export type VerifiedCapture = {
  execution: ExecutionPayload;
  executionBytes: Buffer;
  verification: VerificationReport;
  referenceBytes?: Buffer;
};
export function executeAndVerify(
  options: VerifiedOptions,
):
  | { kind: 'failed'; outcome: CommandOutcome }
  | { kind: 'verified'; report: CommandReport; capture: VerifiedCapture } {
  const report = initialReport('verify');
  report.provenance.function = options.functionName;
  const finish = (exitCode: 0 | 1 | 2) => ({
    kind: 'failed' as const,
    outcome: {
      report: CommandReportSchema.parse({
        ...report,
        command: options.command,
      }),
      exitCode,
    },
  });
  const attempt = runPythonExecution(options);
  if (attempt.kind === 'failed') {
    report.diagnostics.push(...attempt.diagnostics);
    report.checks.executionValidity = { status: 'failed' };
    report.checks.sourceToDocumentConsistency = { status: 'failed' };
    return finish(1);
  }
  const response = attempt.response;
  report.diagnostics.push(...response.diagnostics);
  if (!response.ok) {
    report.provenance = response.provenance ?? {};
    const usage =
      attempt.exitCode === 2 &&
      response.diagnostics.every((diagnostic) => diagnostic.stage === 'usage');
    if (!usage) {
      report.checks.executionValidity = { status: 'failed' };
      report.checks.sourceToDocumentConsistency = { status: 'failed' };
      if (
        !response.diagnostics.some((diagnostic) =>
          ['source', 'execution', 'contract'].includes(diagnostic.stage),
        )
      ) {
        report.diagnostics.push({
          code: 'PYTHON_PROCESS_FAILED',
          stage: 'execution',
          message: `Python failed with exit ${attempt.exitCode}`,
        });
      }
    }
    return finish(usage ? 2 : 1);
  }
  if (attempt.exitCode !== 0) {
    report.diagnostics.push({
      code: 'EXECUTION_EXIT_MISMATCH',
      stage: 'execution',
      message: `Python returned success with exit ${attempt.exitCode}`,
    });
    report.checks.executionValidity = { status: 'failed' };
    report.checks.sourceToDocumentConsistency = { status: 'failed' };
    return finish(1);
  }
  const execution = response.execution;
  report.provenance = {
    entryModuleId: execution.entry.moduleId,
    entrySourceHash: execution.entry.sourceHash,
    sourceClosureHash: execution.sourceClosureHash,
    function: execution.entry.function,
    resolvedInputs: execution.entry.resolvedInputs,
    sourceManifest: execution.sourceManifest,
    versions: execution.versions,
  };
  const reference = options.referencePath
    ? captureReference(options.referencePath, execution)
    : undefined;
  if (reference?.provenance) {
    report.provenance.reference = reference.provenance;
  }
  const verified = verifyExecution({
    execution,
    referenceCases: reference?.kind === 'parsed' ? reference.cases : undefined,
  });
  report.numericPolicy = verified.numericPolicy;
  Object.assign(report.checks, verified.checks);
  report.diagnostics.push(...verified.diagnostics);
  if (reference?.kind === 'failed') {
    report.diagnostics.push(...reference.diagnostics);
  }
  report.ok = verified.ok && reference?.kind !== 'failed';
  if (!report.ok) return finish(1);
  return {
    kind: 'verified',
    report: CommandReportSchema.parse(report),
    capture: {
      execution,
      executionBytes: attempt.bytes,
      verification: verified,
      referenceBytes:
        reference?.kind === 'parsed' ? reference.bytes : undefined,
    },
  };
}

export function verifyCommand(options: VerifiedOptions): CommandOutcome {
  const result = executeAndVerify(options);
  return result.kind === 'failed'
    ? result.outcome
    : { report: result.report, exitCode: 0 };
}
