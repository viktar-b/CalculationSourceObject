import { SheetDocumentSchema } from '../sheet-model/schema.ts';
import type {
  SheetDocument,
  SheetLiteral,
  SheetSymbol,
  SheetValueNode,
  SheetValueTree,
} from '../sheet-model/types.ts';
import { assertNever } from '../shared/assertNever.ts';
import {
  createSheetFromValueTreeJson,
  type Calculation,
  type ValueTreeSheetOptions,
} from '../value-tree-json/to-sheet.ts';

export interface PythonExportOptions {
  readonly functionName?: string;
}

export type PythonFromValueTreeJsonOptions = ValueTreeSheetOptions &
  PythonExportOptions;

type PythonExpression = {
  readonly code: string;
  readonly precedence: number;
  readonly usesMath: boolean;
};

type PythonRenderContext = {
  readonly pythonNameBySymbolId: ReadonlyMap<string, string>;
};

const PythonPrecedence = {
  Conditional: 1,
  LogicalOr: 2,
  LogicalAnd: 3,
  Compare: 4,
  AddSubtract: 5,
  MultiplyDivide: 6,
  Unary: 7,
  Power: 8,
  Call: 9,
  Atom: 10,
} as const;

const leadingDigitPattern = /^[0-9]/;

const pythonReservedWords = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);

const toPythonIdentifier = (value: string, fallback: string): string => {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const withFallback = sanitized || fallback;
  const safeLeadingCharacter = leadingDigitPattern.test(withFallback)
    ? `_${withFallback}`
    : withFallback;

  return pythonReservedWords.has(safeLeadingCharacter)
    ? `${safeLeadingCharacter}_value`
    : safeLeadingCharacter;
};

const buildUniquePythonName = (
  baseName: string,
  usedNames: Set<string>,
): string => {
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  let suffix = 2;
  let candidate = `${baseName}_${suffix}`;

  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${baseName}_${suffix}`;
  }

  usedNames.add(candidate);
  return candidate;
};

const buildPythonNameBySymbolId = (
  symbols: readonly SheetSymbol[],
): ReadonlyMap<string, string> => {
  const usedNames = new Set<string>();
  const pythonNameBySymbolId = new Map<string, string>();

  symbols.forEach((symbol, symbolIndex) => {
    const baseName = toPythonIdentifier(
      symbol.glyphCodeName ?? symbol.id,
      `symbol_${symbolIndex + 1}`,
    );

    pythonNameBySymbolId.set(
      symbol.id,
      buildUniquePythonName(baseName, usedNames),
    );
  });

  return pythonNameBySymbolId;
};

const literalToPython = (literal: SheetLiteral): PythonExpression => {
  switch (literal.kind) {
    case 'boolean':
      return {
        code: literal.value ? 'True' : 'False',
        precedence: PythonPrecedence.Atom,
        usesMath: false,
      };
    case 'empty':
      return {
        code: 'None',
        precedence: PythonPrecedence.Atom,
        usesMath: false,
      };
    case 'number':
      return {
        code: Number.isNaN(literal.value) ? 'math.nan' : `${literal.value}`,
        precedence: PythonPrecedence.Atom,
        usesMath: Number.isNaN(literal.value),
      };
    case 'string':
      return {
        code: JSON.stringify(literal.value),
        precedence: PythonPrecedence.Atom,
        usesMath: false,
      };
    default:
      return assertNever(literal);
  }
};

const parenthesize = (
  expression: PythonExpression,
  requiredPrecedence: number,
): string =>
  expression.precedence < requiredPrecedence
    ? `(${expression.code})`
    : expression.code;

const parenthesizeBinaryOperand = ({
  expression,
  parentPrecedence,
  parenthesizeEqualPrecedence,
}: {
  readonly expression: PythonExpression;
  readonly parentPrecedence: number;
  readonly parenthesizeEqualPrecedence: boolean;
}): string =>
  expression.precedence < parentPrecedence ||
  (parenthesizeEqualPrecedence && expression.precedence === parentPrecedence)
    ? `(${expression.code})`
    : expression.code;

const combineMathUsage = (expressions: readonly PythonExpression[]): boolean =>
  expressions.some((expression) => expression.usesMath);

const requireArgCount = (
  functionId: string,
  args: readonly PythonExpression[],
  expected: number,
): void => {
  if (args.length !== expected) {
    throw new Error(
      `Cannot export function '${functionId}' with ${args.length} args to Python`,
    );
  }
};

const binaryExpression = (
  functionId: string,
  args: readonly PythonExpression[],
  operator: string,
  precedence: number,
  options: {
    readonly parenthesizeEqualLeft?: boolean;
    readonly parenthesizeEqualRight?: boolean;
  } = {},
): PythonExpression => {
  requireArgCount(functionId, args, 2);

  const [left, right] = args;

  return {
    code: `${parenthesizeBinaryOperand({
      expression: left,
      parentPrecedence: precedence,
      parenthesizeEqualPrecedence: options.parenthesizeEqualLeft ?? false,
    })} ${operator} ${parenthesizeBinaryOperand({
      expression: right,
      parentPrecedence: precedence,
      parenthesizeEqualPrecedence: options.parenthesizeEqualRight ?? false,
    })}`,
    precedence,
    usesMath: combineMathUsage(args),
  };
};

const requireAtLeastOneArg = (
  functionId: string,
  args: readonly PythonExpression[],
): void => {
  if (args.length === 0) {
    throw new Error(
      `Cannot export function '${functionId}' with 0 args to Python`,
    );
  }
};

const logicalExpression = (
  functionId: string,
  args: readonly PythonExpression[],
  operator: string,
  precedence: number,
): PythonExpression => {
  requireAtLeastOneArg(functionId, args);

  if (args.length === 1) {
    return args[0];
  }

  return {
    code: args
      .map((arg) =>
        parenthesizeBinaryOperand({
          expression: arg,
          parentPrecedence: precedence,
          parenthesizeEqualPrecedence: false,
        }),
      )
      .join(` ${operator} `),
    precedence,
    usesMath: combineMathUsage(args),
  };
};

const mathSingleArgCall = (
  functionId: string,
  args: readonly PythonExpression[],
  name: string,
): PythonExpression => {
  requireArgCount(functionId, args, 1);

  return {
    code: `math.${name}(${args[0].code})`,
    precedence: PythonPrecedence.Call,
    usesMath: true,
  };
};

const pythonCallExpression = (
  functionId: string,
  args: readonly PythonExpression[],
  name: string,
): PythonExpression => {
  requireAtLeastOneArg(functionId, args);

  return {
    code: `${name}(${args.map((arg) => arg.code).join(', ')})`,
    precedence: PythonPrecedence.Call,
    usesMath: combineMathUsage(args),
  };
};

const optionalSecondArgCallExpression = (
  functionId: string,
  args: readonly PythonExpression[],
  name: string,
  usesMath: boolean,
): PythonExpression => {
  if (args.length === 0 || args.length > 2) {
    throw new Error(
      `Cannot export function '${functionId}' with ${args.length} args to Python`,
    );
  }

  return {
    code: `${name}(${args.map((arg) => arg.code).join(', ')})`,
    precedence: PythonPrecedence.Call,
    usesMath,
  };
};

const passthroughExpression = (
  args: readonly PythonExpression[],
): PythonExpression => {
  if (args.length === 0) {
    return {
      code: 'None',
      precedence: PythonPrecedence.Atom,
      usesMath: false,
    };
  }

  if (args.length === 1) {
    return args[0];
  }

  return {
    code: `(${args.map((arg) => arg.code).join(', ')})`,
    precedence: PythonPrecedence.Atom,
    usesMath: combineMathUsage(args),
  };
};

type FunctionExpressionRenderer = (
  args: readonly PythonExpression[],
) => PythonExpression;

const comparisonOptions = {
  parenthesizeEqualLeft: true,
  parenthesizeEqualRight: true,
} as const;

const functionExpressionRenderers: Readonly<
  Record<string, FunctionExpressionRenderer>
> = {
  'fg.add': (args) =>
    binaryExpression('fg.add', args, '+', PythonPrecedence.AddSubtract),
  'fg.and': (args) =>
    logicalExpression('fg.and', args, 'and', PythonPrecedence.LogicalAnd),
  'fg.ceil': (args) => mathSingleArgCall('fg.ceil', args, 'ceil'),
  'fg.cnd': (args) => {
    requireArgCount('fg.cnd', args, 3);
    return {
      code: `${args[1].code} if ${args[0].code} else ${args[2].code}`,
      precedence: PythonPrecedence.Conditional,
      usesMath: combineMathUsage(args),
    };
  },
  'fg.deg': (args) => mathSingleArgCall('fg.deg', args, 'degrees'),
  'fg.divide': (args) =>
    binaryExpression('fg.divide', args, '/', PythonPrecedence.MultiplyDivide, {
      parenthesizeEqualRight: true,
    }),
  'fg.eq': (args) =>
    binaryExpression('fg.eq', args, '==', PythonPrecedence.Compare, {
      ...comparisonOptions,
    }),
  'fg.exp': (args) => mathSingleArgCall('fg.exp', args, 'exp'),
  'fg.ge': (args) =>
    binaryExpression('fg.ge', args, '>=', PythonPrecedence.Compare, {
      ...comparisonOptions,
    }),
  'fg.gt': (args) =>
    binaryExpression('fg.gt', args, '>', PythonPrecedence.Compare, {
      ...comparisonOptions,
    }),
  'fg.le': (args) =>
    binaryExpression('fg.le', args, '<=', PythonPrecedence.Compare, {
      ...comparisonOptions,
    }),
  'fg.log': (args) =>
    optionalSecondArgCallExpression('fg.log', args, 'math.log', true),
  'fg.lt': (args) =>
    binaryExpression('fg.lt', args, '<', PythonPrecedence.Compare, {
      ...comparisonOptions,
    }),
  'fg.max': (args) => pythonCallExpression('fg.max', args, 'max'),
  'fg.min': (args) => pythonCallExpression('fg.min', args, 'min'),
  'fg.multiply': (args) =>
    binaryExpression('fg.multiply', args, '*', PythonPrecedence.MultiplyDivide),
  'fg.ne': (args) =>
    binaryExpression('fg.ne', args, '!=', PythonPrecedence.Compare, {
      ...comparisonOptions,
    }),
  'fg.noop': passthroughExpression,
  'fg.or': (args) =>
    logicalExpression('fg.or', args, 'or', PythonPrecedence.LogicalOr),
  'fg.pi': (args) => {
    requireArgCount('fg.pi', args, 0);
    return {
      code: 'math.pi',
      precedence: PythonPrecedence.Atom,
      usesMath: true,
    };
  },
  'fg.pow': (args) =>
    binaryExpression('fg.pow', args, '**', PythonPrecedence.Power, {
      parenthesizeEqualLeft: true,
    }),
  'fg.round': (args) =>
    optionalSecondArgCallExpression(
      'fg.round',
      args,
      'round',
      combineMathUsage(args),
    ),
  'fg.sqrt': (args) => mathSingleArgCall('fg.sqrt', args, 'sqrt'),
  'fg.stub': passthroughExpression,
  'fg.subtract': (args) =>
    binaryExpression('fg.subtract', args, '-', PythonPrecedence.AddSubtract, {
      parenthesizeEqualRight: true,
    }),
  'fg.uminus': (args) => {
    requireArgCount('fg.uminus', args, 1);
    return {
      code: `-${parenthesize(args[0], PythonPrecedence.Unary)}`,
      precedence: PythonPrecedence.Unary,
      usesMath: args[0].usesMath,
    };
  },
};

const renderFunctionExpression = (
  functionId: string,
  args: readonly PythonExpression[],
): PythonExpression => {
  const renderer = functionExpressionRenderers[functionId];

  if (!renderer) {
    throw new Error(`Cannot export unsupported function '${functionId}'`);
  }

  return renderer(args);
};

const nodeByKey = (tree: SheetValueTree): ReadonlyMap<string, SheetValueNode> =>
  new Map(tree.nodes.map((node) => [node.key, node]));

const renderValueNode = ({
  context,
  node,
  nodeLookup,
  stack,
}: {
  readonly context: PythonRenderContext;
  readonly node: SheetValueNode;
  readonly nodeLookup: ReadonlyMap<string, SheetValueNode>;
  readonly stack: readonly string[];
}): PythonExpression => {
  if (stack.includes(node.key)) {
    throw new Error(
      `Cycle inside value tree at node '${node.key}' while exporting Python`,
    );
  }

  switch (node.kind) {
    case 'literal':
      return literalToPython(node.value);
    case 'symbol': {
      const pythonName = context.pythonNameBySymbolId.get(node.symbolId);

      if (!pythonName) {
        throw new Error(
          `Symbol reference '${node.symbolId}' does not resolve for Python export`,
        );
      }

      return {
        code: pythonName,
        precedence: PythonPrecedence.Atom,
        usesMath: false,
      };
    }
    case 'function': {
      if (
        node.functionId === 'fg.stub' &&
        node.argKeys.length === 0 &&
        node.result
      ) {
        return literalToPython(node.result);
      }

      const args = node.argKeys.map((argKey) => {
        const argNode = nodeLookup.get(argKey);

        if (!argNode) {
          throw new Error(
            `Function argument '${argKey}' does not resolve for Python export`,
          );
        }

        return renderValueNode({
          context,
          node: argNode,
          nodeLookup,
          stack: [...stack, node.key],
        });
      });

      return renderFunctionExpression(node.functionId, args);
    }
    default:
      return assertNever(node);
  }
};

const renderSymbolExpression = (
  symbol: SheetSymbol,
  context: PythonRenderContext,
): PythonExpression => {
  const nodeLookup = nodeByKey(symbol.valueTree);
  const rootNode = nodeLookup.get(symbol.valueTree.rootKey);

  if (!rootNode) {
    throw new Error(
      `Root node '${symbol.valueTree.rootKey}' does not resolve for Python export`,
    );
  }

  return renderValueNode({
    context,
    node: rootNode,
    nodeLookup,
    stack: [],
  });
};

const collectReachableSymbolIds = (
  tree: SheetValueTree,
  node: SheetValueNode,
  nodeLookup: ReadonlyMap<string, SheetValueNode>,
  visitedNodeKeys: Set<string>,
): ReadonlySet<string> => {
  if (visitedNodeKeys.has(node.key)) {
    return new Set();
  }

  visitedNodeKeys.add(node.key);

  if (node.kind === 'symbol') {
    return new Set([node.symbolId]);
  }

  if (node.kind !== 'function') {
    return new Set();
  }

  const symbolIds = new Set<string>();

  for (const argKey of node.argKeys) {
    const argNode = nodeLookup.get(argKey);

    if (!argNode) {
      throw new Error(
        `Function argument '${argKey}' does not resolve for Python export`,
      );
    }

    for (const symbolId of collectReachableSymbolIds(
      tree,
      argNode,
      nodeLookup,
      visitedNodeKeys,
    )) {
      symbolIds.add(symbolId);
    }
  }

  return symbolIds;
};

const collectSymbolDependencies = (
  symbol: SheetSymbol,
): ReadonlySet<string> => {
  const lookup = nodeByKey(symbol.valueTree);
  const rootNode = lookup.get(symbol.valueTree.rootKey);

  if (!rootNode) {
    throw new Error(
      `Root node '${symbol.valueTree.rootKey}' does not resolve for Python export`,
    );
  }

  return collectReachableSymbolIds(
    symbol.valueTree,
    rootNode,
    lookup,
    new Set(),
  );
};

const orderSymbolsForPython = (
  symbols: readonly SheetSymbol[],
): readonly SheetSymbol[] => {
  const symbolById = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const dependenciesBySymbolId = new Map(
    symbols.map((symbol) => [
      symbol.id,
      new Set(
        [...collectSymbolDependencies(symbol)].filter(
          (symbolId) => symbolId !== symbol.id,
        ),
      ),
    ]),
  );
  const orderedSymbols: SheetSymbol[] = [];
  const resolvedSymbolIds = new Set<string>();
  const remainingSymbolIds = new Set(symbols.map((symbol) => symbol.id));

  while (remainingSymbolIds.size > 0) {
    let progressed = false;

    for (const symbol of symbols) {
      if (!remainingSymbolIds.has(symbol.id)) {
        continue;
      }

      const dependencies = dependenciesBySymbolId.get(symbol.id) ?? new Set();
      const dependenciesResolved = [...dependencies].every((symbolId) =>
        resolvedSymbolIds.has(symbolId),
      );

      if (!dependenciesResolved) {
        continue;
      }

      orderedSymbols.push(symbol);
      resolvedSymbolIds.add(symbol.id);
      remainingSymbolIds.delete(symbol.id);
      progressed = true;
    }

    if (!progressed) {
      throw new Error(
        `Could not resolve Python export order for symbols: ${[
          ...remainingSymbolIds,
        ].join(', ')}`,
      );
    }
  }

  return orderedSymbols.map((symbol) => {
    const resolvedSymbol = symbolById.get(symbol.id);

    if (!resolvedSymbol) {
      throw new Error(`Symbol '${symbol.id}' does not resolve`);
    }

    return resolvedSymbol;
  });
};

const sanitizeCommentLine = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const renderSymbolComment = (symbol: SheetSymbol): string | undefined => {
  const parts = [
    sanitizeCommentLine(symbol.description),
    symbol.unit ? `[${sanitizeCommentLine(symbol.unit)}]` : '',
  ].filter(Boolean);

  return parts.length > 0 ? `    # ${parts.join(' ')}` : undefined;
};

export const createPythonFromSheetDocument = (
  source: SheetDocument,
  options: PythonExportOptions = {},
): string => {
  const sheet = SheetDocumentSchema.parse(source);
  const functionName = toPythonIdentifier(
    options.functionName ?? `calculate_${sheet.id}`,
    'calculate_sheet',
  );
  const pythonNameBySymbolId = buildPythonNameBySymbolId(sheet.symbols);
  const context: PythonRenderContext = { pythonNameBySymbolId };
  const orderedSymbols = orderSymbolsForPython(sheet.symbols);
  const assignments: string[] = [];
  let usesMath = false;

  for (const symbol of orderedSymbols) {
    const pythonName = pythonNameBySymbolId.get(symbol.id);

    if (!pythonName) {
      throw new Error(
        `Symbol '${symbol.id}' does not have a Python identifier`,
      );
    }

    const comment = renderSymbolComment(symbol);
    const expression = renderSymbolExpression(symbol, context);

    usesMath = usesMath || expression.usesMath;

    if (comment) {
      assignments.push(comment);
    }
    assignments.push(`    ${pythonName} = ${expression.code}`);
  }

  const returnEntries = sheet.symbols.map((symbol) => {
    const pythonName = pythonNameBySymbolId.get(symbol.id);

    if (!pythonName) {
      throw new Error(
        `Symbol '${symbol.id}' does not have a Python identifier`,
      );
    }

    return `        ${JSON.stringify(symbol.id)}: ${pythonName},`;
  });
  const lines = [
    'from __future__ import annotations',
    ...(usesMath ? ['', 'import math'] : []),
    '',
    '',
    `def ${functionName}() -> dict[str, object]:`,
    `    """Generated from FormulaSheet sheet: ${sheet.title}."""`,
    ...assignments,
    '    return {',
    ...returnEntries,
    '    }',
    '',
  ];

  return `${lines.join('\n')}`;
};

export const createPythonFromValueTreeJson = (
  source: unknown,
  options: PythonFromValueTreeJsonOptions,
): string => {
  const { functionName, ...sheetOptions } = options;
  const valueTreeSheet = createSheetFromValueTreeJson(source, sheetOptions);

  return createPythonFromSheetDocument(valueTreeSheet.sheet, { functionName });
};

export const createPythonFromCalculation = (
  calculation: Calculation,
  options?: PythonExportOptions,
): string => createPythonFromSheetDocument(calculation.sheet, options);
