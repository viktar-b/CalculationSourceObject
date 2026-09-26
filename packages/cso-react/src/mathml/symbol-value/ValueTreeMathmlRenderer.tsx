/**
 * Recursive value-tree to MathML renderer.
 *
 * This is the one place where SheetValueTree nodes are walked. It renders
 * literals, symbol references, binary operators, grouped function calls, and
 * special MathML structures using the concrete leaf components in this folder.
 */

import type {
  SheetDocument,
  SheetValueNode,
  SheetValueTree,
} from '@cs-object/core';
import {
  emptyLiteral,
  getFunctionBinaryOperatorById,
  getFunctionSpec,
  getSymbolById,
  getValueNodeByKey,
  getValueNodeByKeyOrUndefined,
  isSheetLiteralEmpty,
} from '@cs-object/core';
import type { ReactElement } from 'react';
import { requiresExplicitOperandGroup } from './operand-grouping.ts';
import { displayedLiteralDraft } from './literal-display.ts';
import { renderSpecialValueFunction } from '../function-renderers.tsx';
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
    const draft = displayedLiteralDraft({
      node,
      literalsAsDrafts: viewOptions.literalsAsDrafts,
    });
    if (draft !== undefined) {
      return <SymbolValueDraftMathmlView draft={draft} />;
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
  const argReactNodes = argNodes.map((argNode, index) => {
    const rendered = (
      <ValueTreeNodeMathmlView
        key={argNode.key}
        sheet={sheet}
        valueTree={valueTree}
        node={argNode}
        viewOptions={viewOptions}
      />
    );
    const grouped = requiresExplicitOperandGroup({
      sheet,
      node: argNode,
      numerical: Boolean(viewOptions.numerical),
      literalsAsDrafts: Boolean(viewOptions.literalsAsDrafts),
      parentFunctionId: node.functionId,
      argumentIndex: index,
    });
    return grouped ? (
      <SymbolValueGroupMathmlView key={argNode.key} cursor={undefined}>
        {[rendered]}
      </SymbolValueGroupMathmlView>
    ) : (
      rendered
    );
  });

  const specialFunction = renderSpecialValueFunction({
    functionId: node.functionId,
    argReactNodes,
  });
  if (specialFunction) {
    return specialFunction;
  }

  const operator = getFunctionBinaryOperatorById(node.functionId);
  if (
    operator &&
    argNodes.length > 2 &&
    (node.functionId === 'fg.and' || node.functionId === 'fg.or')
  ) {
    return (
      <mrow>
        {argReactNodes.map((argument, index) => {
          const child = argNodes[index];
          const childOperator =
            child.kind === 'function'
              ? getFunctionBinaryOperatorById(child.functionId)
              : undefined;
          const grouped =
            childOperator !== undefined &&
            childOperator.priority < operator.priority;
          return (
            <mrow key={child.key}>
              {index > 0 && (
                <mo form="infix" lspace="0.3em" rspace="0.3em">
                  {operator.glyph}
                </mo>
              )}
              {grouped ? (
                <SymbolValueGroupMathmlView cursor={undefined}>
                  {[argument]}
                </SymbolValueGroupMathmlView>
              ) : (
                argument
              )}
            </mrow>
          );
        })}
      </mrow>
    );
  }
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
    <SymbolValueGroupMathmlView
      prefix={groupPrefix}
      cursor={undefined}
      empty={
        node.functionId === 'fg.pi' ||
        node.functionId === 'fg.noop' ||
        node.functionId === 'fg.stub'
          ? 'omit'
          : 'fence'
      }
    >
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
