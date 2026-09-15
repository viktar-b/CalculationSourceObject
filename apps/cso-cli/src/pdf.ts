import { CommandReportSchema } from '@cs-object/core';
import {
  prepareExecutionDocument,
  DocumentPreparationError,
} from '@cs-object/react';
import { captureAssets, sha256 } from './assets.ts';
import { jsonBytes, retainSource, publishPdfEvidence } from './evidence.ts';
import { renderPreparedPdf } from './pdf-rendering.ts';
import { executeAndVerify, type CommandOutcome } from './verification.ts';
import type { VerifiedOptions } from './verified-arguments.ts';

export async function pdfCommand(
  options: Extract<VerifiedOptions, { command: 'pdf' }>,
): Promise<
  CommandOutcome & {
    stdoutBytes?: Buffer;
    evidence?: { path: string; sha256: string };
  }
> {
  const result = executeAndVerify(options);
  if (result.kind === 'failed') return result.outcome;
  const report = { ...result.report, command: options.command, ok: false };
  let stage: 'document' | 'rendering' | 'write' = 'document';
  try {
    const document = prepareExecutionDocument({
      execution: result.capture.execution,
      assets: captureAssets(options.sourcePath, result.capture.execution),
    });
    const retained = retainSource(result.capture, document);
    report.checks.documentContent = { status: 'passed' };
    stage = 'rendering';
    const { pdf, presentation } = await renderPreparedPdf(document);
    report.checks.rendering = { status: 'passed' };
    stage = 'write';
    const successful = CommandReportSchema.parse({
      ...report,
      ok: true,
      checks: { ...report.checks, visualInspection: { status: 'pending' } },
      output: { path: options.outPath, sha256: sha256(pdf) },
    });
    const stdoutBytes = jsonBytes(successful);
    const evidence = publishPdfEvidence({
      outPath: options.outPath,
      pdf,
      reportBytes: stdoutBytes,
      retained,
      presentation,
      retainEvidence: options.retainEvidence,
    });
    return { report: successful, exitCode: 0, stdoutBytes, evidence };
  } catch (error) {
    if (stage === 'document')
      report.checks.documentContent = { status: 'failed' };
    if (stage === 'rendering') report.checks.rendering = { status: 'failed' };
    report.diagnostics.push(
      ...(error instanceof DocumentPreparationError
        ? error.diagnostics
        : [
            {
              code:
                stage === 'document'
                  ? 'DOCUMENT_PREPARATION_FAILED'
                  : stage === 'rendering'
                    ? 'PDF_RENDERING_FAILED'
                    : 'PDF_PUBLICATION_FAILED',
              stage,
              message: error instanceof Error ? error.message : String(error),
            },
          ]),
    );
    return { report: CommandReportSchema.parse(report), exitCode: 1 };
  }
}
