import { CommandReportSchema } from '@cs-object/core';
import {
  prepareExecutionDocument,
  DocumentPreparationError,
} from '@cs-object/react';
import { captureAssets, sha256 } from './assets.ts';
import {
  jsonBytes,
  retainSource,
  publishDocumentEvidence,
} from './evidence.ts';
import {
  renderPreparedPdf,
  inspectPreparedHtml,
  LayoutInspectionError,
} from './pdf-rendering.ts';
import { buildPreparedHtml } from './prepared-html.ts';
import type { PresentationMapping } from './evidence.ts';
import { executeAndVerify, type CommandOutcome } from './verification.ts';
import type { VerifiedOptions } from './verified-arguments.ts';

export async function documentCommand(
  options: Extract<VerifiedOptions, { command: 'pdf' | 'html' }>,
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
    let bytes: Buffer;
    let presentation: PresentationMapping[] = [];
    if (options.command === 'pdf') {
      stage = 'rendering';
      const rendered = await renderPreparedPdf(document);
      bytes = rendered.pdf;
      presentation = rendered.presentation;
      report.checks.rendering = { status: 'passed' };
    } else {
      const html = buildPreparedHtml(document);
      bytes = Buffer.from(html);
      if (options.checkLayout) {
        stage = 'rendering';
        presentation = await inspectPreparedHtml(document, html);
        report.checks.rendering = { status: 'passed' };
      }
    }
    stage = 'write';
    const successful = CommandReportSchema.parse({
      ...report,
      ok: true,
      checks: { ...report.checks, visualInspection: { status: 'pending' } },
      output: { path: options.outPath, sha256: sha256(bytes) },
    });
    const stdoutBytes = jsonBytes(successful);
    const evidence = publishDocumentEvidence({
      outPath: options.outPath,
      artifact: { kind: options.command, bytes },
      presentationCheck:
        options.command === 'pdf' || options.checkLayout
          ? 'passed'
          : 'not_applicable',
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
      ...(error instanceof DocumentPreparationError ||
      error instanceof LayoutInspectionError
        ? error.diagnostics
        : [
            {
              code:
                stage === 'document'
                  ? 'DOCUMENT_PREPARATION_FAILED'
                  : stage === 'rendering'
                    ? `${options.command.toUpperCase()}_RENDERING_FAILED`
                    : `${options.command.toUpperCase()}_PUBLICATION_FAILED`,
              stage,
              message: error instanceof Error ? error.message : String(error),
            },
          ]),
    );
    return { report: CommandReportSchema.parse(report), exitCode: 1 };
  }
}
