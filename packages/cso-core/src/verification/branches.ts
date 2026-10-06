type FormulaNode = {
  readonly key: string;
  readonly mode?: string;
  readonly draft?: unknown;
  readonly parameter?: unknown;
  readonly literal?: unknown;
  readonly symbol?: unknown;
  readonly ref?: unknown;
  readonly funcSpec?: unknown;
  readonly funcArgs?: unknown;
};

const argumentKeys = (node: FormulaNode): string[] =>
  Array.isArray(node.funcArgs)
    ? node.funcArgs.flatMap((argument) => {
        if (
          argument &&
          typeof argument === 'object' &&
          'key' in argument &&
          typeof argument.key === 'string'
        ) {
          return [argument.key];
        }
        return [];
      })
    : [];

const functionId = (node: FormulaNode): string | undefined => {
  const spec = node.funcSpec;
  if (
    spec &&
    typeof spec === 'object' &&
    'id' in spec &&
    typeof spec.id === 'string'
  ) {
    return spec.id;
  }
  return undefined;
};

const symbolId = (node: FormulaNode): string | undefined => {
  const symbol = node.symbol;
  if (
    symbol &&
    typeof symbol === 'object' &&
    'id' in symbol &&
    typeof symbol.id === 'string'
  ) {
    return symbol.id;
  }
  return undefined;
};

const reference = (
  node: FormulaNode,
): { kind?: string; name?: string; call?: string; output?: string } => {
  const ref = node.ref;
  if (!ref || typeof ref !== 'object') return {};
  const record = ref as Record<string, unknown>;
  return {
    ...(typeof record.kind === 'string' ? { kind: record.kind } : {}),
    ...(typeof record.name === 'string' ? { name: record.name } : {}),
    ...(typeof record.call === 'string' ? { call: record.call } : {}),
    ...(typeof record.output === 'string' ? { output: record.output } : {}),
  };
};

const literalNumber = (node: FormulaNode): number | undefined => {
  const literal = node.literal;
  if (
    literal &&
    typeof literal === 'object' &&
    'value' in literal &&
    typeof literal.value === 'number'
  ) {
    return literal.value;
  }
  return undefined;
};

export type ReproducedBranch = {
  readonly nodeKey: string;
  readonly value: boolean;
  readonly usedKeys: readonly string[];
  readonly selectedKey: string;
};

const comparisons: Record<string, (left: number, right: number) => boolean> = {
  'fg.lt': (left, right) => left < right,
  'fg.le': (left, right) => left <= right,
  'fg.gt': (left, right) => left > right,
  'fg.ge': (left, right) => left >= right,
  'fg.eq': (left, right) => left === right,
  'fg.ne': (left, right) => left !== right,
};

export function reproduceBranches(
  nodes: readonly FormulaNode[],
  rootKey: string,
  values: ReadonlyMap<string, number>,
): ReproducedBranch[] | undefined {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const branches: ReproducedBranch[] = [];
  const visit = (key: string): boolean => {
    const node = byKey.get(key);
    if (!node) return false;
    if (node.mode !== 'FUNCTION') return true;
    const operation = functionId(node);
    const keys = argumentKeys(node);
    if (operation === 'fg.cnd') {
      const used = new Set<string>();
      const selected = predicate(keys[0] ?? '', used);
      if (selected === undefined) return false;
      const chosen = keys[selected ? 1 : 2] ?? '';
      if (!markEvaluated(chosen, used)) return false;
      used.add(key);
      branches.push({
        nodeKey: key,
        value: selected,
        usedKeys: [...used].sort(),
        selectedKey: chosen,
      });
      return true;
    }
    return keys.every((argument) => visit(argument));
  };
  const predicate = (key: string, used: Set<string>): boolean | undefined => {
    const node = byKey.get(key);
    const operation = node ? functionId(node) : undefined;
    const keys = node ? argumentKeys(node) : [];
    if (!operation || keys.length === 0) return undefined;
    used.add(key);
    if (operation === 'fg.and') {
      for (const argument of keys) {
        const value = predicate(argument, used);
        if (value === undefined) return undefined;
        if (!value) return false;
      }
      return true;
    }
    if (operation === 'fg.or') {
      for (const argument of keys) {
        const value = predicate(argument, used);
        if (value === undefined) return undefined;
        if (value) return true;
      }
      return false;
    }
    const compare = comparisons[operation];
    if (!compare) return undefined;
    const left = numberValue(keys[0] ?? '', used);
    const right = numberValue(keys[1] ?? '', used);
    if (left === undefined || right === undefined) return undefined;
    return compare(left, right);
  };
  const numberValue = (key: string, used: Set<string>): number | undefined => {
    const node = byKey.get(key);
    if (!node?.mode) return undefined;
    used.add(key);
    if (node.mode === 'LITERAL') return literalNumber(node);
    if (node.mode === 'SYMBOL') {
      const id = symbolId(node);
      return id === undefined ? undefined : values.get(id);
    }
    const operation = functionId(node);
    const keys = argumentKeys(node);
    if (operation === 'fg.cnd') {
      const selected = predicate(keys[0] ?? '', used);
      if (selected === undefined) return undefined;
      return numberValue(keys[selected ? 1 : 2] ?? '', used);
    }
    if (operation === 'fg.uminus') {
      const value = numberValue(keys[0] ?? '', used);
      return value === undefined ? undefined : -value;
    }
    const left = numberValue(keys[0] ?? '', used);
    const right = numberValue(keys[1] ?? '', used);
    if (left === undefined || right === undefined) return undefined;
    if (operation === 'fg.add') return left + right;
    if (operation === 'fg.subtract') return left - right;
    if (operation === 'fg.multiply') return left * right;
    if (operation === 'fg.divide') return left / right;
    if (operation === 'fg.pow') return left ** right;
    return undefined;
  };
  const markEvaluated = (key: string, used: Set<string>): boolean => {
    const node = byKey.get(key);
    if (!node) return false;
    if (node.mode === 'FUNCTION' && functionId(node) === 'fg.cnd') {
      const nested = new Set<string>();
      const keys = argumentKeys(node);
      const selected = predicate(keys[0] ?? '', nested);
      if (selected === undefined) return false;
      const chosen = keys[selected ? 1 : 2] ?? '';
      if (!markEvaluated(chosen, nested)) return false;
      nested.add(key);
      branches.push({
        nodeKey: key,
        value: selected,
        usedKeys: [...nested].sort(),
        selectedKey: chosen,
      });
      for (const item of nested) used.add(item);
      return true;
    }
    used.add(key);
    return argumentKeys(node).every((argument) =>
      markEvaluated(argument, used),
    );
  };
  return visit(rootKey) ? branches : undefined;
}

export function reproducePredicate(
  nodes: readonly FormulaNode[],
  rootKey: string,
  values: ReadonlyMap<string, number>,
): { value: boolean; usedKeys: readonly string[] } | undefined {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const used = new Set<string>();
  const predicate = (key: string): boolean | undefined => {
    const node = byKey.get(key);
    const operation = node ? functionId(node) : undefined;
    const keys = node ? argumentKeys(node) : [];
    if (!operation || keys.length === 0) return undefined;
    used.add(key);
    if (operation === 'fg.and') {
      for (const argument of keys) {
        const value = predicate(argument);
        if (value === undefined) return undefined;
        if (!value) return false;
      }
      return true;
    }
    if (operation === 'fg.or') {
      for (const argument of keys) {
        const value = predicate(argument);
        if (value === undefined) return undefined;
        if (value) return true;
      }
      return false;
    }
    const compare = comparisons[operation];
    if (!compare) return undefined;
    const left = numberValue(keys[0] ?? '');
    const right = numberValue(keys[1] ?? '');
    if (left === undefined || right === undefined) return undefined;
    return compare(left, right);
  };
  const numberValue = (key: string): number | undefined => {
    const node = byKey.get(key);
    if (!node?.mode) return undefined;
    used.add(key);
    if (node.mode === 'LITERAL') return literalNumber(node);
    if (node.mode === 'SYMBOL') {
      const name = reference(node).name;
      return name === undefined ? undefined : values.get(name);
    }
    const operation = functionId(node);
    const keys = argumentKeys(node);
    if (operation === 'fg.uminus') {
      const value = numberValue(keys[0] ?? '');
      return value === undefined ? undefined : -value;
    }
    const left = numberValue(keys[0] ?? '');
    const right = numberValue(keys[1] ?? '');
    if (left === undefined || right === undefined) return undefined;
    if (operation === 'fg.add') return left + right;
    if (operation === 'fg.subtract') return left - right;
    if (operation === 'fg.multiply') return left * right;
    if (operation === 'fg.divide') return left / right;
    if (operation === 'fg.pow') return left ** right;
    return undefined;
  };
  const value = predicate(rootKey);
  return value === undefined
    ? undefined
    : { value, usedKeys: [...used].sort() };
}

const usedDependencies = (
  nodes: readonly FormulaNode[],
  rootKey: string,
  identify: (node: FormulaNode) => string | undefined,
  measure: (node: FormulaNode) => number | undefined,
): readonly string[] | undefined => {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const dependencies = new Set<string>();
  const predicate = (key: string): boolean | undefined => {
    const node = byKey.get(key);
    const operation = node ? functionId(node) : undefined;
    const keys = node ? argumentKeys(node) : [];
    if (!node || !operation || keys.length === 0) return undefined;
    if (operation === 'fg.and') {
      for (const argument of keys) {
        const value = predicate(argument);
        if (value === undefined) return undefined;
        if (!value) return false;
      }
      return true;
    }
    if (operation === 'fg.or') {
      for (const argument of keys) {
        const value = predicate(argument);
        if (value === undefined) return undefined;
        if (value) return true;
      }
      return false;
    }
    const compare = comparisons[operation];
    if (!compare) return undefined;
    const left = numberValue(keys[0] ?? '');
    const right = numberValue(keys[1] ?? '');
    if (left === undefined || right === undefined) return undefined;
    return compare(left, right);
  };
  const numberValue = (key: string): number | undefined => {
    const node = byKey.get(key);
    if (!node?.mode) return undefined;
    if (node.mode === 'LITERAL') return literalNumber(node);
    if (node.mode === 'SYMBOL') {
      const identity = identify(node);
      if (identity === undefined) return undefined;
      dependencies.add(identity);
      return measure(node);
    }
    const operation = functionId(node);
    const keys = argumentKeys(node);
    if (operation === 'fg.cnd') {
      const selected = predicate(keys[0] ?? '');
      if (selected === undefined) return undefined;
      return numberValue(keys[selected ? 1 : 2] ?? '');
    }
    if (operation === 'fg.uminus') {
      const value = numberValue(keys[0] ?? '');
      return value === undefined ? undefined : -value;
    }
    if (!operation) return undefined;
    const left = numberValue(keys[0] ?? '');
    const right = numberValue(keys[1] ?? '');
    if (left === undefined || right === undefined) return undefined;
    if (operation === 'fg.add') return left + right;
    if (operation === 'fg.subtract') return left - right;
    if (operation === 'fg.multiply') return left * right;
    if (operation === 'fg.divide') return left / right;
    if (operation === 'fg.pow') return left ** right;
    return keys.every((argument) => numberValue(argument) !== undefined)
      ? 0
      : undefined;
  };
  const visit = (key: string): boolean => {
    const node = byKey.get(key);
    if (!node?.mode) return false;
    if (node.mode === 'LITERAL' || node.mode === 'GIVEN_PARAMETER') return true;
    if (node.mode === 'SYMBOL') {
      const identity = identify(node);
      if (identity === undefined) return false;
      dependencies.add(identity);
      return true;
    }
    const operation = functionId(node);
    const keys = argumentKeys(node);
    if (operation === 'fg.cnd') {
      const selected = predicate(keys[0] ?? '');
      if (selected === undefined) return false;
      return visit(keys[selected ? 1 : 2] ?? '');
    }
    return keys.every((argument) => visit(argument));
  };
  return visit(rootKey) ? [...dependencies] : undefined;
};

export function usedSymbolIds(
  nodes: readonly FormulaNode[],
  rootKey: string,
  values: ReadonlyMap<string, number>,
): readonly string[] | undefined {
  return usedDependencies(
    nodes,
    rootKey,
    (node) => symbolId(node),
    (node) => {
      const id = symbolId(node);
      return id === undefined ? undefined : values.get(id);
    },
  );
}

export function usedReferenceNames(
  nodes: readonly FormulaNode[],
  rootKey: string,
  values: ReadonlyMap<string, number>,
): readonly string[] | undefined {
  return usedDependencies(
    nodes,
    rootKey,
    (node) => reference(node).name,
    (node) => {
      const name = reference(node).name;
      return name === undefined ? undefined : values.get(name);
    },
  );
}

export function branchLabel(
  nodes: readonly FormulaNode[],
  glyphs: ReadonlyMap<string, string>,
  key: string,
): string | undefined {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const walk = (nodeKey: string): string | undefined => {
    const node = byKey.get(nodeKey);
    if (!node?.mode) return undefined;
    if (node.mode === 'LITERAL') {
      const draft = node.draft;
      return String(draft ?? literalNumber(node) ?? '');
    }
    if (node.mode === 'SYMBOL') {
      const ref = reference(node);
      if (ref.kind === 'output' && ref.call && ref.output) {
        return `${ref.call}.${ref.output}`;
      }
      const name = ref.name ?? ref.output;
      return name ? (glyphs.get(name) ?? name) : undefined;
    }
    if (node.mode === 'GIVEN_PARAMETER') {
      return typeof node.parameter === 'string'
        ? (glyphs.get(node.parameter) ?? node.parameter)
        : undefined;
    }
    const operation = functionId(node);
    const keys = argumentKeys(node);
    const rendered = keys.map((argument) => walk(argument));
    if (rendered.some((item) => item === undefined)) return undefined;
    const text = rendered as string[];
    if (operation === 'fg.cnd') {
      return `(${text[1]} if ${text[0]} else ${text[2]})`;
    }
    if (operation === 'fg.and' || operation === 'fg.or') {
      return `(${text.join(operation === 'fg.and' ? ' and ' : ' or ')})`;
    }
    const comparison = {
      'fg.lt': '<',
      'fg.le': '<=',
      'fg.gt': '>',
      'fg.ge': '>=',
      'fg.eq': '==',
      'fg.ne': '!=',
    }[operation ?? ''];
    if (comparison) return `${text[0]} ${comparison} ${text[1]}`;
    if (operation === 'fg.uminus') return `-${text[0]}`;
    const operator = {
      'fg.add': '+',
      'fg.subtract': '-',
      'fg.multiply': '*',
      'fg.divide': '/',
      'fg.pow': '^',
    }[operation ?? ''];
    if (operator) return `(${text[0]} ${operator} ${text[1]})`;
    return `${operation}(${text.join(', ')})`;
  };
  return walk(key);
}
