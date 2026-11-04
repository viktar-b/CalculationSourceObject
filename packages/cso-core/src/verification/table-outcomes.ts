import type { ExecutionPayload } from '../contracts/execution.ts';
import type { PreparedOutcomeRow } from '../contracts/table-outcomes.ts';
import { deriveApplicability } from './applicability.ts';
import { methodInvocationBindings } from './method-bindings.ts';

type Table = NonNullable<ExecutionPayload['tables']>[number];
/** Retain captured Boolean evidence. Presentation never evaluates predicates. */
export function tableOutcomeRows(
  execution: ExecutionPayload,
  table: Table,
): PreparedOutcomeRow[] {
  const method = execution.methods?.find((item) => item.id === table.methodId);
  if (!method) return [];
  const applicability = deriveApplicability(execution);
  const plans = [
    method,
    ...method.helpers.flatMap(function walk(helper): typeof method.helpers {
      return [helper, ...helper.helpers.flatMap(walk)];
    }),
  ];
  const bindings = table.cases.flatMap((caseItem) =>
    methodInvocationBindings(execution, method, caseItem.invocationId).map(
      (binding) => ({ ...binding, heading: caseItem.heading }),
    ),
  );
  const rows: PreparedOutcomeRow[] = [];
  for (const plan of plans) {
    const declarations = [
      ...(plan.booleans ?? [])
        .filter(
          (item) =>
            plan.id !== method.id || (table.booleans ?? []).includes(item.id),
        )
        .map((item) => ({ kind: 'boolean' as const, declaration: item })),
      ...(plan.checks ?? []).map((item) => ({
        kind: 'check' as const,
        declaration: item,
      })),
      ...(plan.applicability ?? []).map((item) => ({
        kind: 'applicability' as const,
        declaration: item,
      })),
    ];
    for (const { kind, declaration } of declarations) {
      rows.push({
        kind,
        id: JSON.stringify([plan.id, kind, declaration.id]),
        localId: declaration.id,
        label:
          'description' in declaration
            ? declaration.description
            : declaration.explanation,
        predicateText: declaration.predicateText,
        ...(kind !== 'boolean' ||
        ('expression' in declaration &&
          declaration.expression.kind === 'predicate')
          ? {
              predicateSymbolId: JSON.stringify([
                plan.id,
                kind,
                declaration.id,
              ]),
            }
          : {}),
        cells: table.cases.map(({ heading }) => ({
          heading,
          results: bindings
            .filter(
              (binding) =>
                binding.plan.id === plan.id && binding.heading === heading,
            )
            .flatMap(({ invocation, callPath }) => {
              const outcome =
                kind === 'boolean'
                  ? execution.booleanOutcomes?.find(
                      (item) =>
                        item.methodId === plan.id &&
                        item.invocationId === invocation.id &&
                        item.booleanId === declaration.id,
                    )
                  : kind === 'check'
                    ? execution.checkOutcomes?.find(
                        (item) =>
                          item.methodId === plan.id &&
                          item.invocationId === invocation.id &&
                          item.checkId === declaration.id,
                      )
                    : execution.applicabilityOutcomes?.find(
                        (item) =>
                          item.methodId === plan.id &&
                          item.invocationId === invocation.id &&
                          item.applicabilityId === declaration.id,
                      );
              if (!outcome) return [];
              const reasons =
                kind === 'check'
                  ? applicability.reasonsByCheck.get(
                      `${invocation.id}|${declaration.id}`,
                    )
                  : kind === 'applicability'
                    ? applicability.reasonsByApplicability.get(
                        `${invocation.id}|${declaration.id}`,
                      )
                    : undefined;
              return [
                {
                  invocationId: invocation.id,
                  value: outcome.value,
                  ...(callPath.length
                    ? { callPath: callPath.join(' / ') }
                    : {}),
                  ...(reasons?.length ? { reasons: [...reasons] } : {}),
                },
              ];
            }),
        })),
      });
    }
  }
  return rows;
}
