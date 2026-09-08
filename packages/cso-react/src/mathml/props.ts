import type { MathMathMLAttributes } from './attributes.ts';
import { MATHML_FONT_SIZE } from './constants.ts';

export const defaultMathBlockProps: MathMathMLAttributes = {
  style: {
    // fontFamily: 'Latin Modern Math',
    fontSize: MATHML_FONT_SIZE,
    display: 'inline-flex',
    flexWrap: 'wrap',
    rowGap: '15px',
    borderWidth: '0px',
    borderColor: '#FFFFFF',
    mathStyle: 'normal',
  },
};
