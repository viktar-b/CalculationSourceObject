import type { CalculationSourceValueNode } from '../calculation-source/object-schema.ts';
import { collectCsoSymbols, exactCaptureHash } from '../contracts/common.ts';
import { methodExternalCalls } from '../contracts/external.ts';
import type {
  ExecutionPayload,
  MethodContentItem,
} from '../contracts/execution.ts';
import { validateOperation } from './numeric.ts';

type Method = NonNullable<ExecutionPayload['methods']>[number];
type Plan = Method | Method['helpers'][number];
type Invocation = ExecutionPayload['invocations'][number];
type SymbolicNode = Plan['quantities'][number]['nodes'][number];
type Issue = (code: string, path: (string | number)[], message: string) => void;

export const methodCalls = (
  content: readonly MethodContentItem[],
): Extract<MethodContentItem, { kind: 'call' }>[] =>
  content.flatMap((item) =>
    item.kind === 'call'
      ? [item]
      : item.kind === 'section'
        ? methodCalls(item.content)
        : [],
  );

const helperIndex = (method: Method): Map<string, Plan> => {
  const helpers = new Map<string, Plan>();
  const visit = (plan: Plan): void => {
    if (helpers.has(plan.id)) return;
    helpers.set(plan.id, plan);
    plan.helpers.forEach(visit);
  };
  visit(method);
  return helpers;
};

/** Bind call sites, never equal values or matching function names alone. */
export const methodInvocationBindings = (
  execution: ExecutionPayload,
  method: Method,
  invocationId: string,
): { plan: Plan; invocation: Invocation; callPath: string[] }[] => {
  const helpers = helperIndex(method);
  const result: { plan: Plan; invocation: Invocation; callPath: string[] }[] =
    [];
  const visited = new Set<string>();
  const visit = (plan: Plan, id: string, callPath: string[]): void => {
    const invocation = execution.invocations.find((item) => item.id === id);
    if (!invocation || visited.has(id)) return;
    visited.add(id);
    result.push({ plan, invocation, callPath });
    for (const call of methodCalls(plan.content)) {
      const helper = helpers.get(call.helperId);
      const child = execution.invocations.find(
        (item) =>
          'parentInvocationId' in item &&
          item.parentInvocationId === id &&
          item.callBindingName === call.binding,
      );
      if (helper && child) visit(helper, child.id, [...callPath, call.binding]);
    }
  };
  visit(method, invocationId, []);
  return result;
};

type Node =
  | { kind: 'literal'; value: number; numericKind?: 'int' | 'float' }
  | { kind: 'symbol'; id: string }
  | { kind: 'function'; id: string; args: string[] };
type Graph = { root: string; nodes: ReadonlyMap<string, Node> };

const validGraph = (graph: Graph): boolean => {
  const active = new Set<string>();
  const done = new Set<string>();
  const visit = (key: string): boolean => {
    if (active.has(key)) return false;
    if (done.has(key)) return true;
    const node = graph.nodes.get(key);
    if (!node) return false;
    active.add(key);
    if (
      node.kind === 'function' &&
      (!validateOperation(node.id, node.args.length).ok ||
        !node.args.every(visit))
    )
      return false;
    active.delete(key);
    done.add(key);
    return true;
  };
  return visit(graph.root) && done.size === graph.nodes.size;
};

const sameFormula = (left: Graph, right: Graph): boolean => {
  if (!validGraph(left) || !validGraph(right)) return false;
  const compared = new Set<string>();
  const compare = (leftKey: string, rightKey: string): boolean => {
    const key = JSON.stringify([leftKey, rightKey]);
    if (compared.has(key)) return true;
    compared.add(key);
    const a = left.nodes.get(leftKey);
    const b = right.nodes.get(rightKey);
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'literal' && b.kind === 'literal')
      return Object.is(a.value, b.value) && a.numericKind === b.numericKind;
    if (a.kind === 'symbol' && b.kind === 'symbol') return a.id === b.id;
    return (
      a.kind === 'function' &&
      b.kind === 'function' &&
      a.id === b.id &&
      a.args.length === b.args.length &&
      a.args.every((arg, index) => compare(arg, b.args[index] ?? ''))
    );
  };
  return compare(left.root, right.root);
};

const capturedGraph = (
  nodes: readonly CalculationSourceValueNode[],
  root: string,
): Graph => ({
  root,
  nodes: new Map(
    nodes.flatMap((node): [string, Node][] => {
      if (node.mode === 'LITERAL' && node.literal?.kind === 'number')
        return [
          [
            node.key,
            {
              kind: 'literal',
              value: node.literal.value,
              numericKind: node.literal.numericKind,
            },
          ],
        ];
      if (node.mode === 'SYMBOL' && node.symbol)
        return [[node.key, { kind: 'symbol', id: node.symbol.id }]];
      if (node.mode === 'FUNCTION' && node.funcSpec && node.funcArgs)
        return [
          [
            node.key,
            {
              kind: 'function',
              id: node.funcSpec.id,
              args: node.funcArgs.map((arg) => arg.key),
            },
          ],
        ];
      return [];
    }),
  ),
});

const symbolicGraph = (
  nodes: readonly SymbolicNode[],
  resolve: (node: SymbolicNode) => Node | undefined,
): Graph => ({
  root: nodes[0]?.key ?? '',
  nodes: new Map(
    nodes.flatMap((node): [string, Node][] => {
      const bound = resolve(node);
      return bound ? [[node.key, bound]] : [];
    }),
  ),
});

export const validateMethodBindings = (
  execution: ExecutionPayload,
  issue: Issue,
): void => {
  const symbols = new Map(
    collectCsoSymbols(execution.cso).map((symbol) => [symbol.id, symbol]),
  );
  for (const [methodIndex, method] of (execution.methods ?? []).entries()) {
    const plans = helperIndex(method);
    const path = ['methods', methodIndex];
    const structuralNode = (
      plan: Plan,
      node: SymbolicNode,
    ): Node | undefined => {
      if (node.mode === 'LITERAL' && node.literal)
        return {
          kind: 'literal',
          value: node.literal.value,
          numericKind: node.literal.numericKind,
        };
      if (node.mode === 'FUNCTION' && node.funcSpec && node.funcArgs)
        return {
          kind: 'function',
          id: node.funcSpec.id,
          args: node.funcArgs.map((arg) => arg.key),
        };
      if (
        node.mode === 'GIVEN_PARAMETER' &&
        node.parameter &&
        plan.parameterNames.includes(node.parameter)
      )
        return { kind: 'symbol', id: node.parameter };
      if (node.mode === 'SYMBOL') {
        const ref = node.ref;
        if (
          ref?.kind === 'name' &&
          ref.name &&
          (plan.parameterNames.includes(ref.name) ||
            plan.quantities.some(
              (quantity) => quantity.variableName === ref.name,
            ))
        )
          return { kind: 'symbol', id: ref.name };
        if (ref?.kind === 'output') {
          const external = methodExternalCalls(plan.content).find(
            (item) => item.binding === ref.call,
          );
          const call = methodCalls(plan.content).find(
            (item) => item.binding === ref.call,
          );
          if (
            ref.output &&
            (external?.outputs.includes(ref.output) ||
              (call &&
                plans.get(call.helperId)?.outputNames.includes(ref.output)))
          )
            return {
              kind: 'symbol',
              id: JSON.stringify([ref.call, ref.output]),
            };
        }
      }
      return undefined;
    };
    for (const plan of plans.values()) {
      const sameNames = (left: string[], right: string[]) =>
        left.length === right.length &&
        new Set(left).size === left.length &&
        left.every((name) => right.includes(name));
      if (
        !sameNames(
          plan.quantities
            .filter((item) => item.role === 'input')
            .map((item) => item.selectionName),
          plan.parameterNames,
        ) ||
        !sameNames(
          plan.quantities
            .filter((item) => item.role === 'output')
            .map((item) => item.selectionName),
          plan.outputNames,
        ) ||
        new Set(plan.quantities.map((item) => item.variableName)).size !==
          plan.quantities.length ||
        plan.quantities.some(
          (item) => item.role !== 'input' && item.nodes.length === 0,
        )
      )
        issue(
          'INVALID_METHOD_FORMULA',
          path,
          `Method '${plan.function}' must explain each declared input and output with distinct quantities`,
        );
      const formulas = [
        ...plan.quantities
          .filter((quantity) => quantity.nodes.length > 0)
          .map((quantity) => quantity.nodes),
        ...[
          ...methodCalls(plan.content),
          ...methodExternalCalls(plan.content),
        ].flatMap((call) => call.inputs.map((input) => input.nodes)),
        ...(plan.checks ?? []).map((check) => check.nodes),
        ...(plan.applicability ?? []).map((condition) => condition.nodes),
      ];
      if (
        formulas.some((nodes) => {
          const graph = symbolicGraph(nodes, (node) =>
            structuralNode(plan, node),
          );
          return graph.nodes.size !== nodes.length || !validGraph(graph);
        })
      )
        issue(
          'INVALID_METHOD_FORMULA',
          path,
          `Method '${plan.function}' contains an invalid formula or unresolved reference`,
        );
    }
    for (const table of execution.tables ?? []) {
      if (table.methodId !== method.id) continue;
      for (const caseItem of table.cases) {
        for (const { plan, invocation } of methodInvocationBindings(
          execution,
          method,
          caseItem.invocationId,
        )) {
          const mismatch = (quantity: string): void =>
            issue(
              'METHOD_FORMULA_MISMATCH',
              path,
              `Method '${plan.function}', case '${caseItem.heading}', invocation '${invocation.id}', quantity '${quantity}' differs from the captured calculation`,
            );
          if (
            invocation.moduleId !== plan.moduleId ||
            invocation.function !== plan.function
          ) {
            mismatch('function');
            continue;
          }
          for (const definition of invocation.symbols) {
            if (
              !plan.quantities.some(
                (quantity) => quantity.variableName === definition.variableName,
              )
            )
              mismatch(definition.variableName);
          }
          for (const called of execution.invocations) {
            if (
              'parentInvocationId' in called &&
              called.parentInvocationId === invocation.id &&
              ![
                ...methodCalls(plan.content),
                ...methodExternalCalls(plan.content),
              ].some((call) => call.binding === called.callBindingName)
            )
              mismatch(called.callBindingName);
          }
          const child = (binding: string | undefined) =>
            execution.invocations.find(
              (item) =>
                'parentInvocationId' in item &&
                item.parentInvocationId === invocation.id &&
                item.callBindingName === binding,
            );
          const parameter = (name: string | undefined) =>
            execution.authoring?.parameters.find(
              (item) =>
                item.invocationId === invocation.id &&
                item.parameterName === name,
            );
          const resolve = (node: SymbolicNode): Node | undefined => {
            if (node.mode === 'GIVEN_PARAMETER') {
              const binding = invocation.inputBindings.find(
                (item) => item.parameterName === node.parameter,
              );
              if (!binding) return undefined;
              return binding.kind === 'callerSymbol'
                ? { kind: 'symbol', id: binding.source.symbolId }
                : {
                    kind: 'literal',
                    value: binding.value,
                    numericKind: binding.numericKind,
                  };
            }
            if (node.mode !== 'SYMBOL') return structuralNode(plan, node);
            const ref = node.ref;
            const id =
              ref?.kind === 'output'
                ? execution.authoring?.outputs.find(
                    (item) =>
                      item.invocationId === child(ref.call)?.id &&
                      item.name === ref.output,
                  )?.symbolId
                : (invocation.symbols.find(
                    (item) => item.variableName === ref?.name,
                  )?.symbolId ?? parameter(ref?.name)?.symbolId);
            return id ? { kind: 'symbol', id } : undefined;
          };
          const matches = (nodes: readonly SymbolicNode[], graph: Graph) => {
            const bound = symbolicGraph(nodes, resolve);
            return (
              bound.nodes.size === nodes.length && sameFormula(bound, graph)
            );
          };
          for (const quantity of plan.quantities) {
            const definition = invocation.symbols.find(
              (item) => item.variableName === quantity.variableName,
            );
            const output = execution.authoring?.outputs.find(
              (item) =>
                item.invocationId === invocation.id &&
                item.name === quantity.selectionName,
            );
            if (quantity.nodes.length === 0 && quantity.role === 'input') {
              if (!parameter(quantity.selectionName))
                mismatch(quantity.selectionName);
              continue;
            }
            if (
              quantity.role === 'output' &&
              (!output ||
                (definition && output.symbolId !== definition.symbolId))
            ) {
              mismatch(quantity.selectionName);
              continue;
            }
            if (!definition && quantity.role === 'output' && output) {
              if (
                !matches(quantity.nodes, {
                  root: 'output',
                  nodes: new Map([
                    ['output', { kind: 'symbol', id: output.symbolId }],
                  ]),
                })
              )
                mismatch(quantity.selectionName);
              continue;
            }
            const symbol = definition
              ? symbols.get(definition.symbolId)
              : undefined;
            if (
              !symbol ||
              !matches(
                quantity.nodes,
                capturedGraph(symbol.valueTree.nodes, symbol.valueTree.rootKey),
              )
            )
              mismatch(quantity.variableName);
          }
          for (const call of [
            ...methodCalls(plan.content),
            ...methodExternalCalls(plan.content),
          ]) {
            const called = child(call.binding);
            if (!called) {
              mismatch(call.binding);
              continue;
            }
            if (call.kind === 'external') {
              const captured = execution.externalCalls?.find(
                (item) =>
                  item.id === called.id &&
                  item.parentInvocationId === invocation.id &&
                  item.callBindingName === call.binding,
              );
              if (
                !captured ||
                exactCaptureHash(captured.declaration) !==
                  exactCaptureHash(call.declaration) ||
                exactCaptureHash(captured.adapter) !==
                  exactCaptureHash(call.adapter) ||
                exactCaptureHash(captured.callSite) !==
                  exactCaptureHash(call.callSite) ||
                captured.outputs.length !== call.outputs.length ||
                captured.outputs.some(
                  (output, index) => output.name !== call.outputs[index],
                )
              )
                mismatch(call.binding);
            } else {
              const helper = plans.get(call.helperId);
              if (
                !helper ||
                called.moduleId !== helper.moduleId ||
                called.function !== helper.function
              ) {
                mismatch(call.binding);
                continue;
              }
            }
            const provided = called.inputBindings.filter(
              (binding) => binding.kind !== 'parsedDefault',
            );
            if (provided.length !== call.inputs.length) mismatch(call.binding);
            for (const input of call.inputs) {
              const binding = called.inputBindings.find(
                (item) => item.parameterName === input.name,
              );
              const node: Node | undefined = !binding
                ? undefined
                : binding.kind === 'callerSymbol'
                  ? { kind: 'symbol', id: binding.source.symbolId }
                  : {
                      kind: 'literal',
                      value: binding.value,
                      numericKind: binding.numericKind,
                    };
              if (
                !node ||
                !matches(input.nodes, {
                  root: 'input',
                  nodes: new Map([['input', node]]),
                })
              )
                mismatch(`${call.binding}.${input.name}`);
            }
          }
        }
      }
    }
  }
};
