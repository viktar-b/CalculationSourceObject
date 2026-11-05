import { formatNumerical, type NumericKind } from '@cs-object/core';
import type { ReactNode } from 'react';

/** Display formatting only; the captured number and its kind remain unchanged. */
export const NumericalValue = ({
  value,
  numericKind,
}: {
  value: number;
  numericKind?: NumericKind;
}): ReactNode => {
  const formatted = Object.is(value, -0)
    ? '-0'
    : numericKind === 'int'
      ? String(value)
      : formatNumerical(value);
  const text = formatted.startsWith('(') ? formatted.slice(1, -1) : formatted;
  const scientific = /^(-?[\d.]+)e([+-]?\d+)$/u.exec(text);
  return scientific ? (
    <math style={{ fontSize: 'inherit', fontFamily: 'inherit' }}>
      <mrow>
        <mn>{scientific[1]}</mn>
        <mo>×</mo>
        <msup>
          <mn>10</mn>
          <mn>{String(Number(scientific[2]))}</mn>
        </msup>
      </mrow>
    </math>
  ) : (
    formatted
  );
};
