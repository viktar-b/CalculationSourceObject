import { parseNotation } from '@cs-object/core';
import type { MathMathMLAttributes } from '../mathml/attributes.ts';
import type { ReactElement } from 'react';
import { NotationMathmlView } from './NotationMathmlView.tsx';

interface AsciiMathViewProps extends MathMathMLAttributes {
  readonly expression: string;
  readonly identifierMathVariant?: 'normal';
  readonly optional?: boolean;
}

export const AsciiMathView = ({
  expression,
  identifierMathVariant,
  optional,
  ...mathProps
}: AsciiMathViewProps): ReactElement => {
  const parsed = parseNotation(expression);

  if (!parsed.ok) {
    return (
      <mi mathcolor="red" {...mathProps}>
        {optional && expression.length === 0 ? '' : '?'}
      </mi>
    );
  }

  return (
    <NotationMathmlView
      expression={parsed.value}
      identifierMathVariant={identifierMathVariant}
      {...mathProps}
    />
  );
};
