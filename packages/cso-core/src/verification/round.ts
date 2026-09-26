import type { NumericKind } from '../contracts/numbers.ts';

const nearestEven = (numerator: bigint, denominator: bigint): bigint => {
  const quotient = numerator / denominator;
  const twiceRemainder = (numerator % denominator) * BigInt(2);
  return (
    quotient +
    (twiceRemainder > denominator ||
    (twiceRemainder === denominator && quotient % BigInt(2) !== BigInt(0))
      ? BigInt(1)
      : BigInt(0))
  );
};

/** Round the exact binary64 value, avoiding a preliminary floating-point decimal scale. */
export function roundToDigits(
  value: number,
  digits: number,
  kind?: NumericKind,
): number {
  const negative = value < 0 || Object.is(value, -0);
  const magnitude = Math.abs(value);
  if (kind === 'int') {
    if (digits >= 0) return value === 0 ? 0 : value;
    if (digits < -16) return 0;
    const scale = BigInt(10) ** BigInt(-digits);
    const rounded = Number(nearestEven(BigInt(magnitude), scale) * scale);
    return rounded === 0 ? 0 : negative ? -rounded : rounded;
  }
  if (digits > 323 || value === 0) return value;
  if (digits < -308) return negative ? -0 : 0;

  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat64(0, magnitude);
  const bits = buffer.getBigUint64(0);
  const exponent = Number((bits >> BigInt(52)) & BigInt(0x7ff));
  const fraction = bits & ((BigInt(1) << BigInt(52)) - BigInt(1));
  const significand =
    exponent === 0 ? fraction : fraction + (BigInt(1) << BigInt(52));
  const binaryExponent = exponent === 0 ? -1074 : exponent - 1075;
  let numerator = significand;
  let denominator = BigInt(1);
  if (binaryExponent >= 0) numerator <<= BigInt(binaryExponent);
  else denominator <<= BigInt(-binaryExponent);
  if (digits >= 0) numerator *= BigInt(10) ** BigInt(digits);
  else denominator *= BigInt(10) ** BigInt(-digits);
  const rounded = nearestEven(numerator, denominator);
  return Number(`${negative ? '-' : ''}${rounded}e${-digits}`);
}
