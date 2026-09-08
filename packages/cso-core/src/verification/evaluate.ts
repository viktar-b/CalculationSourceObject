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
  validateNumber,
  validateOperation,
} from './numeric.ts';

export type EvaluationResult =
  | { readonly ok: true; readonly value: number }
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
  | { readonly kind: 'resolved'; readonly value: number }
  | { readonly kind: 'failed'; readonly diagnostics: readonly Diagnostic[] };

type StructureState =
  | { readonly kind: 'visiting' }
  | { readonly kind: 'resolved' }
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
    return { ok: true, value: state.value };
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
      ? { kind: 'resolved', value: result.value }
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

  function structureChildren(
    graph: FormulaGraph,
    node: CalculationSourceValueNode,
  ): readonly NodeAddress[] {
    switch (node.mode) {
      case 'LITERAL':
        return [];
      case 'SYMBOL': {
        const referenced =
          node.symbol === undefined || node.symbol === null
            ? undefined
            : graphs.get(node.symbol.id);
        return referenced === undefined
          ? []
          : [
              {
                symbolId: referenced.symbol.id,
                nodeKey: referenced.symbol.valueTree.rootKey,
              },
            ];
      }
      case 'FUNCTION': {
        if (
          node.funcSpec === undefined ||
          node.funcSpec === null ||
          node.funcArgs === undefined ||
          !validateOperation(node.funcSpec.id, node.funcArgs.length).ok
        ) {
          return [];
        }
        return node.funcArgs.map((argument) => ({
          symbolId: graph.symbol.id,
          nodeKey: argument.key,
        }));
      }
      default: {
        const exhaustive: never = node.mode;
        return exhaustive;
      }
    }
  }

  function structureLookup(
    address: NodeAddress,
    stack: readonly NodeAddress[],
  ): 'unseen' | 'resolved' | EvaluationFailure {
    const key = addressKey(address);
    if (stack.some((candidate) => addressKey(candidate) === key)) {
      return cycleFailure(address, stack);
    }
    const cached = structureStates.get(key);
    switch (cached?.kind) {
      case 'resolved':
        return 'resolved';
      case 'failed':
        return failure(...cached.diagnostics);
      case 'visiting':
        return cycleFailure(address, stack);
      default:
        return 'unseen';
    }
  }

  function validateStructure(
    address: NodeAddress,
    stack: readonly NodeAddress[] = [],
  ): EvaluationFailure | undefined {
    const key = addressKey(address);
    const known = structureLookup(address, stack);
    if (known === 'resolved') {
      return undefined;
    }
    if (known !== 'unseen') {
      return known;
    }

    const graph = graphs.get(address.symbolId);
    const node = graph?.nodes.get(address.nodeKey);
    if (graph === undefined || node === undefined) {
      return undefined;
    }

    structureStates.set(key, { kind: 'visiting' });
    const nextStack = [...stack, address];
    let detected: EvaluationFailure | undefined;
    for (const child of structureChildren(graph, node)) {
      detected = validateStructure(child, nextStack);
      if (detected !== undefined) {
        break;
      }
    }

    structureStates.set(
      key,
      detected === undefined
        ? { kind: 'resolved' }
        : { kind: 'failed', diagnostics: detected.diagnostics },
    );
    return detected;
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
    return numericEvaluation(address, validateNumber(node.literal.value));
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
    const referenced = graphs.get(node.symbol.id);
    if (referenced !== undefined) {
      const structuralFailure = validateStructure(
        {
          symbolId: referenced.symbol.id,
          nodeKey: referenced.symbol.valueTree.rootKey,
        },
        stack,
      );
      if (structuralFailure !== undefined) {
        return structuralFailure;
      }
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
    const shape = validateOperation(node.funcSpec.id, node.funcArgs.length);
    if (!shape.ok) {
      return numericEvaluation(address, shape);
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
      evaluateOperation(node.funcSpec.id, operands),
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
        validateNumber(definition.givenSource.value),
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
    return numericEvaluation(address, validateNumber(binding.value));
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
          validateNumber(definition.literal.value),
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

  return {
    graphs,
    evaluate: evaluateNode,
    evaluateSymbol: evaluateSemanticSymbol,
    location: (address) => {
      const graph = graphs.get(address.symbolId);
      return graph ? graphNodeLocation(graph, address.nodeKey) : undefined;
    },
    callChain: (invocationId) => invocationCallChain(invocationId, invocations),
  };
};
