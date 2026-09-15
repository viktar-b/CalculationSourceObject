import { assertNever } from '@cs-object/core';
import type { NotationExpression, NotationNode } from '@cs-object/core';
import type { ReactElement } from 'react';
import type { MathMathMLAttributes } from '../mathml/attributes.ts';
import { MATHML_FONT_SIZE } from '../mathml/constants.ts';

interface NotationRenderOptions {
  readonly identifierMathVariant?: 'normal';
}

interface NotationMathmlViewProps
  extends MathMathMLAttributes,
    NotationRenderOptions {
  readonly expression: NotationExpression;
}

interface NotationNodeMathmlViewProps extends NotationRenderOptions {
  readonly node: NotationNode;
}

type NotationGroup = Extract<NotationNode, { readonly kind: 'group' }>;

const fenceCharacters = {
  round: ['(', ')'],
  square: ['[', ']'],
} as const;

const flattenTransparentGroups = (
  expression: NotationExpression,
): readonly NotationNode[] =>
  expression.flatMap((node) =>
    node.kind === 'group' && node.fence === 'none'
      ? flattenTransparentGroups(node.body)
      : [node],
  );

export const NotationMathmlView = ({
  expression,
  identifierMathVariant,
  ...mathProps
}: NotationMathmlViewProps): ReactElement => (
  <mrow {...mathProps}>
    {flattenTransparentGroups(expression).map((node, index) => (
      <NotationNodeMathmlView
        key={`${node.kind}-${index}`}
        node={node}
        identifierMathVariant={identifierMathVariant}
      />
    ))}
  </mrow>
);

const NotationGroupMathmlView = ({
  group,
  identifierMathVariant,
}: NotationRenderOptions & { readonly group: NotationGroup }): ReactElement => {
  if (group.fence === 'none') {
    const nodes = flattenTransparentGroups(group.body);
    const onlyNode = nodes[0];
    if (nodes.length === 1 && onlyNode !== undefined) {
      return (
        <NotationNodeMathmlView
          node={onlyNode}
          identifierMathVariant={identifierMathVariant}
        />
      );
    }
    return (
      <NotationMathmlView
        expression={group.body}
        identifierMathVariant={identifierMathVariant}
      />
    );
  }

  const [opening, closing] = fenceCharacters[group.fence];
  return (
    <mrow>
      <mo fence="true">{opening}</mo>
      <NotationMathmlView
        expression={group.body}
        identifierMathVariant={identifierMathVariant}
      />
      <mo fence="true">{closing}</mo>
    </mrow>
  );
};

const NotationNodeMathmlView = ({
  node,
  identifierMathVariant,
}: NotationNodeMathmlViewProps): ReactElement => {
  const renderNode = (child: NotationNode): ReactElement => (
    <NotationNodeMathmlView
      node={child}
      identifierMathVariant={identifierMathVariant}
    />
  );

  switch (node.kind) {
    case 'identifier':
      return <mi mathvariant={identifierMathVariant}>{node.value}</mi>;
    case 'number':
      return <mn>{node.value}</mn>;
    case 'operator':
      return <mo>{node.value}</mo>;
    case 'text':
      return <mtext>{node.value}</mtext>;
    case 'group':
      return (
        <NotationGroupMathmlView
          group={node}
          identifierMathVariant={identifierMathVariant}
        />
      );
    case 'fraction':
      return (
        <mfrac>
          <mstyle style={{ fontSize: MATHML_FONT_SIZE }}>
            {renderNode(node.numerator)}
          </mstyle>
          <mstyle style={{ fontSize: MATHML_FONT_SIZE }}>
            {renderNode(node.denominator)}
          </mstyle>
        </mfrac>
      );
    case 'subscript':
      return (
        <msub>
          {renderNode(node.base)}
          {renderNode(node.subscript)}
        </msub>
      );
    case 'superscript':
      return (
        <msup>
          {renderNode(node.base)}
          {renderNode(node.superscript)}
        </msup>
      );
    case 'subsup':
      return (
        <msubsup>
          {renderNode(node.base)}
          {renderNode(node.subscript)}
          {renderNode(node.superscript)}
        </msubsup>
      );
    default:
      return assertNever(node);
  }
};
