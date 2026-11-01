import { collectCsoSymbols } from '../contracts/common';
import type { ExecutionPayload } from '../contracts/execution';
import { usedReferenceNames, usedSymbolIds } from './branches';

type ApplicabilityCondition = {
  readonly id: string;
  readonly targets: readonly string[];
  readonly explanation: string;
  readonly nodes: readonly {
    readonly key: string;
    readonly mode?: string;
  }[];
};

type ApplicabilityPlan = {
  readonly id: string;
  readonly function: string;
  readonly moduleId: string;
  readonly checks?: readonly ApplicabilityCondition[];
  readonly applicability?: readonly ApplicabilityCondition[];
  readonly helpers: readonly ApplicabilityPlan[];
};

const append = (current: readonly string[], reason: string): string[] =>
  current.includes(reason) ? [...current] : [...current, reason];

export function deriveApplicability(execution: ExecutionPayload): {
  readonly reasonsBySymbolId: ReadonlyMap<string, readonly string[]>;
  readonly reasonsByCheck: ReadonlyMap<string, readonly string[]>;
} {
  const plans = (execution.methods ?? []) as readonly ApplicabilityPlan[];
  const reasons = new Map<string, string[]>();
  const namesByInvocation = new Map<string, Map<string, string>>();
  const valuesBySymbol = new Map<string, number>();
  const valuesByName = new Map<string, Map<string, number>>();
  const symbolsById = new Map(
    collectCsoSymbols(execution.cso).map((symbol) => [symbol.id, symbol]),
  );
  for (const invocation of execution.invocations) {
    const names = new Map<string, string>();
    const values = new Map<string, number>();
    for (const definition of invocation.symbols) {
      names.set(definition.variableName, definition.symbolId);
      const result = symbolsById.get(definition.symbolId)?.valueTree.result;
      if (result?.kind === 'number') {
        valuesBySymbol.set(definition.symbolId, result.value);
        values.set(definition.variableName, result.value);
      }
    }
    for (const binding of invocation.inputBindings) {
      if (binding.kind === 'callerSymbol') {
        names.set(binding.parameterName, binding.source.symbolId);
      }
      const value = invocation.resolvedInputs[binding.parameterName];
      if (typeof value === 'number') {
        values.set(binding.parameterName, value);
      }
    }
    namesByInvocation.set(invocation.id, names);
    valuesByName.set(invocation.id, values);
  }
  const plansByMethod = new Map<string, ApplicabilityPlan>();
  const visit = (plan: ApplicabilityPlan): void => {
    plansByMethod.set(plan.id, plan);
    for (const helper of plan.helpers) visit(helper);
  };
  for (const plan of plans) visit(plan);
  for (const outcome of execution.applicabilityOutcomes ?? []) {
    if (outcome.value) continue;
    const explanation = plansByMethod
      .get(outcome.methodId)
      ?.applicability?.find(
        (item) => item.id === outcome.applicabilityId,
      )?.explanation;
    if (!explanation) continue;
    const names = namesByInvocation.get(outcome.invocationId);
    const plan = plansByMethod.get(outcome.methodId);
    const targets =
      plan?.applicability?.find((item) => item.id === outcome.applicabilityId)
        ?.targets ?? [];
    for (const target of targets) {
      const symbolId = names?.get(target);
      if (!symbolId) continue;
      reasons.set(symbolId, append(reasons.get(symbolId) ?? [], explanation));
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const invocation of execution.invocations) {
      for (const definition of invocation.symbols) {
        const symbol = symbolsById.get(definition.symbolId);
        if (!symbol) continue;
        const used = usedSymbolIds(
          symbol.valueTree.nodes,
          symbol.valueTree.rootKey,
          valuesBySymbol,
        );
        if (!used) continue;
        let next = reasons.get(definition.symbolId) ?? [];
        for (const usedId of used) {
          if (usedId === definition.symbolId) continue;
          for (const reason of reasons.get(usedId) ?? []) {
            const appended = append(next, reason);
            if (appended.length !== next.length) {
              next = appended;
              changed = true;
            }
          }
        }
        if (next.length > 0) reasons.set(definition.symbolId, next);
      }
    }
  }
  const checkReasons = new Map<string, string[]>();
  const recordCheck = (plan: ApplicabilityPlan, invocationId: string): void => {
    const names = namesByInvocation.get(invocationId);
    const values = valuesByName.get(invocationId) ?? new Map();
    for (const check of plan.checks ?? []) {
      const collected: string[] = [];
      const absorb = (symbolId: string | undefined) => {
        if (!symbolId) return;
        for (const reason of reasons.get(symbolId) ?? []) {
          const next = append(collected, reason);
          collected.splice(0, collected.length, ...next);
        }
      };
      for (const target of check.targets) absorb(names?.get(target));
      const used = usedReferenceNames(
        check.nodes,
        check.nodes[0]?.key ?? '',
        values,
      );
      for (const name of used ?? []) absorb(names?.get(name));
      if (collected.length > 0) {
        checkReasons.set(`${invocationId}|${check.id}`, collected);
      }
    }
  };
  for (const invocation of execution.invocations) {
    const walkPlans = (plan: ApplicabilityPlan): void => {
      if (
        invocation.function === plan.function &&
        invocation.moduleId === plan.moduleId
      ) {
        recordCheck(plan, invocation.id);
      }
      for (const helper of plan.helpers) walkPlans(helper);
    };
    for (const plan of plans) walkPlans(plan);
  }
  return { reasonsBySymbolId: reasons, reasonsByCheck: checkReasons };
}
