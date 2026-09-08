import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { sourceClosureHash } from '../src/contracts/common.ts';
import {
  CheckSchema,
  CommandReportSchema,
  InspectionEvidenceSchema,
  VerificationReportSchema,
} from '../src/contracts/reports.ts';

const passed = { status: 'passed' };
const numericPassed = {
  status: 'passed',
  counts: { checked: 1, passed: 1, failed: 0 },
};
const skipped = { status: 'not_applicable' };
const empty = {
  status: 'not_applicable',
  counts: { checked: 0, passed: 0, failed: 0 },
};
const numericPolicy = {
  absoluteTolerance: 1e-9,
  relativeTolerance: 1e-12,
  numberDomain: 'finite-real-safe-integer',
};
const hash = 'a'.repeat(64);
const sourceManifest = [{ moduleId: 'illustration.cso.py', sha256: hash }];
const provenance = {
  entryModuleId: 'illustration.cso.py',
  entrySourceHash: hash,
  sourceClosureHash: sourceClosureHash(sourceManifest),
  function: 'calculate_illustration',
  resolvedInputs: { width: 2 },
  sourceManifest,
  versions: {
    pythonPackage: '0.1.0',
    pythonInterpreter: '/illustrative/venv/bin/python',
    pythonVersion: '3.11.0',
  },
};

function verificationReport() {
  return {
    ok: true,
    numericPolicy,
    checks: {
      executionValidity: passed,
      inputConsistency: numericPassed,
      constantConsistency: empty,
      formulaConsistency: empty,
      sourceToDocumentConsistency: passed,
      independentReferenceAgreement: skipped,
    },
    diagnostics: [],
  };
}

function pdfReport() {
  return {
    ...verificationReport(),
    reportVersion: '1',
    command: 'pdf',
    toolVersion: '0.1.0',
    provenance,
    checks: {
      ...verificationReport().checks,
      documentContent: passed,
      rendering: passed,
      visualInspection: { status: 'pending' },
    },
    output: { path: '/output/calculation.pdf', sha256: hash },
  };
}

function expectCode(schema: z.ZodType, input: unknown, diagnosticCode: string) {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(
      result.error.issues.some(
        (issue) =>
          issue.code === 'custom' &&
          issue.params?.diagnosticCode === diagnosticCode,
      ),
    ).toBe(true);
  }
}

describe('check and verification report contracts', () => {
  it('keeps input-only success separate from independent reference evidence', () => {
    const report = VerificationReportSchema.parse(verificationReport());
    expect(report.checks.formulaConsistency).toEqual(empty);
    expect(report.checks.independentReferenceAgreement.status).toBe(
      'not_applicable',
    );
  });

  it('uses fixed finite-real and safe-integer comparison policy', () => {
    for (const policy of [
      { ...numericPolicy, absoluteTolerance: 1e-8 },
      { ...numericPolicy, relativeTolerance: 1e-9 },
      { ...numericPolicy, numberDomain: 'float' },
      { ...numericPolicy, hidden: true },
    ]) {
      expect(
        VerificationReportSchema.safeParse({
          ...verificationReport(),
          numericPolicy: policy,
        }).success,
      ).toBe(false);
    }
  });

  it('rejects fictitious empty passes and inconsistent counts', () => {
    expectCode(
      CheckSchema,
      { status: 'passed', counts: { checked: 0, passed: 0, failed: 0 } },
      'REPORT_EMPTY_CHECK_PASSED',
    );
    expectCode(
      CheckSchema,
      { status: 'passed', counts: { checked: 2, passed: 1, failed: 0 } },
      'REPORT_COUNT_MISMATCH',
    );
    expectCode(
      CheckSchema,
      { status: 'passed', counts: { checked: 1, passed: 0, failed: 1 } },
      'REPORT_CHECK_STATUS_MISMATCH',
    );
    expectCode(
      CheckSchema,
      {
        status: 'not_applicable',
        counts: { checked: 1, passed: 1, failed: 0 },
      },
      'REPORT_CHECK_STATUS_MISMATCH',
    );
    expect(
      CheckSchema.safeParse({
        status: 'passed',
        counts: { checked: 0.5, passed: 0.5, failed: 0 },
      }).success,
    ).toBe(false);
  });

  it('requires documented-result counts for every passed numeric category', () => {
    const report = verificationReport();
    for (const key of [
      'inputConsistency',
      'constantConsistency',
      'formulaConsistency',
      'independentReferenceAgreement',
    ]) {
      expectCode(
        VerificationReportSchema,
        {
          ...report,
          checks: { ...report.checks, [key]: passed },
        },
        'REPORT_NUMERIC_COVERAGE_REQUIRED',
      );
      expect(
        VerificationReportSchema.parse({
          ...report,
          checks: { ...report.checks, [key]: numericPassed },
        }).ok,
      ).toBe(true);
    }
  });

  it('does not substitute cache-only coverage for documented numeric comparisons', () => {
    const report = verificationReport();
    for (const key of [
      'inputConsistency',
      'constantConsistency',
      'formulaConsistency',
      'independentReferenceAgreement',
    ]) {
      for (const counts of [undefined, { checked: 0, passed: 0, failed: 0 }]) {
        expectCode(
          VerificationReportSchema,
          {
            ...report,
            checks: {
              ...report.checks,
              [key]: {
                status: 'passed',
                counts,
                cacheCounts: { checked: 2, passed: 2, failed: 0 },
              },
            },
          },
          'REPORT_NUMERIC_COVERAGE_REQUIRED',
        );
      }
    }
  });

  it('records cache counts separately and propagates cache failures', () => {
    const check = {
      status: 'failed',
      counts: { checked: 1, passed: 1, failed: 0 },
      cacheCounts: { checked: 3, passed: 2, failed: 1 },
    };
    expect(CheckSchema.parse(check)).toEqual(check);
    expectCode(
      CheckSchema,
      { ...check, status: 'passed' },
      'REPORT_CHECK_STATUS_MISMATCH',
    );
  });

  it('requires zero counts for empty categories after valid execution', () => {
    const report = verificationReport();
    expectCode(
      VerificationReportSchema,
      {
        ...report,
        checks: { ...report.checks, formulaConsistency: skipped },
      },
      'REPORT_EMPTY_CATEGORY_COUNT_REQUIRED',
    );
  });

  it('rejects a summary that conceals a formula failure', () => {
    const report = verificationReport();
    expectCode(
      VerificationReportSchema,
      {
        ...report,
        checks: { ...report.checks, formulaConsistency: { status: 'failed' } },
      },
      'REPORT_SOURCE_SUMMARY_MISMATCH',
    );
  });

  it('preserves independent reference evidence when only a cache comparison fails', () => {
    const report = verificationReport();
    const failed = {
      ...report,
      ok: false,
      checks: {
        ...report.checks,
        formulaConsistency: {
          status: 'failed',
          counts: { checked: 1, passed: 1, failed: 0 },
          cacheCounts: { checked: 1, passed: 0, failed: 1 },
        },
        sourceToDocumentConsistency: { status: 'failed' },
        independentReferenceAgreement: {
          status: 'passed',
          counts: { checked: 1, passed: 1, failed: 0 },
        },
      },
      diagnostics: [
        {
          code: 'CACHE_VALUE_MISMATCH',
          message:
            'Stored cache differs from evaluation; runtime and independent reference agree.',
          stage: 'verification',
          check: 'formulaConsistency',
        },
      ],
    };
    expect(
      VerificationReportSchema.parse(failed).checks
        .independentReferenceAgreement.status,
    ).toBe('passed');
    expectCode(
      VerificationReportSchema,
      { ...failed, ok: true },
      'REPORT_OK_MISMATCH',
    );
  });

  it('requires valid execution for numerical reference agreement', () => {
    const report = verificationReport();
    expectCode(
      VerificationReportSchema,
      {
        ...report,
        ok: false,
        checks: {
          executionValidity: { status: 'failed' },
          inputConsistency: skipped,
          constantConsistency: skipped,
          formulaConsistency: skipped,
          sourceToDocumentConsistency: { status: 'failed' },
          independentReferenceAgreement: passed,
        },
        diagnostics: [
          {
            code: 'EXECUTION_FAILURE',
            message: 'Execution invalid; numeric checks did not run.',
            stage: 'execution',
          },
        ],
      },
      'REPORT_PREREQUISITE_FAILED',
    );
  });

  it('preserves passed consistency when an independent reference fails', () => {
    const report = verificationReport();
    const failed = {
      ...report,
      ok: false,
      checks: {
        ...report.checks,
        independentReferenceAgreement: { status: 'failed' },
      },
      diagnostics: [
        {
          code: 'REFERENCE_VALUE_MISMATCH',
          message: 'Expected value differs.',
          stage: 'reference',
        },
      ],
    };
    expect(
      VerificationReportSchema.parse(failed).checks.sourceToDocumentConsistency
        .status,
    ).toBe('passed');
    expectCode(
      VerificationReportSchema,
      { ...failed, ok: true },
      'REPORT_OK_MISMATCH',
    );
    expectCode(
      VerificationReportSchema,
      { ...failed, diagnostics: [] },
      'REPORT_FAILURE_DIAGNOSTIC_REQUIRED',
    );
  });
});

describe('command report contracts', () => {
  it('allows verified generation while every-page inspection is pending', () => {
    const report = CommandReportSchema.parse(pdfReport());
    expect(report.ok).toBe(true);
    expect(report.output?.pageCount).toBeUndefined();
    expect(report.checks.visualInspection.status).toBe('pending');
  });

  it('requires complete provenance for successful verified commands', () => {
    const report = pdfReport();
    expectCode(
      CommandReportSchema,
      { ...report, provenance: {} },
      'REPORT_SUCCESS_PROVENANCE_REQUIRED',
    );
    for (const field of [
      'entryModuleId',
      'entrySourceHash',
      'sourceClosureHash',
      'function',
      'resolvedInputs',
      'sourceManifest',
      'versions',
    ]) {
      const partial = Object.fromEntries(
        Object.entries(provenance).filter(([key]) => key !== field),
      );
      expectCode(
        CommandReportSchema,
        { ...report, provenance: partial },
        'REPORT_SUCCESS_PROVENANCE_REQUIRED',
      );
    }
  });

  it('requires diagnostics to explain the actual failed check', () => {
    const report = verificationReport();
    const failure = {
      ...report,
      ok: false,
      checks: {
        ...report.checks,
        formulaConsistency: { status: 'failed' },
        sourceToDocumentConsistency: { status: 'failed' },
      },
      diagnostics: [
        {
          code: 'UNRELATED',
          message: 'A reference file could not be read.',
          stage: 'reference',
        },
      ],
    };
    expectCode(
      VerificationReportSchema,
      failure,
      'REPORT_CHECK_DIAGNOSTIC_REQUIRED',
    );
    expectCode(
      VerificationReportSchema,
      {
        ...failure,
        diagnostics: [
          {
            code: 'INPUT_FAILURE',
            message: 'Input differs.',
            stage: 'verification',
            check: 'inputConsistency',
          },
        ],
      },
      'REPORT_CHECK_DIAGNOSTIC_REQUIRED',
    );
    expect(
      VerificationReportSchema.parse({
        ...failure,
        diagnostics: [
          {
            code: 'FORMULA_FAILURE',
            message: 'Formula differs; reference checks did not run.',
            stage: 'verification',
            check: 'formulaConsistency',
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it('rejects unrelated diagnostics after an early failure', () => {
    const report = pdfReport();
    const failure = {
      ...report,
      ok: false,
      provenance: {},
      output: undefined,
      checks: Object.fromEntries(
        Object.keys(report.checks).map((key) => [key, skipped]),
      ),
      diagnostics: [
        {
          code: 'WRITE_FAILURE',
          message: 'Could not write output.',
          stage: 'write',
        },
      ],
    };
    expectCode(CommandReportSchema, failure, 'REPORT_FAILURE_STAGE_MISMATCH');
    expect(
      CommandReportSchema.parse({
        ...failure,
        diagnostics: [
          {
            code: 'SOURCE_FAILURE',
            message:
              'Source unreadable; execution and later checks did not run.',
            stage: 'source',
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it('rejects failed all-pass commands without a failure at the remaining stage', () => {
    const report = pdfReport();
    const failure = {
      ...report,
      ok: false,
      output: undefined,
      checks: { ...report.checks, visualInspection: skipped },
      diagnostics: [
        {
          code: 'UNRELATED',
          message: 'Verification detail.',
          stage: 'verification',
        },
      ],
    };
    expectCode(CommandReportSchema, failure, 'REPORT_FAILURE_STAGE_MISMATCH');
    expectCode(
      CommandReportSchema,
      {
        ...failure,
        diagnostics: [
          {
            code: 'USAGE_FAILURE',
            message: 'Usage failure despite completed execution.',
            stage: 'usage',
          },
        ],
      },
      'REPORT_FAILURE_STAGE_MISMATCH',
    );
    expectCode(
      CommandReportSchema,
      {
        ...failure,
        command: 'verify',
        checks: {
          ...failure.checks,
          documentContent: skipped,
          rendering: skipped,
        },
      },
      'REPORT_FAILURE_STAGE_MISMATCH',
    );
  });

  it('allows unreadable reference failure before any reference comparison', () => {
    const report = pdfReport();
    expect(
      CommandReportSchema.parse({
        ...report,
        command: 'verify',
        ok: false,
        output: undefined,
        checks: {
          ...report.checks,
          documentContent: skipped,
          rendering: skipped,
          visualInspection: skipped,
        },
        diagnostics: [
          {
            code: 'REFERENCE_UNREADABLE',
            message:
              'Reference file unreadable; reference comparison did not run.',
            stage: 'reference',
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it('requires the document and rendering failure diagnostics to belong to their stages', () => {
    const report = pdfReport();
    const failure = {
      ...report,
      ok: false,
      output: undefined,
      checks: {
        ...report.checks,
        documentContent: { status: 'failed' },
        rendering: skipped,
        visualInspection: skipped,
      },
      diagnostics: [
        {
          code: 'UNRELATED',
          message: 'Verification detail.',
          stage: 'verification',
        },
      ],
    };
    expectCode(
      CommandReportSchema,
      failure,
      'REPORT_CHECK_DIAGNOSTIC_REQUIRED',
    );
    expect(
      CommandReportSchema.parse({
        ...failure,
        diagnostics: [
          {
            code: 'CONTENT_FAILURE',
            message: 'Content missing; rendering and inspection did not run.',
            stage: 'document',
          },
        ],
      }).ok,
    ).toBe(false);
    expectCode(
      CommandReportSchema,
      {
        ...failure,
        checks: {
          ...failure.checks,
          documentContent: passed,
          rendering: { status: 'failed' },
        },
      },
      'REPORT_CHECK_DIAGNOSTIC_REQUIRED',
    );
  });

  it('requires a failed formula diagnostic to use its owning stage even with an explicit check', () => {
    const report = verificationReport();
    const failure = {
      ...report,
      ok: false,
      checks: {
        ...report.checks,
        formulaConsistency: { status: 'failed' },
        sourceToDocumentConsistency: { status: 'failed' },
      },
      diagnostics: [
        {
          code: 'FORMULA_VALUE_MISMATCH',
          message: 'Formula value differs.',
          check: 'formulaConsistency',
          stage: 'verification',
        },
      ],
    };
    expect(VerificationReportSchema.parse(failure).ok).toBe(false);
    expectCode(
      VerificationReportSchema,
      {
        ...failure,
        diagnostics: [{ ...failure.diagnostics[0], stage: 'usage' }],
      },
      'REPORT_CHECK_DIAGNOSTIC_REQUIRED',
    );
  });

  it('requires a failed document diagnostic to use its owning stage even with an explicit check', () => {
    const report = pdfReport();
    const failure = {
      ...report,
      ok: false,
      output: undefined,
      checks: {
        ...report.checks,
        documentContent: { status: 'failed' },
        rendering: skipped,
        visualInspection: skipped,
      },
      diagnostics: [
        {
          code: 'DOCUMENT_CONTENT_MISSING',
          message: 'Document content missing.',
          check: 'documentContent',
          stage: 'document',
        },
      ],
    };
    expect(CommandReportSchema.parse(failure).ok).toBe(false);
    expectCode(
      CommandReportSchema,
      {
        ...failure,
        diagnostics: [{ ...failure.diagnostics[0], stage: 'verification' }],
      },
      'REPORT_CHECK_DIAGNOSTIC_REQUIRED',
    );
  });

  it('records reached document preparation failure instead of hiding it as skipped', () => {
    const report = pdfReport();
    const failure = {
      ...report,
      ok: false,
      output: undefined,
      checks: {
        ...report.checks,
        documentContent: { status: 'failed' },
        rendering: skipped,
        visualInspection: skipped,
      },
      diagnostics: [
        {
          code: 'DOCUMENT_CONTENT_MISSING',
          message:
            'Preparation found a required figure without resolved content; rendering did not run.',
          stage: 'document',
          check: 'documentContent',
        },
      ],
    };
    const parsed = CommandReportSchema.parse(failure);
    expect(parsed.checks.sourceToDocumentConsistency.status).toBe('passed');
    expect(parsed.checks.documentContent.status).toBe('failed');
    expect(parsed.checks.rendering.status).toBe('not_applicable');
    expectCode(
      CommandReportSchema,
      { ...failure, checks: { ...failure.checks, documentContent: skipped } },
      'REPORT_FAILURE_STAGE_MISMATCH',
    );
  });

  it('records reached rendering failure instead of hiding it as skipped', () => {
    const report = pdfReport();
    const failure = {
      ...report,
      ok: false,
      output: undefined,
      checks: {
        ...report.checks,
        rendering: { status: 'failed' },
        visualInspection: skipped,
      },
      diagnostics: [
        {
          code: 'RENDERING_FAILURE',
          message: 'Browser rendering failed after document preparation.',
          stage: 'rendering',
        },
      ],
    };
    const parsed = CommandReportSchema.parse(failure);
    expect(parsed.checks.documentContent.status).toBe('passed');
    expect(parsed.checks.rendering.status).toBe('failed');
    expectCode(
      CommandReportSchema,
      { ...failure, checks: { ...failure.checks, rendering: skipped } },
      'REPORT_FAILURE_STAGE_MISMATCH',
    );
  });

  it('still skips PDF stages when reference data cannot be read before comparison', () => {
    const report = pdfReport();
    const failure = {
      ...report,
      ok: false,
      output: undefined,
      checks: {
        ...report.checks,
        documentContent: skipped,
        rendering: skipped,
        visualInspection: skipped,
      },
      diagnostics: [
        {
          code: 'REFERENCE_UNREADABLE',
          message:
            'Reference file unreadable; comparison and PDF stages did not run.',
          stage: 'reference',
        },
      ],
    };
    expect(
      CommandReportSchema.parse(failure).checks.documentContent.status,
    ).toBe('not_applicable');
  });

  it('requires captured reference provenance for passed and failed numerical agreement', () => {
    const pdf = pdfReport();
    const reference = {
      path: '/illustrative/references.json',
      sha256: hash,
      revisions: ['illustration-v1'],
    };
    for (const status of ['passed', 'failed']) {
      const report = {
        ...pdf,
        command: 'verify',
        ok: status === 'passed',
        output: undefined,
        checks: {
          ...pdf.checks,
          independentReferenceAgreement:
            status === 'passed' ? numericPassed : { status },
          documentContent: skipped,
          rendering: skipped,
          visualInspection: skipped,
        },
        diagnostics:
          status === 'failed'
            ? [
                {
                  code: 'REFERENCE_VALUE_MISMATCH',
                  message: 'Independent expectation differs.',
                  stage: 'reference',
                },
              ]
            : [],
      };
      expectCode(
        CommandReportSchema,
        report,
        'REPORT_REFERENCE_PROVENANCE_REQUIRED',
      );
      expectCode(
        CommandReportSchema,
        {
          ...report,
          provenance: {
            ...provenance,
            reference: { ...reference, revisions: [] },
          },
        },
        'REPORT_REFERENCE_PROVENANCE_REQUIRED',
      );
      expect(
        CommandReportSchema.parse({
          ...report,
          provenance: { ...provenance, reference },
        }).checks.independentReferenceAgreement.status,
      ).toBe(status);
    }
  });

  it('allows captured reference provenance without matched revisions when comparison is not applicable', () => {
    const report = pdfReport();
    expect(
      CommandReportSchema.parse({
        ...report,
        provenance: {
          ...provenance,
          reference: {
            path: '/illustrative/references.json',
            sha256: hash,
            revisions: [],
          },
        },
      }).checks.independentReferenceAgreement.status,
    ).toBe('not_applicable');
  });

  it('accepts a usage error with no invented command or provenance', () => {
    expect(
      CommandReportSchema.parse({
        reportVersion: '1',
        ok: false,
        toolVersion: '0.1.0',
        provenance: {},
        numericPolicy,
        checks: {
          executionValidity: skipped,
          inputConsistency: skipped,
          constantConsistency: skipped,
          formulaConsistency: skipped,
          sourceToDocumentConsistency: skipped,
          independentReferenceAgreement: skipped,
          documentContent: skipped,
          rendering: skipped,
          visualInspection: skipped,
        },
        diagnostics: [
          {
            code: 'UNKNOWN_COMMAND',
            message: 'Unknown command; execution and later checks did not run.',
            stage: 'usage',
          },
        ],
      }).command,
    ).toBeUndefined();
  });

  it('keeps execution failure visible with skipped dependent checks', () => {
    const report = pdfReport();
    const failed = {
      ...report,
      ok: false,
      output: undefined,
      checks: {
        executionValidity: { status: 'failed' },
        inputConsistency: skipped,
        constantConsistency: skipped,
        formulaConsistency: skipped,
        sourceToDocumentConsistency: { status: 'failed' },
        independentReferenceAgreement: skipped,
        documentContent: skipped,
        rendering: skipped,
        visualInspection: skipped,
      },
      diagnostics: [
        {
          code: 'EXECUTION_FAILURE',
          message: 'Execution failed; dependent checks did not run.',
          stage: 'execution',
        },
      ],
    };
    expect(CommandReportSchema.parse(failed).ok).toBe(false);
    expectCode(
      CommandReportSchema,
      { ...failed, checks: { ...failed.checks, formulaConsistency: passed } },
      'REPORT_PREREQUISITE_FAILED',
    );
  });

  it('rejects successful output without verification or rendering', () => {
    const report = pdfReport();
    expectCode(
      CommandReportSchema,
      { ...report, output: undefined },
      'REPORT_OK_MISMATCH',
    );
    expectCode(
      CommandReportSchema,
      { ...report, checks: { ...report.checks, rendering: skipped } },
      'REPORT_OK_MISMATCH',
    );
    expectCode(
      CommandReportSchema,
      { ...report, ok: false },
      'REPORT_OUTPUT_WITHOUT_SUCCESS',
    );
    expectCode(
      CommandReportSchema,
      { ...report, command: 'verify' },
      'REPORT_OUTPUT_WITHOUT_SUCCESS',
    );
  });

  it('prevents new reports from claiming visual approval', () => {
    const report = pdfReport();
    expect(
      CommandReportSchema.safeParse({
        ...report,
        checks: { ...report.checks, visualInspection: { status: 'passed' } },
      }).success,
    ).toBe(false);
    expectCode(
      CommandReportSchema,
      { ...report, checks: { ...report.checks, visualInspection: skipped } },
      'REPORT_INSPECTION_STATUS_MISMATCH',
    );
  });

  it('keeps successful verify commands free of document and inspection claims', () => {
    const report = pdfReport();
    const verify = {
      ...report,
      command: 'verify',
      output: undefined,
      checks: {
        ...report.checks,
        documentContent: skipped,
        rendering: skipped,
        visualInspection: skipped,
      },
    };
    expect(CommandReportSchema.parse(verify).ok).toBe(true);
    expectCode(
      CommandReportSchema,
      {
        ...verify,
        checks: { ...verify.checks, visualInspection: { status: 'pending' } },
      },
      'REPORT_INSPECTION_STATUS_MISMATCH',
    );
  });

  it('does not let a write failure imply that output exists', () => {
    const report = pdfReport();
    expect(
      CommandReportSchema.parse({
        ...report,
        ok: false,
        output: undefined,
        checks: { ...report.checks, visualInspection: skipped },
        diagnostics: [
          {
            code: 'WRITE_FAILURE',
            message: 'Could not replace output.',
            stage: 'write',
          },
        ],
      }).ok,
    ).toBe(false);
  });
});

describe('standalone inspection evidence', () => {
  const evidence = {
    status: 'passed',
    sha256: hash,
    contentLedgerSha256: 'b'.repeat(64),
    pageCount: 2,
    pages: [
      {
        page: 1,
        status: 'passed',
        findings: ['Notation and content checked.'],
      },
      { page: 2, status: 'passed', findings: ['Pagination checked.'] },
    ],
  };

  it('binds complete per-page findings to the PDF and content ledger hashes', () => {
    expect(InspectionEvidenceSchema.parse(evidence)).toEqual(evidence);
    expect(
      InspectionEvidenceSchema.safeParse({
        ...evidence,
        contentLedgerSha256: undefined,
      }).success,
    ).toBe(false);
    expect(
      InspectionEvidenceSchema.safeParse({ ...evidence, sha256: 'not-a-hash' })
        .success,
    ).toBe(false);
  });

  it('rejects missing, duplicated and out-of-range pages', () => {
    for (const pages of [
      [evidence.pages[0]],
      [evidence.pages[0], evidence.pages[0]],
      [...evidence.pages, { page: 3, status: 'passed', findings: [] }],
      [
        { page: 1, status: 'passed', findings: [] },
        { page: 3, status: 'passed', findings: [] },
      ],
    ]) {
      expectCode(
        InspectionEvidenceSchema,
        { ...evidence, pages },
        'INSPECTION_PAGE_COVERAGE',
      );
    }
  });

  it('requires explained failures and agrees with page outcomes', () => {
    const pages = [
      { page: 1, status: 'passed', findings: [] },
      {
        page: 2,
        status: 'failed',
        findings: ['Formula clipped at right margin.'],
      },
    ];
    expectCode(
      InspectionEvidenceSchema,
      { ...evidence, pages },
      'INSPECTION_STATUS_MISMATCH',
    );
    expect(
      InspectionEvidenceSchema.parse({ ...evidence, status: 'failed', pages })
        .status,
    ).toBe('failed');
    expectCode(
      InspectionEvidenceSchema,
      {
        ...evidence,
        status: 'failed',
        pages: [pages[0], { page: 2, status: 'failed', findings: [] }],
      },
      'INSPECTION_FINDING_REQUIRED',
    );
  });
});
