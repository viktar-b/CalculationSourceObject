import type { NumericKind } from '../contracts/numbers.ts';
import type {
  CalculationSourceSymbol,
  CalculationSourceValueNode,
} from '../calculation-source/object-schema.ts';
import {
  type Diagnostic,
  type NodeAddress,
  SourceSpanSchema,
  collectCsoSymbols,
} from '../contracts/common.ts';
import type {
  ExecutionPayload,
  Invocation,
  SymbolDefinition,
} from '../contracts/execution.ts';
import {
  type NumericResult,
  evaluateOperation,
  evaluateComparison,
  validateNumber,
  resolveOperation,
  type ValueRole,
} from './numeric.ts';

export type EvaluationResult =
  | {
      readonly ok: true;
      readonly value: number;
      readonly numericKind?: NumericKind;
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

type EvaluationFailure = Extract<EvaluationResult, { readonly ok: false }>;

export interface FormulaGraph {
  readonly symbol: CalculationSourceSymbol;
  readonly definition: SymbolDefinition;
  readonly invocation: Invocation;
  readonly nodes: ReadonlyMap<string, CalculationSourceValueNode>;
}

export interface FormulaEvaluator {
  readonly graphs: ReadonlyMap<string, FormulaGraph>;
  evaluate(address: NodeAddress): EvaluationResult;
  evaluateSymbol(symbolId: string): EvaluationResult;
  location(address: NodeAddress): Diagnostic['location'];
  callChain(
    invocationId: string,
  ): readonly NonNullable<Diagnostic['location']>[];
}

type EvaluationState =
  | { readonly kind: 'visiting' }
  | {
      readonly kind: 'resolved';
      readonly value: number;
      readonly numericKind?: NumericKind;
    }
  | { readonly kind: 'failed'; readonly diagnostics: readonly Diagnostic[] };

type StructureState =
  | { readonly kind: 'visiting' }
  | { readonly kind: 'resolved'; readonly role: ValueRole }
  | { readonly kind: 'failed'; readonly diagnostics: readonly Diagnostic[] };

const addressKey = ({ symbolId, nodeKey }: NodeAddress): string =>
  JSON.stringify([symbolId, nodeKey]);

const failure = (...diagnostics: Diagnostic[]): EvaluationFailure => ({
  ok: false,
  diagnostics,
});

const invocationCallChain = (
  invocationId: string,
  invocations: ReadonlyMap<string, Invocation>,
): readonly NonNullable<Diagnostic['location']>[] => {
  const reversed: NonNullable<Diagnostic['location']>[] = [];
  const visited = new Set<string>();
  let invocation = invocations.get(invocationId);

  while (
    invocation !== undefined &&
    'parentInvocationId' in invocation &&
    !visited.has(invocation.id)
  ) {
    visited.add(invocation.id);
    reversed.push(invocation.callSite);
    invocation = invocations.get(invocation.parentInvocationId);
  }

  return reversed.reverse();
};

const graphNodeLocation = (
  graph: FormulaGraph,
  nodeKey: string,
): NonNullable<Diagnostic['location']> => {
  const metadataLocation = graph.nodes.get(nodeKey)?.metadata?.location;
  const parsed = SourceSpanSchema.safeParse(metadataLocation);
  return parsed.success ? parsed.data : graph.definition.definitionLocation;
};

const memoized = (
  states: Map<string, EvaluationState>,
  key: string,
): EvaluationResult | undefined => {
  const state = states.get(key);
  if (state?.kind === 'resolved') {
    return {
      ok: true,
      value: state.value,
      ...(state.numericKind === undefined
        ? {}
        : { numericKind: state.numericKind }),
    };
  }
  if (state?.kind === 'failed') {
    return { ok: false, diagnostics: state.diagnostics };
  }
  return undefined;
};

const store = (
  states: Map<string, EvaluationState>,
  key: string,
  result: EvaluationResult,
): EvaluationResult => {
  states.set(
    key,
    result.ok
      ? {
          kind: 'resolved',
          value: result.value,
          ...(result.numericKind === undefined
            ? {}
            : { numericKind: result.numericKind }),
        }
      : { kind: 'failed', diagnostics: result.diagnostics },
  );
  return result;
};

export const createFormulaEvaluator = (
  execution: ExecutionPayload,
): FormulaEvaluator => {
  const invocations = new Map(
    execution.invocations.map((invocation) => [invocation.id, invocation]),
  );
  const definitions = new Map(
    execution.invocations.flatMap((invocation) =>
      invocation.symbols.map(
        (definition) =>
          [definition.symbolId, { definition, invocation }] satisfies readonly [
            string,
            {
              readonly definition: SymbolDefinition;
              readonly invocation: Invocation;
            },
          ],
      ),
    ),
  );
  const graphs = new Map<string, FormulaGraph>();

  for (const symbol of collectCsoSymbols(execution.cso)) {
    const owner = definitions.get(symbol.id);
    if (owner === undefined) {
      continue;
    }
    graphs.set(symbol.id, {
      symbol,
      definition: owner.definition,
      invocation: owner.invocation,
      nodes: new Map(symbol.valueTree.nodes.map((node) => [node.key, node])),
    });
  }

  const nodeStates = new Map<string, EvaluationState>();
  const symbolStates = new Map<string, EvaluationState>();
  const structureStates = new Map<string, StructureState>();

  const diagnostic = ({
    address,
    code,
    message,
    relatedLocations,
    valueDisplay,
  }: {
    readonly address: NodeAddress;
    readonly code: string;
    readonly message: string;
    readonly relatedLocations?: readonly NonNullable<Diagnostic['location']>[];
    readonly valueDisplay?: Diagnostic['valueDisplay'];
  }): Diagnostic => {
    const graph = graphs.get(address.symbolId);
    const chain = graph
      ? invocationCallChain(graph.invocation.id, invocations)
      : [];
    return {
      code,
      message,
      stage: 'verification',
      symbolId: address.symbolId,
      nodeKey: address.nodeKey,
      ...(graph
        ? {
            invocationId: graph.invocation.id,
            location: graphNodeLocation(graph, address.nodeKey),
          }
        : {}),
      ...(relatedLocations !== undefined && relatedLocations.length > 0
        ? { relatedLocations: [...relatedLocations] }
        : {}),
      ...(chain.length > 0 ? { callChain: [...chain] } : {}),
      ...(valueDisplay === undefined ? {} : { valueDisplay }),
    };
  };

  const cycleFailure = (
    address: NodeAddress,
    stack: readonly NodeAddress[],
  ): EvaluationFailure => {
    const key = addressKey(address);
    const cycleStart = stack.findIndex(
      (candidate) => addressKey(candidate) === key,
    );
    const cycle = cycleStart < 0 ? stack : stack.slice(cycleStart);
    return failure(
      diagnostic({
        address,
        code: 'FORMULA_CYCLE',
        message: `Formula evaluation revisited node '${address.nodeKey}' before resolving it.`,
        relatedLocations: cycle.flatMap((candidate) => {
          const graph = graphs.get(candidate.symbolId);
          return graph ? [graphNodeLocation(graph, candidate.nodeKey)] : [];
        }),
      }),
    );
  };

  const numericEvaluation = (
    address: NodeAddress,
    result: NumericResult,
  ): EvaluationResult =>
    result.ok
      ? result
      : failure(
          diagnostic({
            address,
            code: result.code,
            message: result.message,
            valueDisplay: result.valueDisplay,
          }),
        );

  function validateStructure(
    address: NodeAddress,
    stack: readonly NodeAddress[] = [],
  ): { readonly ok: true; readonly role: ValueRole } | EvaluationFailure {
    const key = addressKey(address);
    const known = structureStates.get(key);
    if (known?.kind === 'resolved') return { ok: true, role: known.role };
    if (known?.kind === 'failed') return failure(...known.diagnostics);
    if (known?.kind === 'visiting') return cycleFailure(address, stack);
    structureStates.set(key, { kind: 'visiting' });
    const result = checkNodeStructure(address, [...stack, address]);
    structureStates.set(
      key,
      result.ok
        ? { kind: 'resolved', role: result.role }
        : { kind: 'failed', diagnostics: result.diagnostics },
    );
    return result;
  }

  function roleFailure(
    address: NodeAddress,
    role: ValueRole,
  ): EvaluationFailure {
    return failure(
      diagnostic({
        address,
        code:
          role === 'comparison' ? 'INVALID_CONDITIONAL' : 'NONNUMERIC_FORMULA',
        message:
          role === 'comparison'
            ? 'A conditional test requires numeric comparisons.'
            : 'A numeric operand cannot contain a comparison.',
      }),
    );
  }

  function checkNodeStructure(
    address: NodeAddress,
    stack: readonly NodeAddress[],
  ): { readonly ok: true; readonly role: ValueRole } | EvaluationFailure {
    const graph = graphs.get(address.symbolId);
    const node = graph?.nodes.get(address.nodeKey);
    if (!graph || !node)
      return failure(
        diagnostic({
          address,
          code: 'MISSING_FORMULA_OPERAND',
          message: 'Formula structure contains an unresolved operand.',
        }),
      );
    switch (node.mode) {
      case 'LITERAL': {
        const literal = evaluateLiteral(graph, node);
        return literal.ok ? { ok: true, role: 'number' } : literal;
      }
      case 'SYMBOL': {
        const referenced =
          node.symbol == null ? undefined : graphs.get(node.symbol.id);
        if (!referenced)
          return failure(
            diagnostic({
              address,
              code: 'UNRESOLVED_SYMBOL_REFERENCE',
              message: 'Formula structure contains an unresolved symbol.',
            }),
          );
        const target = {
          symbolId: referenced.symbol.id,
          nodeKey: referenced.symbol.valueTree.rootKey,
        };
        const child = validateStructure(target, stack);
        if (!child.ok) return child;
        return child.role === 'number' ? child : roleFailure(target, 'number');
      }
      case 'FUNCTION': {
        if (node.funcSpec == null || node.funcArgs === undefined)
          return failure(
            diagnostic({
              address,
              code: 'MISSING_FUNCTION_PAYLOAD',
              message: 'Formula structure has an incomplete function.',
            }),
          );
        const resolved = resolveOperation(
          node.funcSpec.id,
          node.funcArgs.length,
        );
        if (!resolved.ok)
          return failure(
            diagnostic({
              address,
              code: resolved.code,
              message: resolved.message,
            }),
          );
        for (const [index, argument] of node.funcArgs.entries()) {
          const target = { symbolId: address.symbolId, nodeKey: argument.key };
          const child = validateStructure(target, stack);
          if (!child.ok) return child;
          const declared = resolved.operation.operands[index];
          const expected = declared === 'integer' ? 'number' : declared;
          if (child.role !== expected) return roleFailure(target, expected);
        }
        return {
          ok: true,
          role:
            resolved.operation.kind === 'comparison' ||
            resolved.operation.kind === 'logical'
              ? 'comparison'
              : 'number',
        };
      }
      default: {
        const exhaustive: never = node.mode;
        return exhaustive;
      }
    }
  }

  function evaluateLiteral(
    graph: FormulaGraph,
    node: CalculationSourceValueNode,
  ): EvaluationResult {
    const address = { symbolId: graph.symbol.id, nodeKey: node.key };
    if (node.literal === undefined || node.literal === null) {
      return failure(
        diagnostic({
          address,
          code: 'MISSING_LITERAL_PAYLOAD',
          message: 'Literal formula node has no literal payload.',
        }),
      );
    }
    if (node.literal.kind !== 'number') {
      return failure(
        diagnostic({
          address,
          code: 'NONNUMERIC_LITERAL',
          message: `Literal kind '${node.literal.kind}' is outside the verified numeric subset.`,
          valueDisplay: { kind: 'unsupported', text: node.literal.kind },
        }),
      );
    }
    return numericEvaluation(
      address,
      validateNumber(node.literal.value, node.literal.numericKind),
    );
  }

  function evaluateSymbolReference(
    graph: FormulaGraph,
    node: CalculationSourceValueNode,
    stack: readonly NodeAddress[],
  ): EvaluationResult {
    const address = { symbolId: graph.symbol.id, nodeKey: node.key };
    if (node.symbol === undefined || node.symbol === null) {
      return failure(
        diagnostic({
          address,
          code: 'MISSING_SYMBOL_REFERENCE',
          message: 'Symbol formula node has no symbol reference.',
        }),
      );
    }
    return evaluateSemanticSymbol(node.symbol.id, stack);
  }

  function evaluateFunction(
    graph: FormulaGraph,
    node: CalculationSourceValueNode,
    stack: readonly NodeAddress[],
  ): EvaluationResult {
    const address = { symbolId: graph.symbol.id, nodeKey: node.key };
    if (node.funcSpec === undefined || node.funcSpec === null) {
      return failure(
        diagnostic({
          address,
          code: 'MISSING_FUNCTION_PAYLOAD',
          message: 'Function formula node has no function specification.',
        }),
      );
    }
    if (node.funcArgs === undefined) {
      return failure(
        diagnostic({
          address,
          code: 'MISSING_FUNCTION_ARGUMENTS',
          message: 'Function formula node has no argument list.',
        }),
      );
    }
    const shape = resolveOperation(node.funcSpec.id, node.funcArgs.length);
    if (!shape.ok) {
      return numericEvaluation(address, shape);
    }
    if (shape.operation.kind === 'conditional') {
      return evaluateConditional(graph, node, stack);
    }
    const results = node.funcArgs.map((argument) =>
      evaluateNode({ symbolId: graph.symbol.id, nodeKey: argument.key }, stack),
    );
    const diagnostics = results.flatMap((result) =>
      result.ok ? [] : result.diagnostics,
    );
    if (diagnostics.length > 0) {
      return { ok: false, diagnostics };
    }
    const operands = results.flatMap((result) =>
      result.ok ? [result.value] : [],
    );
    return numericEvaluation(
      address,
      evaluateOperation(
        node.funcSpec.id,
        operands,
        results.flatMap((result) => (result.ok ? [result.numericKind] : [])),
      ),
    );
  }

  function evaluatePredicate(
    graph: FormulaGraph,
    key: string,
    stack: readonly NodeAddress[],
  ): boolean | EvaluationFailure {
    const address = { symbolId: graph.symbol.id, nodeKey: key };
    const test = graph.nodes.get(key);
    if (
      test?.mode !== 'FUNCTION' ||
      test.funcSpec == null ||
      test.funcArgs === undefined
    )
      return failure(
        diagnostic({
          address,
          code: 'INVALID_CONDITIONAL',
          message: 'A conditional test requires numeric comparisons.',
        }),
      );
    const shape = resolveOperation(test.funcSpec.id, test.funcArgs.length);
    if (!shape.ok)
      return failure(
        diagnostic({ address, code: shape.code, message: shape.message }),
      );
    if (shape.operation.kind === 'logical') {
      const isAnd = shape.operation.operator === 'and';
      for (const argument of test.funcArgs) {
        const selected = evaluatePredicate(graph, argument.key, stack);
        if (typeof selected !== 'boolean') return selected;
        if (selected !== isAnd) return selected;
      }
      return isAnd;
    }
    if (shape.operation.kind !== 'comparison')
      return failure(
        diagnostic({
          address,
          code: 'INVALID_CONDITIONAL',
          message: 'A conditional test requires numeric comparisons.',
        }),
      );
    const left = evaluateNode(
      { symbolId: graph.symbol.id, nodeKey: test.funcArgs[0].key },
      stack,
    );
    if (!left.ok) return left;
    const right = evaluateNode(
      { symbolId: graph.symbol.id, nodeKey: test.funcArgs[1].key },
      stack,
    );
    if (!right.ok) return right;
    const selected = evaluateComparison(
      test.funcSpec.id,
      left.value,
      right.value,
    );
    return typeof selected === 'boolean'
      ? selected
      : failure(
          diagnostic({
            address,
            code: selected.code,
            message: selected.message,
          }),
        );
  }

  function evaluateConditional(
    graph: FormulaGraph,
    node: CalculationSourceValueNode,
    stack: readonly NodeAddress[],
  ): EvaluationResult {
    const args = node.funcArgs ?? [];
    const selected = evaluatePredicate(graph, args[0].key, stack);
    if (typeof selected !== 'boolean') return selected;
    return evaluateNode(
      { symbolId: graph.symbol.id, nodeKey: args[selected ? 1 : 2].key },
      stack,
    );
  }

  function evaluateNode(
    address: NodeAddress,
    stack: readonly NodeAddress[] = [],
  ): EvaluationResult {
    const key = addressKey(address);
    const cached = memoized(nodeStates, key);
    if (cached !== undefined) {
      return cached;
    }
    if (nodeStates.get(key)?.kind === 'visiting') {
      return cycleFailure(address, stack);
    }
    const graph = graphs.get(address.symbolId);
    if (graph === undefined) {
      return store(
        nodeStates,
        key,
        failure(
          diagnostic({
            address,
            code: 'UNRESOLVED_SYMBOL_REFERENCE',
            message: `Symbol '${address.symbolId}' is absent from the formula registry.`,
          }),
        ),
      );
    }
    const node = graph.nodes.get(address.nodeKey);
    if (node === undefined) {
      return store(
        nodeStates,
        key,
        failure(
          diagnostic({
            address,
            code: 'MISSING_FORMULA_OPERAND',
            message: `Node '${address.nodeKey}' is absent from symbol '${address.symbolId}'.`,
          }),
        ),
      );
    }

    nodeStates.set(key, { kind: 'visiting' });
    const nextStack = [...stack, address];
    let result: EvaluationResult;
    switch (node.mode) {
      case 'LITERAL':
        result = evaluateLiteral(graph, node);
        break;
      case 'SYMBOL':
        result = evaluateSymbolReference(graph, node, nextStack);
        break;
      case 'FUNCTION':
        result = evaluateFunction(graph, node, nextStack);
        break;
      default: {
        const exhaustive: never = node.mode;
        result = exhaustive;
      }
    }
    return store(nodeStates, key, result);
  }

  function evaluateInputAuthority(
    graph: FormulaGraph,
    stack: readonly NodeAddress[],
  ): EvaluationResult {
    const definition = graph.definition;
    const address = {
      symbolId: graph.symbol.id,
      nodeKey: graph.symbol.valueTree.rootKey,
    };
    if (definition.kind !== 'input') {
      return failure(
        diagnostic({
          address,
          code: 'INVALID_INPUT_AUTHORITY',
          message: 'Only an input definition can use input authority.',
        }),
      );
    }
    if (definition.givenSource.kind === 'literal') {
      return numericEvaluation(
        address,
        validateNumber(
          definition.givenSource.value,
          definition.givenSource.numericKind,
        ),
      );
    }
    const parameterName = definition.givenSource.parameterName;
    const binding = graph.invocation.inputBindings.find(
      (candidate) => candidate.parameterName === parameterName,
    );
    if (binding === undefined) {
      return failure(
        diagnostic({
          address,
          code: 'MISSING_INPUT_BINDING',
          message: `Input parameter '${parameterName}' has no binding.`,
        }),
      );
    }
    if (binding.kind === 'callerSymbol') {
      return evaluateSemanticSymbol(binding.source.symbolId, stack);
    }
    return numericEvaluation(
      address,
      validateNumber(binding.value, binding.numericKind),
    );
  }

  function evaluateSemanticSymbol(
    symbolId: string,
    stack: readonly NodeAddress[] = [],
  ): EvaluationResult {
    const cached = memoized(symbolStates, symbolId);
    if (cached !== undefined) {
      return cached;
    }
    const graph = graphs.get(symbolId);
    const address = {
      symbolId,
      nodeKey: graph?.symbol.valueTree.rootKey ?? '<root>',
    };
    if (symbolStates.get(symbolId)?.kind === 'visiting') {
      return cycleFailure(address, stack);
    }
    if (graph === undefined) {
      return store(
        symbolStates,
        symbolId,
        failure(
          diagnostic({
            address,
            code: 'UNRESOLVED_SYMBOL_REFERENCE',
            message: `Symbol '${symbolId}' is absent from the formula registry.`,
          }),
        ),
      );
    }

    symbolStates.set(symbolId, { kind: 'visiting' });
    const nextStack = [...stack, address];
    const definition = graph.definition;
    let result: EvaluationResult;
    switch (definition.kind) {
      case 'input':
        result = evaluateInputAuthority(graph, nextStack);
        break;
      case 'constant':
        result = numericEvaluation(
          address,
          validateNumber(
            definition.literal.value,
            definition.literal.numericKind,
          ),
        );
        break;
      case 'formula': {
        const root = graph.nodes.get(graph.symbol.valueTree.rootKey);
        result =
          root?.mode === 'LITERAL'
            ? failure(
                diagnostic({
                  address,
                  code: 'OMITTED_FORMULA',
                  message:
                    'A formula definition cannot use a bare literal as its documented formula.',
                }),
              )
            : evaluateNode(definition.address, nextStack);
        break;
      }
      case 'unsupported':
        result = failure(
          diagnostic({
            address,
            code: 'UNSUPPORTED_RESULT',
            message: definition.reason,
          }),
        );
        break;
      default: {
        const exhaustive: never = definition;
        result = exhaustive;
      }
    }
    return store(symbolStates, symbolId, result);
  }

  const structuralFailures = new Map<string, EvaluationFailure>();
  for (const graph of graphs.values()) {
    for (const node of graph.nodes.values()) {
      const address = { symbolId: graph.symbol.id, nodeKey: node.key };
      const checked = validateStructure(address);
      const invalid = !checked.ok
        ? checked
        : node.key === graph.symbol.valueTree.rootKey &&
            checked.role !== 'number'
          ? roleFailure(address, 'number')
          : undefined;
      if (invalid) {
        structuralFailures.set(graph.symbol.id, invalid);
        break;
      }
    }
  }
  return {
    graphs,
    evaluate: (address) =>
      structuralFailures.get(address.symbolId) ?? evaluateNode(address),
    evaluateSymbol: (symbolId) =>
      structuralFailures.get(symbolId) ?? evaluateSemanticSymbol(symbolId),
    location: (address) => {
      const graph = graphs.get(address.symbolId);
      return graph ? graphNodeLocation(graph, address.nodeKey) : undefined;
    },
    callChain: (invocationId) => invocationCallChain(invocationId, invocations),
  };
};
