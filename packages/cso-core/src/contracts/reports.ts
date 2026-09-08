import { z } from 'zod';
import {
  type Diagnostic,
  DiagnosticSchema,
  HashSchema,
  NonemptyStringSchema,
  ProvenanceSchema,
  VersionsSchema,
} from './common.ts';

function reportIssue(
  ctx: z.RefinementCtx,
  path: PropertyKey[],
  diagnosticCode: string,
  message: string,
) {
  ctx.addIssue({ code: 'custom', path, message, params: { diagnosticCode } });
}

const CountsSchema = z
  .strictObject({
    checked: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    passed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    failed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .superRefine((counts, ctx) => {
    if (counts.checked !== counts.passed + counts.failed) {
      reportIssue(
        ctx,
        ['checked'],
        'REPORT_COUNT_MISMATCH',
        'Checked count must equal passed plus failed.',
      );
    }
  });

export const CheckSchema = z
  .strictObject({
    status: z.enum(['passed', 'failed', 'not_applicable']),
    counts: CountsSchema.optional(),
    cacheCounts: CountsSchema.optional(),
  })
  .superRefine((check, ctx) => {
    const counts = [check.counts, check.cacheCounts].filter(
      (value) => value !== undefined,
    );
    if (
      check.status === 'not_applicable' &&
      counts.some((value) => value.checked !== 0)
    ) {
      reportIssue(
        ctx,
        ['status'],
        'REPORT_CHECK_STATUS_MISMATCH',
        'A check that did not apply cannot count comparisons.',
      );
    }
    if (check.status === 'passed' && counts.some((value) => value.failed > 0)) {
      reportIssue(
        ctx,
        ['status'],
        'REPORT_CHECK_STATUS_MISMATCH',
        'A passed check cannot contain failed comparisons.',
      );
    }
    if (
      check.status === 'passed' &&
      counts.length > 0 &&
      counts.every((value) => value.checked === 0)
    ) {
      reportIssue(
        ctx,
        ['status'],
        'REPORT_EMPTY_CHECK_PASSED',
        'An empty comparison category must be not_applicable.',
      );
    }
    if (
      check.status === 'failed' &&
      counts.length > 0 &&
      counts.every((value) => value.failed === 0)
    ) {
      reportIssue(
        ctx,
        ['status'],
        'REPORT_CHECK_STATUS_MISMATCH',
        'A failed comparison check must count a failure.',
      );
    }
  });
export type Check = z.infer<typeof CheckSchema>;

export const NumericPolicySchema = z.strictObject({
  absoluteTolerance: z.literal(1e-9),
  relativeTolerance: z.literal(1e-12),
  numberDomain: z.literal('finite-real-safe-integer'),
});
export type NumericPolicy = z.infer<typeof NumericPolicySchema>;

const VerificationChecksSchema = z.strictObject({
  executionValidity: CheckSchema,
  inputConsistency: CheckSchema,
  constantConsistency: CheckSchema,
  formulaConsistency: CheckSchema,
  outputConsistency: CheckSchema.optional(),
  sourceToDocumentConsistency: CheckSchema,
  independentReferenceAgreement: CheckSchema,
});

type VerificationChecks = z.infer<typeof VerificationChecksSchema>;

function verificationPassed(checks: VerificationChecks) {
  return (
    checks.sourceToDocumentConsistency.status === 'passed' &&
    checks.independentReferenceAgreement.status !== 'failed'
  );
}

function validateVerificationChecks(
  checks: VerificationChecks,
  ctx: z.RefinementCtx,
) {
  const categories = [
    'inputConsistency',
    'constantConsistency',
    'formulaConsistency',
  ] as const;
  const prerequisiteChecks = [
    checks.executionValidity,
    ...(checks.outputConsistency ? [checks.outputConsistency] : []),
    ...categories.map((key) => checks[key]),
  ];
  const expectedStatus = prerequisiteChecks.some(
    (check) => check.status === 'failed',
  )
    ? 'failed'
    : checks.executionValidity.status === 'passed'
      ? 'passed'
      : 'not_applicable';
  if (checks.sourceToDocumentConsistency.status !== expectedStatus) {
    reportIssue(
      ctx,
      ['checks', 'sourceToDocumentConsistency', 'status'],
      'REPORT_SOURCE_SUMMARY_MISMATCH',
      'Source consistency must summarize execution, input, constant and formula checks.',
    );
  }
  const output = checks.outputConsistency;
  if (output) {
    if (
      (checks.executionValidity.status !== 'passed' &&
        output.status !== 'not_applicable') ||
      (output.status === 'passed' && (output.counts?.checked ?? 0) === 0) ||
      (output.status === 'not_applicable' && output.counts?.checked !== 0)
    ) {
      reportIssue(
        ctx,
        ['checks', 'outputConsistency'],
        'REPORT_OUTPUT_CHECK_INVALID',
        'Output checks require valid execution and explicit comparison coverage.',
      );
    }
  }
  for (const key of categories) {
    if (
      checks.executionValidity.status !== 'passed' &&
      checks[key].status !== 'not_applicable'
    ) {
      reportIssue(
        ctx,
        ['checks', key, 'status'],
        'REPORT_PREREQUISITE_FAILED',
        'A consistency check requires valid execution.',
      );
    }
    if (
      checks.executionValidity.status === 'passed' &&
      checks[key].status === 'not_applicable' &&
      checks[key].counts?.checked !== 0
    ) {
      reportIssue(
        ctx,
        ['checks', key, 'counts'],
        'REPORT_EMPTY_CATEGORY_COUNT_REQUIRED',
        'An empty or skipped consistency category records zero checked, passed and failed.',
      );
    }
  }
  for (const key of [...categories, 'independentReferenceAgreement'] as const) {
    if (
      checks[key].status === 'passed' &&
      (checks[key].counts?.checked ?? 0) <= 0
    ) {
      reportIssue(
        ctx,
        ['checks', key, 'counts'],
        'REPORT_NUMERIC_COVERAGE_REQUIRED',
        'A passed numeric check requires positive documented-result comparison counts; cache counts do not establish this coverage.',
      );
    }
  }
  if (
    checks.executionValidity.status !== 'passed' &&
    checks.independentReferenceAgreement.status !== 'not_applicable'
  ) {
    reportIssue(
      ctx,
      ['checks', 'independentReferenceAgreement', 'status'],
      'REPORT_PREREQUISITE_FAILED',
      'Independent reference comparison requires valid execution.',
    );
  }
}

const verificationOwners = {
  executionValidity: ['source', 'execution', 'contract'],
  inputConsistency: ['verification'],
  constantConsistency: ['verification'],
  formulaConsistency: ['verification'],
  independentReferenceAgreement: ['reference'],
} as const;

function hasOwningDiagnostic(
  diagnostics: Diagnostic[],
  check: NonNullable<Diagnostic['check']>,
  stages: readonly Diagnostic['stage'][],
) {
  return diagnostics.some(
    (diagnostic) =>
      stages.includes(diagnostic.stage) &&
      (diagnostic.check === undefined || diagnostic.check === check),
  );
}

function validateCheckDiagnostics(
  checks: VerificationChecks,
  diagnostics: Diagnostic[],
  ctx: z.RefinementCtx,
) {
  if (
    checks.outputConsistency?.status === 'failed' &&
    !hasOwningDiagnostic(diagnostics, 'outputConsistency', ['verification'])
  )
    reportIssue(
      ctx,
      ['checks', 'outputConsistency'],
      'REPORT_CHECK_DIAGNOSTIC_REQUIRED',
      'Failed output checks require a verification diagnostic',
    );
  for (const key of [
    'executionValidity',
    'inputConsistency',
    'constantConsistency',
    'formulaConsistency',
    'independentReferenceAgreement',
  ] as const) {
    if (
      checks[key].status === 'failed' &&
      !hasOwningDiagnostic(diagnostics, key, verificationOwners[key])
    ) {
      reportIssue(
        ctx,
        ['checks', key],
        'REPORT_CHECK_DIAGNOSTIC_REQUIRED',
        'A failed check needs a diagnostic for that check or its owning stage.',
      );
    }
  }
}

const verificationFields = {
  ok: z.boolean(),
  numericPolicy: NumericPolicySchema,
  checks: VerificationChecksSchema,
  diagnostics: z.array(DiagnosticSchema),
};

export const VerificationReportSchema = z
  .strictObject(verificationFields)
  .superRefine((report, ctx) => {
    validateVerificationChecks(report.checks, ctx);
    validateCheckDiagnostics(report.checks, report.diagnostics, ctx);
    if (report.ok !== verificationPassed(report.checks)) {
      reportIssue(
        ctx,
        ['ok'],
        'REPORT_OK_MISMATCH',
        'Verification success must agree with the required checks.',
      );
    }
    if (!report.ok && report.diagnostics.length === 0) {
      reportIssue(
        ctx,
        ['diagnostics'],
        'REPORT_FAILURE_DIAGNOSTIC_REQUIRED',
        'A failed report must explain the failure.',
      );
    }
  });
export type VerificationReport = z.infer<typeof VerificationReportSchema>;

const InspectionCheckSchema = z.strictObject({
  status: z.enum(['pending', 'not_applicable']),
});

const CommandChecksSchema = VerificationChecksSchema.extend({
  documentContent: CheckSchema,
  rendering: CheckSchema,
  visualInspection: InspectionCheckSchema,
});

const OutputSchema = z.strictObject({
  path: NonemptyStringSchema,
  sha256: HashSchema,
  pageCount: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});

const CommandReportObjectSchema = z.strictObject({
  ...verificationFields,
  reportVersion: z.literal('1'),
  command: z.enum(['verify', 'pdf']).optional(),
  toolVersion: NonemptyStringSchema,
  provenance: ProvenanceSchema,
  checks: CommandChecksSchema,
  output: OutputSchema.optional(),
});

type CommandReportData = z.infer<typeof CommandReportObjectSchema>;

function validateCommandProvenance(
  report: CommandReportData,
  ctx: z.RefinementCtx,
) {
  if (
    report.checks.independentReferenceAgreement.status !== 'not_applicable' &&
    (!report.provenance.reference ||
      report.provenance.reference.revisions.length === 0)
  ) {
    reportIssue(
      ctx,
      ['provenance', 'reference'],
      'REPORT_REFERENCE_PROVENANCE_REQUIRED',
      'Numerical reference checks require the captured reference path, hash and matched revisions.',
    );
  }
  if (!report.ok) return;
  if (!VersionsSchema.safeParse(report.provenance.versions).success) {
    reportIssue(
      ctx,
      ['provenance', 'versions'],
      'REPORT_SUCCESS_PROVENANCE_REQUIRED',
      'Successful commands require complete execution versions.',
    );
  }
  for (const key of [
    'entryModuleId',
    'entrySourceHash',
    'sourceClosureHash',
    'function',
    'resolvedInputs',
    'sourceManifest',
    'versions',
  ] as const) {
    if (report.provenance[key] === undefined) {
      reportIssue(
        ctx,
        ['provenance', key],
        'REPORT_SUCCESS_PROVENANCE_REQUIRED',
        'A successful verified command must record complete execution provenance.',
      );
    }
  }
}

function validateCommandFailure(
  report: CommandReportData,
  ctx: z.RefinementCtx,
) {
  for (const [key, stage] of [
    ['documentContent', 'document'],
    ['rendering', 'rendering'],
  ] as const) {
    if (
      report.checks[key].status === 'failed' &&
      !hasOwningDiagnostic(report.diagnostics, key, [stage])
    ) {
      reportIssue(
        ctx,
        ['checks', key],
        'REPORT_CHECK_DIAGNOSTIC_REQUIRED',
        'A failed check needs a diagnostic for that check or its owning stage.',
      );
    }
  }
  if (
    report.ok ||
    Object.values(report.checks).some((check) => check.status === 'failed')
  )
    return;
  const explained = commandFailureExplained(report);
  if (!explained) {
    reportIssue(
      ctx,
      ['diagnostics'],
      'REPORT_FAILURE_STAGE_MISMATCH',
      'A failed command must identify the stage that failed before the remaining checks could run.',
    );
  }
}

function commandFailureExplained(report: CommandReportData) {
  if (report.checks.executionValidity.status === 'not_applicable') {
    return hasOwningDiagnostic(report.diagnostics, 'executionValidity', [
      'usage',
      'source',
      'execution',
      'contract',
    ]);
  }
  const referenceFailure =
    report.checks.independentReferenceAgreement.status === 'not_applicable' &&
    hasOwningDiagnostic(report.diagnostics, 'independentReferenceAgreement', [
      'reference',
    ]);
  if (report.command === 'verify') return referenceFailure;
  if (report.command !== 'pdf') return false;
  if (report.checks.documentContent.status === 'not_applicable') {
    return referenceFailure;
  }
  if (report.checks.rendering.status === 'not_applicable') return false;
  return report.diagnostics.some(
    (diagnostic) =>
      diagnostic.stage === 'write' && diagnostic.check === undefined,
  );
}

export const CommandReportSchema = CommandReportObjectSchema.superRefine(
  (report, ctx) => {
    validateVerificationChecks(report.checks, ctx);
    validateCheckDiagnostics(report.checks, report.diagnostics, ctx);
    validateCommandProvenance(report, ctx);
    validateCommandFailure(report, ctx);
    const verified = verificationPassed(report.checks);
    const documentPassed = report.checks.documentContent.status === 'passed';
    const rendered = report.checks.rendering.status === 'passed';
    if (!report.ok && report.diagnostics.length === 0) {
      reportIssue(
        ctx,
        ['diagnostics'],
        'REPORT_FAILURE_DIAGNOSTIC_REQUIRED',
        'A failed command must explain the failure and any skipped stages.',
      );
    }
    if (
      report.command === undefined &&
      (report.ok ||
        !report.diagnostics.some((diagnostic) => diagnostic.stage === 'usage'))
    ) {
      reportIssue(
        ctx,
        ['command'],
        'REPORT_COMMAND_REQUIRED',
        'Only a usage failure may omit an unknown command.',
      );
    }
    if (
      report.ok &&
      (!verified ||
        (report.command === 'pdf' &&
          (!documentPassed || !rendered || !report.output)))
    ) {
      reportIssue(
        ctx,
        ['ok'],
        'REPORT_OK_MISMATCH',
        'Command success requires verification and, for PDF, prepared content and written output.',
      );
    }
    for (const key of ['documentContent', 'rendering'] as const) {
      if (
        (report.command !== 'pdf' || !verified) &&
        report.checks[key].status !== 'not_applicable'
      ) {
        reportIssue(
          ctx,
          ['checks', key, 'status'],
          'REPORT_PREREQUISITE_FAILED',
          'Document stages require a PDF command and passed verification.',
        );
      }
    }
    if (
      !documentPassed &&
      report.checks.rendering.status !== 'not_applicable'
    ) {
      reportIssue(
        ctx,
        ['checks', 'rendering', 'status'],
        'REPORT_PREREQUISITE_FAILED',
        'Rendering requires passed document preparation.',
      );
    }
    if (
      report.output &&
      (!report.ok ||
        report.command !== 'pdf' ||
        !verified ||
        !documentPassed ||
        !rendered)
    ) {
      reportIssue(
        ctx,
        ['output'],
        'REPORT_OUTPUT_WITHOUT_SUCCESS',
        'Output identifies a successfully verified and written PDF only.',
      );
    }
    const inspectionStatus = report.output ? 'pending' : 'not_applicable';
    if (report.checks.visualInspection.status !== inspectionStatus) {
      reportIssue(
        ctx,
        ['checks', 'visualInspection', 'status'],
        'REPORT_INSPECTION_STATUS_MISMATCH',
        'New PDF output awaits inspection; a command without output has no inspection.',
      );
    }
  },
);
export type CommandReport = z.infer<typeof CommandReportSchema>;

const PageInspectionSchema = z
  .strictObject({
    page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    status: z.enum(['passed', 'failed']),
    findings: z.array(NonemptyStringSchema),
  })
  .superRefine((page, ctx) => {
    if (page.status === 'failed' && page.findings.length === 0) {
      reportIssue(
        ctx,
        ['findings'],
        'INSPECTION_FINDING_REQUIRED',
        'A failed page must record its findings.',
      );
    }
  });

export const InspectionEvidenceSchema = z
  .strictObject({
    status: z.enum(['passed', 'failed']),
    sha256: HashSchema,
    contentLedgerSha256: HashSchema,
    pageCount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    pages: z.array(PageInspectionSchema).min(1),
  })
  .superRefine((evidence, ctx) => {
    const seen = new Set(evidence.pages.map((page) => page.page));
    if (
      evidence.pages.length !== evidence.pageCount ||
      seen.size !== evidence.pageCount ||
      evidence.pages.some((page) => page.page > evidence.pageCount)
    ) {
      reportIssue(
        ctx,
        ['pages'],
        'INSPECTION_PAGE_COVERAGE',
        'Inspection must contain each page from 1 through pageCount exactly once.',
      );
    }
    const expectedStatus = evidence.pages.some(
      (page) => page.status === 'failed',
    )
      ? 'failed'
      : 'passed';
    if (evidence.status !== expectedStatus) {
      reportIssue(
        ctx,
        ['status'],
        'INSPECTION_STATUS_MISMATCH',
        'Inspection status must agree with every page finding.',
      );
    }
  });
export type InspectionEvidence = z.infer<typeof InspectionEvidenceSchema>;
