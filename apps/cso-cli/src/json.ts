// Serialize JSON data without changing IEEE-754 negative zero. Python parses
// JSON -0 as the integer 0, so the transport must use the floating spelling -0.0.
// Callers supply parsed inputs, schema-validated reports or a validated CSO.
export function stringifyJson(value: unknown): string {
  const ancestors = new Set<object>();
  const encode = (item: unknown): string | undefined => {
    if (Object.is(item, -0)) {
      return '-0.0';
    }
    if (item === null || typeof item !== 'object') {
      return JSON.stringify(item);
    }
    if (ancestors.has(item)) {
      throw new TypeError('Cannot serialize cyclic JSON');
    }
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        return `[${Array.from(item, (child) => encode(child) ?? 'null').join(',')}]`;
      }
      const prototype: unknown = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('Expected a plain JSON object');
      }
      const fields = Object.entries(item).flatMap(([key, child]) => {
        const encoded = encode(child);
        return encoded === undefined
          ? []
          : [`${JSON.stringify(key)}:${encoded}`];
      });
      return `{${fields.join(',')}}`;
    } finally {
      ancestors.delete(item);
    }
  };
  const encoded = encode(value);
  if (encoded === undefined) {
    throw new TypeError('Expected a JSON value');
  }
  return encoded;
}
