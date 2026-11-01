import {
  type CalculationSourceSymbol,
  type CalculationSourceValueNode,
  type ExecutionPayload,
  scopedGlyph,
} from '@cs-object/core';

type MethodRecord = NonNullable<ExecutionPayload['methods']>[number];
type HelperRecord = MethodRecord['helpers'][number];
type Owner = MethodRecord | HelperRecord;
type Quantity = MethodRecord['quantities'][number];
type FormulaNode = Quantity['nodes'][number];
type Content = MethodRecord['content'][number];

const notationId = (...parts: string[]): string => JSON.stringify(parts);

const emptyTree: CalculationSourceSymbol['valueTree'] = {
  rootKey: 'value',
  nodes: [{ key: 'value', mode: 'LITERAL', literal: { kind: 'empty' } }],
};

const reachableNodes = (
  nodes: readonly FormulaNode[],
  rootKey: string,
): FormulaNode[] => {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const seen = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    for (const argument of byKey.get(key)?.funcArgs ?? []) visit(argument.key);
  };
  visit(rootKey);
  return nodes.filter((node) => seen.has(node.key));
};

const calls = (
  content: readonly Content[],
): Extract<Content, { kind: 'call' }>[] =>
  content.flatMap((item) =>
    item.kind === 'call'
      ? [item]
      : item.kind === 'section'
        ? calls(item.content)
        : [],
  );

const isInput = (quantity: Quantity): boolean =>
  quantity.nodes.length === 0 || quantity.nodes[0]?.mode === 'GIVEN_PARAMETER';

/**
 * Method explanations as calculation-source symbols, so method formulas,
 * predicates and branch notes reuse the ordinary formula notation.
 */
export const methodNotation = (
  method: MethodRecord,
  fail: (message: string) => never,
) => {
  const symbols = new Map<string, CalculationSourceSymbol>();
  const helpers = new Map<string, HelperRecord>();
  const indexHelpers = (records: readonly HelperRecord[]): void => {
    for (const helper of records) {
      helpers.set(helper.id, helper);
      indexHelpers(helper.helpers);
    }
  };
  indexHelpers(method.helpers);

  // A branch, its test and its quantity legitimately share one glyph.
  const add = (symbol: CalculationSourceSymbol): string => {
    symbols.set(symbol.id, { ...symbol, notationScope: symbol.id });
    return symbol.id;
  };
  const quantitySymbolId = (owner: Owner, variableName: string): string =>
    notationId(owner.id, variableName);
  const callHelper = (owner: Owner, binding: string): HelperRecord => {
    const call = calls(owner.content).find((item) => item.binding === binding);
    return (
      helpers.get(call?.helperId ?? '') ??
      fail(`Call '${binding}' has no helper in '${owner.id}'`)
    );
  };
  const outputSymbolId = (owner: Owner, binding: string, output: string) => {
    const id = notationId(owner.id, binding, 'output', output);
    if (symbols.has(id)) return id;
    const quantity =
      callHelper(owner, binding).quantities.find(
        (candidate) =>
          candidate.role === 'output' && candidate.selectionName === output,
      ) ?? fail(`Call '${binding}' has no output '${output}'`);
    return add({
      id,
      glyph: scopedGlyph(quantity.glyph, binding),
      description: quantity.description,
      ...(quantity.unit ? { unit: quantity.unit } : {}),
      valueTree: emptyTree,
    });
  };
  const referencedId = (owner: Owner, node: FormulaNode): string => {
    if (node.mode === 'GIVEN_PARAMETER') {
      const quantity =
        owner.quantities.find(
          (candidate) =>
            candidate.nodes[0]?.mode === 'GIVEN_PARAMETER' &&
            candidate.nodes[0].parameter === node.parameter,
        ) ?? fail(`Given parameter '${node.parameter}' has no quantity`);
      return quantitySymbolId(owner, quantity.variableName);
    }
    if (node.ref?.kind === 'output') {
      return outputSymbolId(owner, node.ref.call ?? '', node.ref.output ?? '');
    }
    const name = node.ref?.name ?? '';
    if (!owner.quantities.some((quantity) => quantity.variableName === name)) {
      fail(`Formula name '${name}' has no quantity in '${owner.id}'`);
    }
    return quantitySymbolId(owner, name);
  };
  const tree = (
    owner: Owner,
    nodes: readonly FormulaNode[],
    rootKey = nodes[0]?.key ?? fail('Empty formula'),
  ): CalculationSourceSymbol['valueTree'] => ({
    rootKey,
    nodes: reachableNodes(nodes, rootKey).map(
      (node): CalculationSourceValueNode => {
        const draft = node.draft === undefined ? {} : { draft: node.draft };
        if (node.mode === 'LITERAL') {
          const literal =
            node.literal ?? fail(`Literal '${node.key}' has no value`);
          return {
            key: node.key,
            mode: 'LITERAL',
            ...draft,
            literal: {
              kind: 'number',
              value: literal.value,
              numericKind: literal.numericKind,
            },
          };
        }
        if (node.mode === 'FUNCTION') {
          return {
            key: node.key,
            mode: 'FUNCTION',
            ...draft,
            funcSpec: node.funcSpec ?? fail(`'${node.key}' has no function`),
            funcArgs: node.funcArgs ?? [],
          };
        }
        return {
          key: node.key,
          mode: 'SYMBOL',
          ...draft,
          symbol: { id: referencedId(owner, node) },
        };
      },
    ),
  });

  const ownerQuantity = (owner: Owner, variableName: string): Quantity =>
    owner.quantities.find(
      (quantity) => quantity.variableName === variableName,
    ) ?? fail(`Quantity '${variableName}' is missing from '${owner.id}'`);
  const symbolFor = (
    id: string,
    quantity: Quantity,
    valueTree: CalculationSourceSymbol['valueTree'],
    glyph = quantity.glyph,
  ): CalculationSourceSymbol => ({
    id,
    glyph,
    description: quantity.description,
    ...(quantity.unit ? { unit: quantity.unit } : {}),
    valueTree,
  });

  const owners: Owner[] = [method, ...helpers.values()];
  for (const owner of owners) {
    for (const quantity of owner.quantities) {
      add(
        symbolFor(
          quantitySymbolId(owner, quantity.variableName),
          quantity,
          isInput(quantity) ? emptyTree : tree(owner, quantity.nodes),
        ),
      );
    }
  }
  for (const owner of owners) {
    for (const call of calls(owner.content)) {
      const helper = callHelper(owner, call.binding);
      for (const input of call.inputs) {
        const parameter = ownerQuantity(helper, input.name);
        add(
          symbolFor(
            notationId(owner.id, call.binding, 'input', input.name),
            parameter,
            tree(owner, input.nodes),
            scopedGlyph(parameter.glyph, call.binding),
          ),
        );
      }
    }
    for (const condition of [
      ...(owner.checks ?? []),
      ...(owner.applicability ?? []),
    ]) {
      const targetName = condition.targets[0] ?? '';
      const target =
        owner.quantities.find(
          (quantity) =>
            quantity.variableName === targetName ||
            quantity.selectionName === targetName,
        ) ?? fail(`Condition '${condition.id}' has no target quantity`);
      add(
        symbolFor(
          notationId(owner.id, 'condition', condition.id),
          target,
          tree(owner, condition.nodes),
        ),
      );
    }
  }

  return {
    quantityId: (owner: Owner, variableName: string): string =>
      quantitySymbolId(owner, variableName),
    callInputId: (owner: Owner, binding: string, name: string): string =>
      notationId(owner.id, binding, 'input', name),
    conditionId: (owner: Owner, id: string): string =>
      notationId(owner.id, 'condition', id),
    /** The branch a conditional chose and the test that chose it. */
    branch: (
      owner: Owner,
      variableName: string,
      nodeKey: string,
      chosenKey: string,
    ) => {
      const quantity = ownerQuantity(owner, variableName);
      const conditional =
        quantity.nodes.find((node) => node.key === nodeKey) ??
        fail(`Conditional '${nodeKey}' is missing from '${variableName}'`);
      const test = conditional.funcArgs?.[0];
      if (!test) fail(`Conditional '${nodeKey}' is incomplete`);
      const base = quantitySymbolId(owner, variableName);
      return {
        quantitySymbolId: base,
        branchSymbolId: add(
          symbolFor(
            notationId(owner.id, variableName, nodeKey, 'branch', chosenKey),
            quantity,
            tree(owner, quantity.nodes, chosenKey),
          ),
        ),
        conditionSymbolId: add(
          symbolFor(
            notationId(owner.id, variableName, nodeKey, 'condition'),
            quantity,
            tree(owner, quantity.nodes, test.key),
          ),
        ),
      };
    },
    symbols: (): CalculationSourceSymbol[] => [...symbols.values()],
  };
};
