import { CommandReportSchema, type CommandReport } from '@viktar-b/cso-core';
import { version } from '../package.json';

export function initialReport(command?: 'verify' | 'pdf'): CommandReport {
  return {
    reportVersion: '1',
    command,
    toolVersion: version,
    ok: false,
    provenance: {},
    numericPolicy: {
      absoluteTolerance: 1e-9,
      relativeTolerance: 1e-12,
      numberDomain: 'finite-real-safe-integer',
    },
    checks: {
      executionValidity: { status: 'not_applicable' },
      inputConsistency: { status: 'not_applicable' },
      constantConsistency: { status: 'not_applicable' },
      formulaConsistency: { status: 'not_applicable' },
      outputConsistency: {
        status: 'not_applicable',
        counts: { checked: 0, passed: 0, failed: 0 },
      },
      sourceToDocumentConsistency: { status: 'not_applicable' },
      independentReferenceAgreement: { status: 'not_applicable' },
      documentContent: { status: 'not_applicable' },
      rendering: { status: 'not_applicable' },
      visualInspection: { status: 'not_applicable' },
    },
    diagnostics: [],
  };
}

export function usageReport(
  failure:
    | { kind: 'unavailable'; command: 'verify' | 'pdf' }
    | { kind: 'unknown'; command: string },
): CommandReport {
  return CommandReportSchema.parse({
    reportVersion: '1',
    command: failure.kind === 'unavailable' ? failure.command : undefined,
    toolVersion: version,
    ok: false,
    provenance: {},
    numericPolicy: {
      absoluteTolerance: 1e-9,
      relativeTolerance: 1e-12,
      numberDomain: 'finite-real-safe-integer',
    },
    checks: Object.fromEntries(
      [
        'executionValidity',
        'inputConsistency',
        'constantConsistency',
        'formulaConsistency',
        'outputConsistency',
        'sourceToDocumentConsistency',
        'independentReferenceAgreement',
        'documentContent',
        'rendering',
        'visualInspection',
      ].map((name) => [
        name,
        {
          status: 'not_applicable',
          ...(name === 'outputConsistency'
            ? { counts: { checked: 0, passed: 0, failed: 0 } }
            : {}),
        },
      ]),
    ),
    diagnostics: [
      {
        code:
          failure.kind === 'unavailable'
            ? 'COMMAND_UNAVAILABLE'
            : 'UNKNOWN_COMMAND',
        stage: 'usage',
        message:
          failure.kind === 'unavailable'
            ? 'Verified commands are unavailable until ticket11 integration. No execution, verification, rendering or inspection ran.'
            : `Unknown command ${failure.command}. Use cso --help for supported commands. No checks ran.`,
      },
    ],
  });
}
