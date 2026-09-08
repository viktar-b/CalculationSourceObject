const structureTokens = /("(?:[^"\\]|\\.)*")(\s*:)?|[{}[\]]/g;

// Validate syntax first, then inspect keys before JSON.parse's last-key-wins
// behavior can be trusted as captured evidence. Iteration also handles deep JSON.
export function parseStrictJson(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  const containers: (Set<string> | null)[] = [];
  for (const token of text.matchAll(structureTokens)) {
    if (token[0] === '{') {
      containers.push(new Set());
    } else if (token[0] === '[') {
      containers.push(null);
    } else if (token[0] === '}' || token[0] === ']') {
      containers.pop();
    } else if (token[1] && token[2]) {
      const key: unknown = JSON.parse(token[1]);
      if (typeof key !== 'string') {
        throw new Error('Expected JSON string key');
      }
      const keys = containers.at(-1);
      if (keys?.has(key)) {
        throw new Error(`Duplicate JSON key ${JSON.stringify(key)}`);
      }
      keys?.add(key);
    }
  }
  return parsed;
}
