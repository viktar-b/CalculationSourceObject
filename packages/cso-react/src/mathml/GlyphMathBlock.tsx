import { AsciiMathView } from '../ascii-math/AsciiMathView.tsx';
import type { MathMathMLAttributes } from './attributes.ts';
import { defaultMathBlockProps } from './props.ts';
import type { ReactElement } from 'react';

interface IProps extends MathMathMLAttributes {
  readonly glyph: string;
  readonly mathProps?: MathMathMLAttributes;
}

export const GlyphMathBlock = ({
  glyph,
  mathProps,
  ...props
}: IProps): ReactElement => {
  return (
    <math {...defaultMathBlockProps} {...mathProps}>
      <AsciiMathView expression={glyph} {...props} />
    </math>
  );
};
