/**
 * Recursive value-tree to MathML renderer.
 *
 * This is the one place where SheetValueTree nodes are walked. It renders
 * literals, symbol references, binary operators, grouped function calls, and
 * special MathML structures using the concrete leaf components in this folder.
 */
import { renderSpecialValueFunction } from '../function-renderers.tsx';
import {
  getFunctionBinaryOperatorById,
  getFunctionSpec,
} from '@cs-object/core';
import {
  emptyLiteral,
  isSheetLiteralEmpty,
} from '@cs-object/core';
import {
  getSymbolById,
  getValueNodeByKey,
  getValueNodeByKeyOrUndefined,
} from '@cs-object/core';
import type {
  SheetDocument,
  SheetValueNode,
  SheetValueTree,
} from '@cs-object/core';
import type { ReactElement } from 'react';
import {
  SymbolValueBinaryOperatorMathmlView,
  SymbolValueDraftMathmlView,
  SymbolValueGlyphMathmlView,
  SymbolValueGroupMathmlView,
  SymbolValueLiteralMathmlView,
  SymbolValueRootMathmlView,
} from './components.tsx';

export interface SymbolValueViewOptions {
  readonly literalsAsDrafts?: boolean;
  readonly numerical?: boolean;
}

interface ValueTreeMathmlRendererProps {
  readonly sheet: SheetDocument;
  readonly valueTree: SheetValueTree;
  readonly viewOptions: SymbolValueViewOptions;
  readonly noRootContainer?: boolean;
}

interface ValueTreeNodeMathmlViewProps {
  readonly sheet: SheetDocument;
  readonly valueTree: SheetValueTree;
  readonly node: SheetValueNode;
  readonly viewOptions: SymbolValueViewOptions;
}

export const ValueTreeMathmlRenderer = ({
  sheet,
  valueTree,
  viewOptions,
  noRootContainer,
}: ValueTreeMathmlRendererProps): ReactElement => {
  const rootNode = getValueNodeByKeyOrUndefined(valueTree, valueTree.rootKey);

  if (!rootNode) {
    return <>{'Empty Value'}</>;
  }

  const rootValue = (
    <ValueTreeNodeMathmlView
      sheet={sheet}
      valueTree={valueTree}
      node={rootNode}
      viewOptions={viewOptions}
    />
  );

  return noRootContainer ? (
    rootValue
  ) : (
    <SymbolValueRootMathmlView>{rootValue}</SymbolValueRootMathmlView>
  );
};

const ValueTreeNodeMathmlView = ({
  sheet,
  valueTree,
  node,
  viewOptions,
}: ValueTreeNodeMathmlViewProps): ReactElement => {
  if (node.kind === 'literal') {
    if (
      (viewOptions.literalsAsDrafts || isSheetLiteralEmpty(node.value)) &&
      (node.draft ?? '').length > 0
    ) {
      return <SymbolValueDraftMathmlView draft={node.draft ?? ''} />;
    }
    return <SymbolValueLiteralMathmlView literal={node.value} />;
  }

  if (node.kind === 'symbol') {
    const nodeSymbol = getSymbolById(sheet, node.symbolId);
    if (!viewOptions.numerical) {
      return <SymbolValueGlyphMathmlView glyph={nodeSymbol?.glyph || ''} />;
    }

    return (
      <SymbolValueLiteralMathmlView
        literal={nodeSymbol?.valueTree.result ?? emptyLiteral()}
      />
    );
  }

  if (node.kind === 'function') {
    return (
      <ValueTreeFunctionMathmlView
        sheet={sheet}
        valueTree={valueTree}
        node={node}
        viewOptions={viewOptions}
      />
    );
  }

  return <>{'Error (Unknown value-tree node)'}</>;
};

const ValueTreeFunctionMathmlView = ({
  sheet,
  valueTree,
  node,
  viewOptions,
}: ValueTreeNodeMathmlViewProps): ReactElement => {
  if (node.kind !== 'function') {
    return <>{'Error (Expected function value-tree node)'}</>;
  }

  const argNodes = node.argKeys.map((argKey) =>
    getValueNodeByKey(valueTree, argKey),
  );
  const argReactNodes = argNodes.map((argNode) => (
    <ValueTreeNodeMathmlView
      key={argNode.key}
      sheet={sheet}
      valueTree={valueTree}
      node={argNode}
      viewOptions={viewOptions}
    />
  ));

  const specialFunction = renderSpecialValueFunction({
    functionId: node.functionId,
    argReactNodes,
  });
  if (specialFunction) {
    return specialFunction;
  }

  const operator = getFunctionBinaryOperatorById(node.functionId);
  if (operator && argNodes.length === 2) {
    const [argOperatorLeft, argOperatorRight] = argNodes.map((argNode) =>
      argNode.kind === 'function'
        ? getFunctionBinaryOperatorById(argNode.functionId)
        : undefined,
    );

    const implicitParenthesisLeft =
      argOperatorLeft && argOperatorLeft.priority < operator.priority;
    const implicitParenthesisRight =
      argOperatorRight && argOperatorRight.priority <= operator.priority;

    const argLeft = implicitParenthesisLeft ? (
      <SymbolValueGroupMathmlView cursor={undefined}>
        {[argReactNodes[0]]}
      </SymbolValueGroupMathmlView>
    ) : (
      argReactNodes[0]
    );
    const argRight = implicitParenthesisRight ? (
      <SymbolValueGroupMathmlView cursor={undefined}>
        {[argReactNodes[1]]}
      </SymbolValueGroupMathmlView>
    ) : (
      argReactNodes[1]
    );

    return (
      <SymbolValueBinaryOperatorMathmlView
        operator={operator}
        argLeft={argLeft}
        argRight={argRight}
      />
    );
  }

  const nodeFunction = getFunctionSpec(node.functionId);
  const functionNameGlyph = nodeFunction?.glyph || '';
  const groupPrefix =
    node.functionId === 'fg.noop' ? (
      ''
    ) : node.functionId === 'fg.stub' ? (
      <SymbolValueDraftMathmlView draft="" />
    ) : (
      <SymbolValueGlyphMathmlView glyph={functionNameGlyph} />
    );

  return (
    <SymbolValueGroupMathmlView prefix={groupPrefix} cursor={undefined}>
      {node.argKeys
        .map((key) => getValueNodeByKey(valueTree, key))
        .map((argNode) => (
          <ValueTreeNodeMathmlView
            key={`${argNode.key}`}
            sheet={sheet}
            valueTree={valueTree}
            node={argNode}
            viewOptions={viewOptions}
          />
        ))}
    </SymbolValueGroupMathmlView>
  );
};
