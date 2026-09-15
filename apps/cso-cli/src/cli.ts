#!/usr/bin/env node
import { stringifyJson } from './json.ts';
import { help, parseCliArgs, UsageError } from './arguments.ts';
import { initialReport, usageReport } from './reports.ts';
import { CommandReportSchema } from '@cs-object/core';
import { parseVerifiedArgs, verifiedHelp } from './verified-arguments.ts';
import { verifyCommand } from './verification.ts';
import { bindingsCommand, bindingsHelp } from './bindings.ts';

const [command, ...args] = process.argv.slice(2);
if (
  command === '--help' ||
  command === undefined ||
  (['verify', 'pdf', 'bindings', 'dev-export', 'dev-render'].includes(
    command,
  ) &&
    args.includes('--help'))
) {
  process.stdout.write(
    command === 'verify' || command === 'pdf'
      ? verifiedHelp(command)
      : command === 'bindings'
        ? bindingsHelp
        : help,
  );
} else if (command === 'bindings') {
  process.exitCode = bindingsCommand(args);
} else if (command === 'verify' || command === 'pdf') {
  let outcome: ReturnType<typeof verifyCommand> & {
    stdoutBytes?: Buffer;
    evidence?: { path: string; sha256: string };
  };
  try {
    const options = parseVerifiedArgs(command, args);
    if (options.command === 'pdf') {
      const { pdfCommand } = await import('./pdf.ts');
      outcome = await pdfCommand(options);
    } else {
      outcome = verifyCommand(options);
    }
  } catch (error: unknown) {
    const report = initialReport(command);
    report.diagnostics.push({
      code: error instanceof UsageError ? 'INVALID_USAGE' : 'COMMAND_FAILED',
      stage: error instanceof UsageError ? 'usage' : 'execution',
      message: error instanceof Error ? error.message : String(error),
    });
    outcome = {
      report: CommandReportSchema.parse(report),
      exitCode: error instanceof UsageError ? 2 : 1,
    };
  }
  if (outcome.evidence)
    process.stderr.write(`CSO evidence ${stringifyJson(outcome.evidence)}\n`);
  process.stdout.write(
    outcome.stdoutBytes ?? `${stringifyJson(outcome.report)}\n`,
  );
  process.exitCode = outcome.exitCode;
} else if (['dev-export', 'dev-render'].includes(command)) {
  try {
    const options = parseCliArgs(args);
    const development = await import('./development.ts');
    if (command === 'dev-export') {
      development.writeAtomically(
        options.outPath,
        `${stringifyJson(development.runPythonExporter(options))}\n`,
      );
    } else {
      await development.renderAnnotatedPythonPdf(options);
    }
    process.stderr.write(
      `Unverified development ${command === 'dev-export' ? 'CSO' : 'PDF'} written to ${options.outPath}\n`,
    );
  } catch (error: unknown) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
} else {
  const report = usageReport({ kind: 'unknown', command });
  if (
    args.some(
      (value, index) => value === '--format' && args[index + 1] === 'json',
    )
  ) {
    process.stdout.write(`${stringifyJson(report)}\n`);
  } else {
    process.stderr.write(`${report.diagnostics[0]?.message}\n${help}`);
  }
  process.exitCode = 2;
}
