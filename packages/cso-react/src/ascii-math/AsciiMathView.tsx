import type { MathMathMLAttributes } from '../mathml/attributes.ts';
import type { ReactElement } from 'react';
import { glyphFromAsciiMathString } from './glyph/fromAsciiMathString.ts';
import { AsciiGlyphMathmlView } from './glyphMathmlViews.tsx';

interface AsciiMathViewProps extends MathMathMLAttributes {
  readonly expression: string;
  readonly optional?: boolean;
}

export const AsciiMathView = ({
  expression,
  optional,
  ...mathProps
}: AsciiMathViewProps): ReactElement => {
  if (!expression) {
    return (
      <mi mathcolor="red" {...mathProps}>
        {optional ? '' : '?'}
      </mi>
    );
  }

  try {
    return (
      <AsciiGlyphMathmlView
        glyph={glyphFromAsciiMathString(expression)}
        {...mathProps}
      />
    );
  } catch {
    return (
      <mi mathcolor="red" {...mathProps}>
        {optional ? '' : '?'}
      </mi>
    );
  }
};
