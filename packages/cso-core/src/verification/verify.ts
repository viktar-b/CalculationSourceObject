import { z } from 'zod';
import {
  type CalculationSourceLiteral,
  CalculationSourceObjectSchema,
} from '../calculation-source/object-schema.ts';
import {
  type CheckName,
  type Comparison,
  type Diagnostic,
  ExecutionBindingSchema,
  NodeAddressSchema,
  SourceSpanSchema,
  collectCsoSymbols,
  executionBindingKey,
} from '../contracts/common.ts';
import {
  type ExecutionPayload,
  ExecutionPayloadSchema,
  type InputBinding,
  type Invocation,
  type SymbolDefinition,
} from '../contracts/execution.ts';
import {
  BoundReferenceCaseSchema,
  type ReferenceCase,
  ReferenceCasesSchema,
  type VerifyExecution,
} from '../contracts/reference.ts';
import {
  type Check,
  type VerificationReport,
  VerificationReportSchema,
} from '../contracts/reports.ts';
import {
  type EvaluationResult,
  type FormulaEvaluator,
  type FormulaGraph,
  createFormulaEvaluator,
} from './evaluate.ts';
import { compareNumbers, numericPolicy, validateNumber } from './numeric.ts';

const VerificationBoundarySchema = z.strictObject({
  execution: z.unknown(),
  referenceCases: z.unknown().optional(),
});

type ConsistencyCheckName =
  | 'inputConsistency'
  | 'constantConsistency'
  | 'formulaConsistency';

interface Counts {
  checked: number;
  passed: number;
  failed: number;
}

interface CategoryState {
  readonly counts: Counts;
  readonly cacheCounts: Counts;
  readonly diagnostics: Diagnostic[];
  uncountedFailure: boolean;
}

interface BindingCheck {
  readonly expected: EvaluationResult;
  readonly passed: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

const validatedEvaluation = (value: number): EvaluationResult => {
  const validated = validateNumber(value);
  return validated.ok
    ? validated
    : {
        ok: false,
        diagnostics: [
          {
            code: validated.code,
            message: validated.message,
            stage: 'verification',
            ...(validated.valueDisplay === undefined
              ? {}
              : { valueDisplay: validated.valueDisplay }),
          },
        ],
      };
};

const emptyCounts = (): Counts => ({ checked: 0, passed: 0, failed: 0 });

const createCategoryState = (): CategoryState => ({
  counts: emptyCounts(),
  cacheCounts: emptyCounts(),
  diagnostics: [],
  uncountedFailure: false,
});

const record = (counts: Counts, passed: boolean): void => {
  counts.checked += 1;
  if (passed) {
    counts.passed += 1;
  } else {
    counts.failed += 1;
  }
};

const categoryCheck = (state: CategoryState): Check => {
  const failed =
    state.uncountedFailure ||
    state.counts.failed > 0 ||
    state.cacheCounts.failed > 0;
  if (state.counts.checked === 0 && !failed) {
    return {
      status: 'not_applicable',
      counts: emptyCounts(),
      ...(state.cacheCounts.checked > 0
        ? { cacheCounts: state.cacheCounts }
        : {}),
    };
  }

  if (failed && state.counts.failed === 0 && state.cacheCounts.failed === 0) {
    return { status: 'failed' };
  }

  return {
    status: failed ? 'failed' : 'passed',
    counts: state.counts,
    ...(state.cacheCounts.checked > 0
      ? { cacheCounts: state.cacheCounts }
      : {}),
  };
};

const reportForInvalidExecution = (
  diagnostics: readonly Diagnostic[],
): VerificationReport =>
  VerificationReportSchema.parse({
    ok: false,
    numericPolicy,
    checks: {
      executionValidity: { status: 'failed' },
      inputConsistency: {
        status: 'not_applicable',
        counts: emptyCounts(),
      },
      constantConsistency: {
        status: 'not_applicable',
        counts: emptyCounts(),
      },
      formulaConsistency: {
        status: 'not_applicable',
        counts: emptyCounts(),
      },
      outputConsistency: { status: 'not_applicable', counts: emptyCounts() },
      sourceToDocumentConsistency: { status: 'failed' },
      independentReferenceAgreement: {
        status: 'not_applicable',
        counts: emptyCounts(),
      },
    },
    diagnostics,
  });

const valueAtPath = (input: unknown, path: readonly PropertyKey[]): unknown => {
  let value = input;
  for (const key of path) {
    if (value === null || typeof value !== 'object') {
      return undefined;
    }
    value = Reflect.get(value, key);
  }
  return value;
};

const stringProperty = (
  value: unknown,
  key: PropertyKey,
): string | undefined => {
  if (value === null || typeof value !== 'object') {
    return undefined;
  }
  const property = Reflect.get(value, key);
  return typeof property === 'string' ? property : undefined;
};

const diagnosticSymbolId = (value: unknown): string | undefined => {
  const parsed = NodeAddressSchema.shape.symbolId.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const diagnosticNodeKey = (value: unknown): string | undefined => {
  const parsed = NodeAddressSchema.shape.nodeKey.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const displayForBoundaryValue = (
  value: unknown,
): Diagnostic['valueDisplay'] => {
  if (typeof value === 'number') {
    return {
      kind:
        Number.isFinite(value) && Number.isInteger(value)
          ? 'python-int'
          : 'python-float',
      text: Object.is(value, -0) ? '-0' : String(value),
    };
  }
  if (typeof value === 'string') {
    return { kind: 'unsupported', text: value || '<empty string>' };
  }
  return {
    kind: 'unsupported',
    text: value === undefined ? 'undefined' : String(value),
  };
};

const definitionContext = (
  execution: unknown,
  symbolId: string,
): Partial<
  Pick<Diagnostic, 'symbolId' | 'nodeKey' | 'invocationId' | 'location'>
> => {
  const invocations = valueAtPath(execution, ['invocations']);
  if (Array.isArray(invocations)) {
    for (const invocation of invocations) {
      const symbols = valueAtPath(invocation, ['symbols']);
      const definition = Array.isArray(symbols)
        ? symbols.find(
            (symbol: unknown) =>
              stringProperty(symbol, 'symbolId') === symbolId,
          )
        : undefined;
      if (definition !== undefined) {
        const location = SourceSpanSchema.safeParse(
          valueAtPath(definition, ['definitionLocation']),
        );
        return {
          symbolId,
          invocationId: diagnosticSymbolId(stringProperty(invocation, 'id')),
          nodeKey: diagnosticNodeKey(
            stringProperty(valueAtPath(definition, ['address']), 'nodeKey'),
          ),
          ...(location.success ? { location: location.data } : {}),
        };
      }
    }
  }
  const cso = CalculationSourceObjectSchema.safeParse(
    valueAtPath(execution, ['cso']),
  );
  const symbol = cso.success
    ? collectCsoSymbols(cso.data).find((item) => item.id === symbolId)
    : undefined;
  if (symbol !== undefined) {
    const location = SourceSpanSchema.safeParse(
      valueAtPath(symbol.metadata, ['location']),
    );
    return {
      symbolId,
      invocationId: diagnosticSymbolId(
        stringProperty(symbol.metadata, 'invocationId'),
      ),
      nodeKey: diagnosticNodeKey(symbol.valueTree.rootKey),
      ...(location.success ? { location: location.data } : {}),
    };
  }
  return { symbolId };
};

type IssueDiagnosticContext = Partial<
  Pick<
    Diagnostic,
    'symbolId' | 'nodeKey' | 'invocationId' | 'location' | 'valueDisplay'
  >
>;

const applyReferenceIssueContext = (
  context: IssueDiagnosticContext,
  issue: z.core.$ZodIssue,
  input: unknown,
  referenceExecution?: ExecutionPayload,
): void => {
  const collection = issue.path[0];
  const index = issue.path[1];
  if (
    (collection === 'referenceCase' || typeof collection === 'number') &&
    index === 'expected'
  ) {
    const row =
      typeof issue.path[2] === 'number'
        ? valueAtPath(input, issue.path.slice(0, 3))
        : undefined;
    context.symbolId =
      diagnosticSymbolId(
        issue.code === 'custom' ? issue.params?.symbolId : undefined,
      ) ?? diagnosticSymbolId(stringProperty(row, 'symbolId'));
    let execution = valueAtPath(input, ['execution']);
    if (typeof collection === 'number' && referenceExecution !== undefined) {
      const binding = ExecutionBindingSchema.safeParse(
        valueAtPath(input, [collection, 'binding']),
      );
      if (
        binding.success &&
        executionBindingKey(binding.data) ===
          executionBindingKey({
            entryModuleId: referenceExecution.entry.moduleId,
            entrySourceHash: referenceExecution.entry.sourceHash,
            sourceClosureHash: referenceExecution.sourceClosureHash,
            function: referenceExecution.entry.function,
            resolvedInputs: referenceExecution.entry.resolvedInputs,
          })
      ) {
        execution = referenceExecution;
      }
    }
    if (context.symbolId !== undefined) {
      Object.assign(context, definitionContext(execution, context.symbolId));
    }
  }
};

const applyInvocationIssueContext = (
  context: IssueDiagnosticContext,
  issue: z.core.$ZodIssue,
  input: unknown,
): void => {
  const collection = issue.path[0];
  const index = issue.path[1];
  if (collection === 'invocations' && typeof index === 'number') {
    const invocation = valueAtPath(input, [collection, index]);
    context.invocationId = diagnosticSymbolId(stringProperty(invocation, 'id'));
    const memberCollection = issue.path[2];
    const memberIndex = issue.path[3];
    const member =
      (memberCollection === 'symbols' ||
        memberCollection === 'inputBindings') &&
      typeof memberIndex === 'number'
        ? valueAtPath(invocation, [memberCollection, memberIndex])
        : undefined;
    if (memberCollection === 'symbols') {
      context.symbolId = diagnosticSymbolId(stringProperty(member, 'symbolId'));
      context.nodeKey = diagnosticNodeKey(
        stringProperty(valueAtPath(member, ['address']), 'nodeKey'),
      );
    }
    const memberLocation = SourceSpanSchema.safeParse(
      valueAtPath(member, [
        memberCollection === 'symbols'
          ? 'definitionLocation'
          : 'parameterLocation',
      ]),
    );
    const callSite = SourceSpanSchema.safeParse(
      valueAtPath(invocation, ['callSite']),
    );
    if (memberLocation.success) {
      context.location = memberLocation.data;
    } else if (callSite.success) {
      context.location = callSite.data;
    }
  }
};

const applyObservationIssueContext = (
  context: IssueDiagnosticContext,
  issue: z.core.$ZodIssue,
  input: unknown,
): void => {
  const collection = issue.path[0];
  const index = issue.path[1];
  if (
    (collection === 'observations' || collection === 'operationObservations') &&
    typeof index === 'number'
  ) {
    const observation = valueAtPath(input, [collection, index]);
    const address = valueAtPath(observation, ['address']);
    context.symbolId =
      diagnosticSymbolId(stringProperty(observation, 'symbolId')) ??
      diagnosticSymbolId(stringProperty(address, 'symbolId'));
    context.nodeKey = diagnosticNodeKey(stringProperty(address, 'nodeKey'));
    context.invocationId = diagnosticSymbolId(
      stringProperty(observation, 'invocationId'),
    );
    const location = SourceSpanSchema.safeParse(
      valueAtPath(observation, [
        collection === 'observations' ? 'definitionLocation' : 'location',
      ]),
    );
    if (location.success) {
      context.location = location.data;
    }
  }
};

const applyValueTreeIssueContext = (
  context: IssueDiagnosticContext,
  issue: z.core.$ZodIssue,
  input: unknown,
): void => {
  const valueTreeIndex = issue.path.indexOf('valueTree');
  if (valueTreeIndex >= 0) {
    const symbol = valueAtPath(input, issue.path.slice(0, valueTreeIndex));
    context.symbolId =
      diagnosticSymbolId(stringProperty(symbol, 'id')) ?? context.symbolId;
    context.invocationId =
      diagnosticSymbolId(
        stringProperty(valueAtPath(symbol, ['metadata']), 'invocationId'),
      ) ?? context.invocationId;
    const nodeMarker = issue.path.indexOf('nodes', valueTreeIndex);
    const nodeIndex = nodeMarker < 0 ? undefined : issue.path[nodeMarker + 1];
    const node =
      typeof nodeIndex === 'number'
        ? valueAtPath(symbol, ['valueTree', 'nodes', nodeIndex])
        : undefined;
    context.nodeKey =
      diagnosticNodeKey(stringProperty(node, 'key')) ?? context.nodeKey;
    const nodeLocation = SourceSpanSchema.safeParse(
      valueAtPath(node, ['metadata', 'location']),
    );
    const symbolLocation = SourceSpanSchema.safeParse(
      valueAtPath(symbol, ['metadata', 'location']),
    );
    if (nodeLocation.success) {
      context.location = nodeLocation.data;
    } else if (symbolLocation.success) {
      context.location = symbolLocation.data;
    }
  }
};

const issueContext = (
  issue: z.core.$ZodIssue,
  input: unknown,
  referenceExecution?: ExecutionPayload,
): IssueDiagnosticContext => {
  const context: IssueDiagnosticContext = {};
  const issueSymbolId = diagnosticSymbolId(
    issue.code === 'custom' ? issue.params?.symbolId : undefined,
  );
  if (issueSymbolId !== undefined) {
    Object.assign(context, definitionContext(input, issueSymbolId));
  }
  applyReferenceIssueContext(context, issue, input, referenceExecution);
  applyInvocationIssueContext(context, issue, input);
  applyObservationIssueContext(context, issue, input);
  applyValueTreeIssueContext(context, issue, input);

  if (issue.path.at(-1) === 'value') {
    context.valueDisplay = displayForBoundaryValue(
      valueAtPath(input, issue.path),
    );
  }
  if (context.symbolId === undefined) {
    context.nodeKey = undefined;
  }
  return context;
};

const issueCode = (issue: z.core.$ZodIssue, input: unknown): string => {
  if (
    issue.code === 'custom' &&
    typeof issue.params?.diagnosticCode === 'string'
  ) {
    return issue.params.diagnosticCode;
  }
  const last = issue.path.at(-1);
  const observationValue =
    last === 'value' &&
    (issue.path[0] === 'observations' ||
      issue.path[0] === 'operationObservations');
  if (observationValue) {
    const received = valueAtPath(input, issue.path);
    return typeof received === 'number' && !Number.isFinite(received)
      ? 'NON_FINITE_NUMBER'
      : 'NONNUMERIC_RESULT';
  }
  const literalValue = last === 'value' && issue.path.includes('literal');
  if (literalValue) {
    const received = valueAtPath(input, issue.path);
    return typeof received === 'number' && !Number.isFinite(received)
      ? 'NON_FINITE_NUMBER'
      : 'NONNUMERIC_LITERAL';
  }
  const cachedValue = last === 'value' && issue.path.includes('result');
  if (cachedValue) {
    const received = valueAtPath(input, issue.path);
    return typeof received === 'number' && !Number.isFinite(received)
      ? 'NON_FINITE_NUMBER'
      : 'NONNUMERIC_RESULT';
  }
  return `SCHEMA_${issue.code.toUpperCase()}`;
};

const expandMissingBindingContexts = (
  issue: z.core.$ZodIssue,
  input: unknown,
  referenceExecution?: ExecutionPayload,
): readonly ReturnType<typeof issueContext>[] => {
  const context = issueContext(issue, input, referenceExecution);
  if (
    issue.code !== 'custom' ||
    issue.params?.diagnosticCode !== 'MISSING_INPUT_BINDING' ||
    typeof issue.params.parameterName !== 'string' ||
    issue.path[0] !== 'invocations' ||
    typeof issue.path[1] !== 'number'
  ) {
    return [context];
  }
  const symbols = valueAtPath(input, ['invocations', issue.path[1], 'symbols']);
  const consumers = Array.isArray(symbols)
    ? symbols.flatMap((definition: unknown) => {
        const source = valueAtPath(definition, ['givenSource']);
        const symbolId = diagnosticSymbolId(
          stringProperty(definition, 'symbolId'),
        );
        return symbolId !== undefined &&
          stringProperty(definition, 'kind') === 'input' &&
          stringProperty(source, 'kind') === 'parameter' &&
          stringProperty(source, 'parameterName') ===
            issue.params?.parameterName
          ? [symbolId]
          : [];
      })
    : [];
  return consumers.length === 0
    ? [context]
    : consumers.map((symbolId) => ({
        ...context,
        ...definitionContext(input, symbolId),
      }));
};

const issuesToDiagnostics = ({
  check,
  input,
  issues,
  referenceExecution,
  stage,
}: {
  readonly check: CheckName;
  readonly input: unknown;
  readonly issues: readonly z.core.$ZodIssue[];
  readonly referenceExecution?: ExecutionPayload;
  readonly stage: Diagnostic['stage'];
}): Diagnostic[] =>
  issues.flatMap((issue) =>
    expandMissingBindingContexts(issue, input, referenceExecution).map(
      (context) => ({
        code: issueCode(issue, input),
        message: `${issue.path.map(String).join('.') || '$'}: ${issue.message}`,
        stage,
        check,
        ...context,
      }),
    ),
  );

const callChainFields = (
  evaluator: FormulaEvaluator,
  invocationId: string,
): Pick<Diagnostic, 'callChain'> => {
  const callChain = evaluator.callChain(invocationId);
  return callChain.length > 0 ? { callChain: [...callChain] } : {};
};

const definitionDiagnostic = ({
  check,
  code,
  comparison,
  definition,
  evaluator,
  invocation,
  message,
  relatedLocations,
  valueDisplay,
}: {
  readonly check: ConsistencyCheckName | 'independentReferenceAgreement';
  readonly code: string;
  readonly comparison?: Comparison;
  readonly definition: SymbolDefinition;
  readonly evaluator: FormulaEvaluator;
  readonly invocation: Invocation;
  readonly message: string;
  readonly relatedLocations?: readonly NonNullable<Diagnostic['location']>[];
  readonly valueDisplay?: Diagnostic['valueDisplay'];
}): Diagnostic => ({
  code,
  message,
  stage:
    check === 'independentReferenceAgreement' ? 'reference' : 'verification',
  check,
  symbolId: definition.symbolId,
  invocationId: invocation.id,
  location: definition.definitionLocation,
  ...callChainFields(evaluator, invocation.id),
  ...(comparison === undefined ? {} : { comparison }),
  ...(relatedLocations !== undefined && relatedLocations.length > 0
    ? { relatedLocations: [...relatedLocations] }
    : {}),
  ...(valueDisplay === undefined ? {} : { valueDisplay }),
});

const checkedDiagnostics = (
  diagnostics: readonly Diagnostic[],
  check: ConsistencyCheckName,
): Diagnostic[] => diagnostics.map((diagnostic) => ({ ...diagnostic, check }));

const compare = ({
  actual,
  check,
  code,
  definition,
  evaluator,
  expected,
  invocation,
  message,
  relatedLocations,
}: {
  readonly actual: number;
  readonly check: ConsistencyCheckName;
  readonly code: string;
  readonly definition: SymbolDefinition;
  readonly evaluator: FormulaEvaluator;
  readonly expected: number;
  readonly invocation: Invocation;
  readonly message: string;
  readonly relatedLocations?: readonly NonNullable<Diagnostic['location']>[];
}): {
  readonly passed: boolean;
  readonly diagnostics: readonly Diagnostic[];
} => {
  const result = compareNumbers(actual, expected);
  return result.matches
    ? { passed: true, diagnostics: [] }
    : {
        passed: false,
        diagnostics: [
          definitionDiagnostic({
            check,
            code,
            message,
            definition,
            evaluator,
            invocation,
            comparison: result.comparison,
            relatedLocations,
          }),
        ],
      };
};

const bindingLocations = (
  binding: InputBinding,
): readonly NonNullable<Diagnostic['location']>[] => {
  if (binding.kind === 'parsedDefault') {
    return [binding.defaultLocation];
  }
  if (binding.kind === 'callerLiteral' || binding.kind === 'callerSymbol') {
    return [binding.callerLocation];
  }
  return [];
};

const checkBinding = ({
  binding,
  evaluator,
  invocation,
}: {
  readonly binding: InputBinding;
  readonly evaluator: FormulaEvaluator;
  readonly invocation: Invocation;
}): BindingCheck => {
  const expected =
    binding.kind === 'callerSymbol'
      ? evaluator.evaluateSymbol(binding.source.symbolId)
      : validatedEvaluation(binding.value);
  if (!expected.ok) {
    const diagnostics = 'diagnostics' in expected ? expected.diagnostics : [];
    return {
      expected,
      passed: false,
      diagnostics: [
        ...checkedDiagnostics(diagnostics, 'inputConsistency'),
        {
          code: 'INPUT_SOURCE_EVALUATION_FAILED',
          message: `Could not evaluate the independent source for parameter '${binding.parameterName}'.`,
          stage: 'verification',
          check: 'inputConsistency',
          invocationId: invocation.id,
          location: binding.parameterLocation,
          ...callChainFields(evaluator, invocation.id),
          ...(bindingLocations(binding).length > 0
            ? { relatedLocations: [...bindingLocations(binding)] }
            : {}),
        },
      ],
    };
  }

  const resolved = invocation.resolvedInputs[binding.parameterName];
  const comparison = compareNumbers(resolved, expected.value);
  if (comparison.matches) {
    return { expected, passed: true, diagnostics: [] };
  }
  return {
    expected,
    passed: false,
    diagnostics: [
      {
        code: 'INPUT_MISMATCH',
        message: `Resolved input '${binding.parameterName}' differs from its independent binding.`,
        stage: 'verification',
        check: 'inputConsistency',
        invocationId: invocation.id,
        location: binding.parameterLocation,
        comparison: comparison.comparison,
        ...callChainFields(evaluator, invocation.id),
        ...(bindingLocations(binding).length > 0
          ? { relatedLocations: [...bindingLocations(binding)] }
          : {}),
      },
    ],
  };
};

const numericLiteral = (
  literal: CalculationSourceLiteral | null | undefined,
): EvaluationResult => {
  if (literal?.kind !== 'number') {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'UNSUPPORTED_RESULT',
          message: 'A documented result must be a finite supported number.',
          stage: 'verification',
          valueDisplay: {
            kind: 'unsupported',
            text: literal?.kind ?? 'null',
          },
        },
      ],
    };
  }
  const validated = validateNumber(literal.value);
  return validated.ok
    ? validated
    : {
        ok: false,
        diagnostics: [
          {
            code: validated.code,
            message: validated.message,
            stage: 'verification',
            ...(validated.valueDisplay === undefined
              ? {}
              : { valueDisplay: validated.valueDisplay }),
          },
        ],
      };
};

const checkCachedValue = ({
  address,
  cached,
  check,
  evaluator,
  graph,
  state,
}: {
  readonly address: { readonly symbolId: string; readonly nodeKey: string };
  readonly cached: CalculationSourceLiteral | null | undefined;
  readonly check: ConsistencyCheckName;
  readonly evaluator: FormulaEvaluator;
  readonly graph: FormulaGraph;
  readonly state: CategoryState;
}): void => {
  const cachedValue = numericLiteral(cached);
  const evaluated = evaluator.evaluate(address);
  if (!cachedValue.ok || !evaluated.ok) {
    record(state.cacheCounts, false);
    state.diagnostics.push(
      ...checkedDiagnostics(
        cachedValue.ok ? [] : cachedValue.diagnostics,
        check,
      ).map((diagnostic) => ({
        ...diagnostic,
        symbolId: graph.symbol.id,
        nodeKey: address.nodeKey,
        invocationId: graph.invocation.id,
        location: evaluator.location(address),
        ...callChainFields(evaluator, graph.invocation.id),
      })),
      ...checkedDiagnostics(evaluated.ok ? [] : evaluated.diagnostics, check),
    );
    return;
  }
  const compared = compareNumbers(cachedValue.value, evaluated.value);
  record(state.cacheCounts, compared.matches);
  if (!compared.matches) {
    state.diagnostics.push({
      ...definitionDiagnostic({
        check,
        code: 'CACHE_MISMATCH',
        message: `Stored result at node '${address.nodeKey}' differs from formula evaluation.`,
        definition: graph.definition,
        evaluator,
        invocation: graph.invocation,
        comparison: compared.comparison,
      }),
      nodeKey: address.nodeKey,
      location: evaluator.location(address),
    });
  }
};

const checkCaches = ({
  check,
  evaluator,
  graph,
  state,
}: {
  readonly check: ConsistencyCheckName;
  readonly evaluator: FormulaEvaluator;
  readonly graph: FormulaGraph;
  readonly state: CategoryState;
}): void => {
  for (const node of graph.symbol.valueTree.nodes) {
    if (!Object.hasOwn(node, 'result')) {
      continue;
    }
    checkCachedValue({
      address: { symbolId: graph.symbol.id, nodeKey: node.key },
      cached: node.result,
      check,
      evaluator,
      graph,
      state,
    });
  }
  if (Object.hasOwn(graph.symbol.valueTree, 'result')) {
    checkCachedValue({
      address: {
        symbolId: graph.symbol.id,
        nodeKey: graph.symbol.valueTree.rootKey,
      },
      cached: graph.symbol.valueTree.result,
      check,
      evaluator,
      graph,
      state,
    });
  }
};

const checkOperationObservations = ({
  check,
  evaluator,
  execution,
  graph,
}: {
  readonly check: ConsistencyCheckName;
  readonly evaluator: FormulaEvaluator;
  readonly execution: ExecutionPayload;
  readonly graph: FormulaGraph;
}): {
  readonly passed: boolean;
  readonly diagnostics: readonly Diagnostic[];
} => {
  let passed = true;
  const diagnostics: Diagnostic[] = [];
  for (const observation of execution.operationObservations ?? []) {
    if (observation.address.symbolId !== graph.symbol.id) {
      continue;
    }
    const node = graph.nodes.get(observation.address.nodeKey);
    if (node?.mode !== 'FUNCTION') {
      passed = false;
      diagnostics.push({
        code: 'INVALID_OPERATION_OBSERVATION',
        message: 'An operation observation must identify a function node.',
        stage: 'verification',
        check,
        symbolId: graph.symbol.id,
        nodeKey: observation.address.nodeKey,
        invocationId: graph.invocation.id,
        location: observation.location,
        ...callChainFields(evaluator, graph.invocation.id),
      });
      continue;
    }
    const evaluated = evaluator.evaluate(observation.address);
    if (!evaluated.ok) {
      passed = false;
      diagnostics.push(...checkedDiagnostics(evaluated.diagnostics, check));
      continue;
    }
    const compared = compareNumbers(observation.value, evaluated.value);
    if (!compared.matches) {
      passed = false;
      diagnostics.push({
        code: 'OPERATION_MISMATCH',
        message: `Observed operation '${observation.address.nodeKey}' differs from formula evaluation.`,
        stage: 'verification',
        check,
        symbolId: graph.symbol.id,
        nodeKey: observation.address.nodeKey,
        invocationId: graph.invocation.id,
        location: observation.location,
        comparison: compared.comparison,
        ...callChainFields(evaluator, graph.invocation.id),
      });
    }
  }
  return { passed, diagnostics };
};

const observationFor = (execution: ExecutionPayload, symbolId: string) =>
  execution.observations.find(
    (observation) => observation.symbolId === symbolId,
  );

interface DefinitionCheckContext {
  readonly check: ConsistencyCheckName;
  readonly evaluator: FormulaEvaluator;
  readonly graph: FormulaGraph;
  readonly observation: ReturnType<typeof observationFor>;
  readonly evaluated: EvaluationResult;
  readonly state: CategoryState;
}
type SourceValueDefinition = Extract<
  SymbolDefinition,
  { kind: 'input' | 'constant' }
>;

const resolveDefinitionSourceValue = ({
  definition,
  invocation,
  evaluator,
  check,
  state,
  bindingChecks,
  usedBindings,
}: {
  readonly definition: SourceValueDefinition;
  readonly invocation: Invocation;
  readonly evaluator: FormulaEvaluator;
  readonly check: ConsistencyCheckName;
  readonly state: CategoryState;
  readonly bindingChecks: ReadonlyMap<string, BindingCheck>;
  readonly usedBindings: Set<string>;
}): { expected: EvaluationResult; passed: boolean } => {
  let passed = true;
  let expected: EvaluationResult;
  if (definition.kind === 'constant') {
    expected = validatedEvaluation(definition.literal.value);
  } else if (definition.givenSource.kind === 'literal') {
    expected = validatedEvaluation(definition.givenSource.value);
  } else {
    const key = JSON.stringify([
      invocation.id,
      definition.givenSource.parameterName,
    ]);
    usedBindings.add(key);
    const binding = bindingChecks.get(key);
    if (binding === undefined) {
      expected = {
        ok: false,
        diagnostics: [
          definitionDiagnostic({
            check,
            code: 'MISSING_INPUT_BINDING',
            message: `Input '${definition.givenSource.parameterName}' has no binding.`,
            definition,
            evaluator,
            invocation,
          }),
        ],
      };
    } else {
      expected = binding.expected;
      passed &&= binding.passed;
      state.diagnostics.push(
        ...binding.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          symbolId: diagnostic.symbolId ?? definition.symbolId,
        })),
      );
    }
  }

  return { expected, passed };
};

const verifyFormulaDefinition = ({
  definition,
  check,
  evaluator,
  graph,
  observation,
  evaluated,
  state,
}: DefinitionCheckContext & {
  readonly definition: Extract<SymbolDefinition, { kind: 'formula' }>;
}): boolean => {
  const invocation = graph.invocation;
  let passed = true;
  const root = graph.nodes.get(graph.symbol.valueTree.rootKey);
  if (root?.mode === 'LITERAL') {
    passed = false;
    state.diagnostics.push(
      definitionDiagnostic({
        check,
        code: 'OMITTED_FORMULA',
        message:
          'A formula definition cannot use a bare literal as its documented formula.',
        definition,
        evaluator,
        invocation,
      }),
    );
  }
  if (!evaluated.ok) {
    passed = false;
    state.diagnostics.push(...checkedDiagnostics(evaluated.diagnostics, check));
  } else if (observation !== undefined) {
    const compared = compare({
      actual: observation.value,
      expected: evaluated.value,
      check,
      code: 'FORMULA_MISMATCH',
      message:
        'Python runtime result differs from the documented formula evaluation.',
      definition,
      evaluator,
      invocation,
    });
    passed &&= compared.passed;
    state.diagnostics.push(...compared.diagnostics);
  }
  return passed;
};

const verifySourceValueDefinition = ({
  definition,
  check,
  evaluator,
  graph,
  observation,
  evaluated,
  state,
  bindingChecks,
  usedBindings,
}: DefinitionCheckContext & {
  readonly definition: SourceValueDefinition;
  readonly bindingChecks: ReadonlyMap<string, BindingCheck>;
  readonly usedBindings: Set<string>;
}): boolean => {
  const invocation = graph.invocation;
  let passed = true;
  const root = graph.nodes.get(graph.symbol.valueTree.rootKey);
  const source =
    definition.kind === 'input' ? definition.givenSource : undefined;
  const sourceBinding =
    source?.kind === 'parameter'
      ? invocation.inputBindings.find(
          (binding) => binding.parameterName === source.parameterName,
        )
      : undefined;
  const matchesCallerReference =
    root?.mode === 'SYMBOL' &&
    sourceBinding?.kind === 'callerSymbol' &&
    root.symbol?.id === sourceBinding.source.symbolId;
  if (root?.mode !== 'LITERAL' && !matchesCallerReference) {
    passed = false;
    state.diagnostics.push(
      definitionDiagnostic({
        check,
        code: 'SOURCE_VALUE_GRAPH_MISMATCH',
        message:
          'An input or source literal must use a literal root or the exact bound caller-symbol reference; another graph adds steps absent from its source definition.',
        definition,
        evaluator,
        invocation,
      }),
    );
  }
  const sourceValue = resolveDefinitionSourceValue({
    definition,
    invocation,
    evaluator,
    check,
    state,
    bindingChecks,
    usedBindings,
  });
  const expected = sourceValue.expected;
  passed &&= sourceValue.passed;

  if (!expected.ok) {
    passed = false;
    state.diagnostics.push(...checkedDiagnostics(expected.diagnostics, check));
  } else {
    if (!evaluated.ok) {
      passed = false;
      state.diagnostics.push(
        ...checkedDiagnostics(evaluated.diagnostics, check),
      );
    } else {
      const graphComparison = compare({
        actual: evaluated.value,
        expected: expected.value,
        check,
        code:
          definition.kind === 'input' ? 'INPUT_MISMATCH' : 'CONSTANT_MISMATCH',
        message:
          definition.kind === 'input'
            ? 'Documented input graph differs from its parsed source value.'
            : 'Documented constant graph differs from its parsed source literal.',
        definition,
        evaluator,
        invocation,
      });
      passed &&= graphComparison.passed;
      state.diagnostics.push(...graphComparison.diagnostics);
    }
    if (observation !== undefined) {
      const runtimeComparison = compare({
        actual: observation.value,
        expected: expected.value,
        check,
        code:
          definition.kind === 'input' ? 'INPUT_MISMATCH' : 'CONSTANT_MISMATCH',
        message:
          definition.kind === 'input'
            ? 'Python input result differs from its independent source value.'
            : 'Python constant result differs from its parsed source literal.',
        definition,
        evaluator,
        invocation,
      });
      passed &&= runtimeComparison.passed;
      state.diagnostics.push(...runtimeComparison.diagnostics);
    }
  }
  return passed;
};

const verifyDefinitions = ({
  evaluator,
  execution,
}: {
  readonly evaluator: FormulaEvaluator;
  readonly execution: ExecutionPayload;
}): {
  readonly checks: Record<ConsistencyCheckName, Check>;
  readonly diagnostics: readonly Diagnostic[];
} => {
  const categories = {
    inputConsistency: createCategoryState(),
    constantConsistency: createCategoryState(),
    formulaConsistency: createCategoryState(),
  };
  const bindingChecks = new Map<string, BindingCheck>();
  const usedBindings = new Set<string>();

  for (const invocation of execution.invocations) {
    for (const binding of invocation.inputBindings) {
      const key = JSON.stringify([invocation.id, binding.parameterName]);
      bindingChecks.set(key, checkBinding({ binding, evaluator, invocation }));
    }
  }

  for (const graph of evaluator.graphs.values()) {
    const definition = graph.definition;
    const invocation = graph.invocation;
    const observation = observationFor(execution, definition.symbolId);
    const address = {
      symbolId: graph.symbol.id,
      nodeKey: graph.symbol.valueTree.rootKey,
    };
    const evaluated = evaluator.evaluate(address);
    const check: ConsistencyCheckName =
      definition.kind === 'input'
        ? 'inputConsistency'
        : definition.kind === 'constant'
          ? 'constantConsistency'
          : 'formulaConsistency';
    const state = categories[check];
    let passed = true;

    if (definition.kind === 'unsupported') {
      passed = false;
      state.diagnostics.push(
        definitionDiagnostic({
          check,
          code: 'UNSUPPORTED_RESULT',
          message: definition.reason,
          definition,
          evaluator,
          invocation,
        }),
      );
    } else if (definition.kind === 'formula') {
      passed = verifyFormulaDefinition({
        definition,
        check,
        evaluator,
        graph,
        observation,
        evaluated,
        state,
      });
    } else {
      passed = verifySourceValueDefinition({
        definition,
        check,
        evaluator,
        graph,
        observation,
        evaluated,
        state,
        bindingChecks,
        usedBindings,
      });
    }

    if (observation === undefined) {
      passed = false;
      state.diagnostics.push(
        definitionDiagnostic({
          check,
          code: 'MISSING_OBSERVATION',
          message: 'Documented symbol has no Python runtime observation.',
          definition,
          evaluator,
          invocation,
        }),
      );
    }

    const operationChecks = checkOperationObservations({
      check,
      evaluator,
      execution,
      graph,
    });
    passed &&= operationChecks.passed;
    state.diagnostics.push(...operationChecks.diagnostics);
    record(state.counts, passed);
    checkCaches({ check, evaluator, graph, state });
  }

  for (const [key, binding] of bindingChecks) {
    if (usedBindings.has(key) || binding.passed) {
      continue;
    }
    categories.inputConsistency.uncountedFailure = true;
    categories.inputConsistency.diagnostics.push(...binding.diagnostics);
  }

  return {
    checks: {
      inputConsistency: categoryCheck(categories.inputConsistency),
      constantConsistency: categoryCheck(categories.constantConsistency),
      formulaConsistency: categoryCheck(categories.formulaConsistency),
    },
    diagnostics: Object.values(categories).flatMap(
      (category) => category.diagnostics,
    ),
  };
};

const referenceComparison = (
  comparison: Comparison,
  formulaValue: number | undefined,
  revision: string,
): Comparison => ({
  ...comparison,
  ...(formulaValue === undefined ? {} : { formulaValue }),
  referenceRevision: revision,
});

const verifyReferences = ({
  evaluator,
  execution,
  referenceCases,
}: {
  readonly evaluator: FormulaEvaluator;
  readonly execution: ExecutionPayload;
  readonly referenceCases: unknown;
}): { readonly check: Check; readonly diagnostics: readonly Diagnostic[] } => {
  if (referenceCases === undefined) {
    return {
      check: { status: 'not_applicable', counts: emptyCounts() },
      diagnostics: [],
    };
  }
  const parsed = ReferenceCasesSchema.safeParse(referenceCases);
  if (!parsed.success) {
    return {
      check: { status: 'failed' },
      diagnostics: issuesToDiagnostics({
        check: 'independentReferenceAgreement',
        input: referenceCases,
        issues: parsed.error.issues,
        referenceExecution: execution,
        stage: 'reference',
      }),
    };
  }
  const bindingKey = executionBindingKey({
    entryModuleId: execution.entry.moduleId,
    entrySourceHash: execution.entry.sourceHash,
    sourceClosureHash: execution.sourceClosureHash,
    function: execution.entry.function,
    resolvedInputs: execution.entry.resolvedInputs,
  });
  const reference = parsed.data.find(
    (candidate) => executionBindingKey(candidate.binding) === bindingKey,
  );
  if (reference === undefined) {
    return {
      check: { status: 'not_applicable', counts: emptyCounts() },
      diagnostics: [],
    };
  }
  const bound = BoundReferenceCaseSchema.safeParse({
    execution,
    referenceCase: reference,
  });
  if (!bound.success) {
    return {
      check: { status: 'failed' },
      diagnostics: issuesToDiagnostics({
        check: 'independentReferenceAgreement',
        input: { execution, referenceCase: reference },
        issues: bound.error.issues,
        stage: 'reference',
      }),
    };
  }

  const counts = emptyCounts();
  const diagnostics: Diagnostic[] = [];
  for (const expected of reference.expected) {
    const graph = evaluator.graphs.get(expected.symbolId);
    if (graph === undefined) {
      record(counts, false);
      diagnostics.push({
        code: 'UNKNOWN_REFERENCE_SYMBOL',
        message: `Reference symbol '${expected.symbolId}' is absent from the formula registry.`,
        stage: 'reference',
        check: 'independentReferenceAgreement',
        symbolId: expected.symbolId,
      });
      continue;
    }
    const observation = observationFor(execution, expected.symbolId);
    const root = graph.nodes.get(graph.symbol.valueTree.rootKey);
    const formula = evaluator.evaluate({
      symbolId: graph.symbol.id,
      nodeKey: graph.symbol.valueTree.rootKey,
    });
    const formulaAvailable =
      graph.definition.kind === 'formula' &&
      root?.mode !== 'LITERAL' &&
      formula.ok;
    let passed = true;

    if (!formulaAvailable) {
      passed = false;
      diagnostics.push(
        definitionDiagnostic({
          check: 'independentReferenceAgreement',
          code: 'REFERENCE_FORMULA_UNAVAILABLE',
          message:
            'Independent reference comparison requires an evaluated documented formula.',
          definition: graph.definition,
          evaluator,
          invocation: graph.invocation,
        }),
      );
    } else {
      const compared = compareNumbers(formula.value, expected.value);
      if (!compared.matches) {
        passed = false;
        const observedComparison =
          observation === undefined
            ? undefined
            : compareNumbers(observation.value, expected.value).comparison;
        diagnostics.push(
          definitionDiagnostic({
            check: 'independentReferenceAgreement',
            code: 'REFERENCE_FORMULA_MISMATCH',
            message:
              'Documented formula differs from the independent reference value.',
            definition: graph.definition,
            evaluator,
            invocation: graph.invocation,
            ...(observedComparison === undefined
              ? {}
              : {
                  comparison: referenceComparison(
                    observedComparison,
                    formula.value,
                    reference.revision,
                  ),
                }),
          }),
        );
      }
    }

    if (observation === undefined) {
      passed = false;
      diagnostics.push(
        definitionDiagnostic({
          check: 'independentReferenceAgreement',
          code: 'REFERENCE_OBSERVATION_UNAVAILABLE',
          message:
            'Independent reference comparison requires a Python runtime observation.',
          definition: graph.definition,
          evaluator,
          invocation: graph.invocation,
        }),
      );
    } else {
      const compared = compareNumbers(observation.value, expected.value);
      if (!compared.matches) {
        passed = false;
        diagnostics.push(
          definitionDiagnostic({
            check: 'independentReferenceAgreement',
            code: 'REFERENCE_RUNTIME_MISMATCH',
            message:
              'Python runtime result differs from the independent reference value.',
            definition: graph.definition,
            evaluator,
            invocation: graph.invocation,
            comparison: referenceComparison(
              compared.comparison,
              formulaAvailable ? formula.value : undefined,
              reference.revision,
            ),
          }),
        );
      }
    }
    record(counts, passed);
  }

  if (counts.checked === 0) {
    return {
      check: { status: 'not_applicable', counts },
      diagnostics,
    };
  }

  return {
    check: {
      status: counts.failed > 0 ? 'failed' : 'passed',
      counts,
    },
    diagnostics,
  };
};

const uniqueDiagnostics = (
  diagnostics: readonly Diagnostic[],
): Diagnostic[] => {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = JSON.stringify(diagnostic);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const verifyOutputs = (
  execution: ExecutionPayload,
  evaluator: FormulaEvaluator,
): { check: Check; diagnostics: Diagnostic[] } => {
  const counts = emptyCounts();
  const diagnostics: Diagnostic[] = [];
  for (const output of execution.authoring?.outputs ?? []) {
    const expected = evaluator.evaluateSymbol(output.symbolId);
    const comparison = expected.ok
      ? compareNumbers(output.value, expected.value)
      : undefined;
    const passed = comparison?.matches === true;
    record(counts, passed);
    if (!passed)
      diagnostics.push({
        code: 'OUTPUT_MISMATCH',
        stage: 'verification',
        check: 'outputConsistency',
        message: `Returned output '${output.name}' differs from its documented source.`,
        invocationId: output.invocationId,
        symbolId: output.symbolId,
        location: output.location,
        ...(comparison ? { comparison: comparison.comparison } : {}),
      });
  }
  return {
    check: {
      status: counts.failed
        ? 'failed'
        : counts.checked
          ? 'passed'
          : 'not_applicable',
      counts,
    },
    diagnostics,
  };
};

export const verifyExecution: VerifyExecution = (input): VerificationReport => {
  const boundary = VerificationBoundarySchema.safeParse(input);
  if (!boundary.success) {
    return reportForInvalidExecution(
      issuesToDiagnostics({
        check: 'executionValidity',
        input,
        issues: boundary.error.issues,
        stage: 'contract',
      }),
    );
  }
  const parsedExecution = ExecutionPayloadSchema.safeParse(
    boundary.data.execution,
  );
  if (!parsedExecution.success) {
    return reportForInvalidExecution(
      issuesToDiagnostics({
        check: 'executionValidity',
        input: boundary.data.execution,
        issues: parsedExecution.error.issues,
        stage: 'contract',
      }),
    );
  }

  const execution = parsedExecution.data;
  const evaluator = createFormulaEvaluator(execution);
  const source = verifyDefinitions({ evaluator, execution });
  const outputs = verifyOutputs(execution, evaluator);
  const reference = verifyReferences({
    evaluator,
    execution,
    referenceCases: boundary.data.referenceCases,
  });
  const sourcePassed =
    Object.values(source.checks).every((check) => check.status !== 'failed') &&
    outputs.check.status !== 'failed';
  const diagnostics = uniqueDiagnostics([
    ...source.diagnostics,
    ...outputs.diagnostics,
    ...reference.diagnostics,
  ]);

  return VerificationReportSchema.parse({
    ok: sourcePassed && reference.check.status !== 'failed',
    numericPolicy,
    checks: {
      executionValidity: { status: 'passed' },
      ...source.checks,
      outputConsistency: outputs.check,
      sourceToDocumentConsistency: {
        status: sourcePassed ? 'passed' : 'failed',
      },
      independentReferenceAgreement: reference.check,
    },
    diagnostics,
  });
};

export type { ReferenceCase };
