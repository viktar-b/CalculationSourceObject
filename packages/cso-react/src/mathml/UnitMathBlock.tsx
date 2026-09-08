import { AsciiMathView } from '../ascii-math/AsciiMathView.tsx';
import type { MathMathMLAttributes } from './attributes.ts';
import { defaultMathBlockProps } from './props.ts';
import type { ReactElement } from 'react';

interface IProps {
  readonly unit: string;
  readonly mathProps?: MathMathMLAttributes;
  readonly optional?: boolean;
}

export const UnitMathBlock = ({
  unit,
  mathProps,
  optional,
}: IProps): ReactElement => (
  <math {...defaultMathBlockProps} {...mathProps}>
    <AsciiMathView expression={unit} optional={optional} />
  </math>
);
