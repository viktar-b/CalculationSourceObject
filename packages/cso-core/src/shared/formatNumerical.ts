export const formatNumerical = (value: number): string => {
  if (Number.isNaN(value)) {
    return ' NaN';
  }

  const valueAbs = Math.abs(value);
  if (valueAbs >= 1000000) {
    return `(${value.toExponential(3)})`;
  }

  if (valueAbs >= 100000) {
    return Math.round(value).toString();
  }

  if (valueAbs >= 10000) {
    return value.toFixed(1);
  }

  if (valueAbs >= 1) {
    return value.toFixed(2);
  }

  if (valueAbs >= 0.00001) {
    return value.toFixed(5);
  }

  if (valueAbs > 0) {
    return `(${value.toExponential(1)})`;
  }

  return value.toString();
};
