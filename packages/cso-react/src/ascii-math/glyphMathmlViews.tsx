/**
 * MathML views for the parsed ASCII glyph AST.
 *
 * FormulaSheet uses this path for symbol names and units only. Formula
 * structure itself is rendered from sheet value-tree nodes in `src/mathml`.
 */
import type { MathMathMLAttributes } from '../mathml/attributes.ts';
import { MATHML_FONT_SIZE } from '../mathml/constants.ts';
import type { ReactElement } from 'react';
import type {
  AsciiGlyph,
  AsciiGlyphDivision,
  AsciiGlyphGroup,
  AsciiGlyphItem,
  AsciiGlyphPrimitive,
  AsciiGlyphSubSup,
} from './glyph/types.ts';

interface AsciiGlyphMathmlViewProps extends MathMathMLAttributes {
  readonly glyph: AsciiGlyph;
}

interface GlyphDivisionMathmlViewProps extends MathMathMLAttributes {
  readonly glyphDivision: AsciiGlyphDivision;
}

interface GlyphGroupMathmlViewProps extends MathMathMLAttributes {
  readonly glyphGroup: AsciiGlyphGroup;
}

interface GlyphItemMathmlViewProps extends MathMathMLAttributes {
  readonly glyphItem: AsciiGlyphItem;
}

interface GlyphPrimitiveMathmlViewProps extends MathMathMLAttributes {
  readonly glyphPrimitive: AsciiGlyphPrimitive;
}

interface GlyphSubSupMathmlViewProps extends MathMathMLAttributes {
  readonly glyphSubSup: AsciiGlyphSubSup;
}

const assertNever = (value: never): never => {
  throw new Error(`Unhandled ASCII glyph node: ${JSON.stringify(value)}`);
};

export const AsciiGlyphMathmlView = ({
  glyph,
  ...mathProps
}: AsciiGlyphMathmlViewProps): ReactElement => {
  return (
    <mrow {...mathProps}>
      {glyph.map((glyphItem, index) => (
        <AsciiGlyphItemMathmlView
          key={`${glyphItem.__typename}-${index}`}
          glyphItem={glyphItem}
        />
      ))}
    </mrow>
  );
};

const AsciiGlyphItemMathmlView = ({
  glyphItem,
  ...mathProps
}: GlyphItemMathmlViewProps): ReactElement => {
  switch (glyphItem.__typename) {
    case 'AsciiGlyphSubSup':
      return (
        <AsciiGlyphSubSupMathmlView glyphSubSup={glyphItem} {...mathProps} />
      );
    case 'AsciiGlyphDivision':
      return (
        <AsciiGlyphDivisionMathmlView
          glyphDivision={glyphItem}
          {...mathProps}
        />
      );
    default:
      return assertNever(glyphItem);
  }
};

const AsciiGlyphDivisionMathmlView = ({
  glyphDivision,
  ...mathProps
}: GlyphDivisionMathmlViewProps): ReactElement => {
  return (
    <mfrac {...mathProps}>
      <mstyle style={{ fontSize: MATHML_FONT_SIZE }}>
        <AsciiGlyphSubSupMathmlView glyphSubSup={glyphDivision.numerator} />
      </mstyle>
      <mstyle style={{ fontSize: MATHML_FONT_SIZE }}>
        <AsciiGlyphSubSupMathmlView glyphSubSup={glyphDivision.denominator} />
      </mstyle>
    </mfrac>
  );
};

const AsciiGlyphSubSupMathmlView = ({
  glyphSubSup,
  ...mathProps
}: GlyphSubSupMathmlViewProps): ReactElement => {
  if (glyphSubSup.subscript && glyphSubSup.superscript) {
    return (
      <msubsup {...mathProps}>
        <AsciiGlyphPrimitiveMathmlView glyphPrimitive={glyphSubSup.base} />
        <AsciiGlyphPrimitiveMathmlView glyphPrimitive={glyphSubSup.subscript} />
        <AsciiGlyphPrimitiveMathmlView
          glyphPrimitive={glyphSubSup.superscript}
        />
      </msubsup>
    );
  }

  if (glyphSubSup.subscript && !glyphSubSup.superscript) {
    return (
      <msub {...mathProps}>
        <AsciiGlyphPrimitiveMathmlView glyphPrimitive={glyphSubSup.base} />
        <AsciiGlyphPrimitiveMathmlView glyphPrimitive={glyphSubSup.subscript} />
      </msub>
    );
  }

  if (!glyphSubSup.subscript && glyphSubSup.superscript) {
    return (
      <msup {...mathProps}>
        <AsciiGlyphPrimitiveMathmlView glyphPrimitive={glyphSubSup.base} />
        <AsciiGlyphPrimitiveMathmlView
          glyphPrimitive={glyphSubSup.superscript}
        />
      </msup>
    );
  }

  return (
    <mrow {...mathProps}>
      <AsciiGlyphPrimitiveMathmlView glyphPrimitive={glyphSubSup.base} />
    </mrow>
  );
};

const AsciiGlyphPrimitiveMathmlView = ({
  glyphPrimitive,
  ...mathProps
}: GlyphPrimitiveMathmlViewProps): ReactElement => {
  switch (glyphPrimitive.__typename) {
    case 'AsciiGlyphGroup':
      return (
        <AsciiGlyphGroupMathmlView glyphGroup={glyphPrimitive} {...mathProps} />
      );
    case 'AsciiGlyphV':
      return <mi {...mathProps}>{glyphPrimitive.value}</mi>;
    default:
      return assertNever(glyphPrimitive);
  }
};

const AsciiGlyphGroupMathmlView = ({
  glyphGroup,
  ...mathProps
}: GlyphGroupMathmlViewProps): ReactElement => {
  return (
    <mrow {...mathProps}>
      {glyphGroup.lb && <mo fence="true">{glyphGroup.lb}</mo>}
      {glyphGroup.items.map((groupItem, index) => (
        <AsciiGlyphItemMathmlView
          key={`${groupItem.__typename}-${index}`}
          glyphItem={groupItem}
        />
      ))}
      {glyphGroup.rb && <mo fence="true">{glyphGroup.rb}</mo>}
    </mrow>
  );
};
