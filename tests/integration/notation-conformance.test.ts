import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { notationIdentity, parseNotation } from '@viktar-b/cso-core';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

const ExpectedParseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.array(z.unknown()) }),
  z.object({
    ok: z.literal(false),
    code: z.string().min(1),
    offset: z.number().int().nonnegative(),
  }),
]);

const CorpusSchema = z.object({
  parseCases: z.array(
    z.object({
      name: z.string().min(1),
      source: z.string(),
      expected: ExpectedParseSchema,
    }),
  ),
  identityPairs: z.array(
    z.object({
      name: z.string().min(1),
      left: z.string(),
      right: z.string(),
      equal: z.boolean(),
    }),
  ),
});

const PythonResultSchema = z.object({
  parseCases: z.array(ExpectedParseSchema),
  identityPairs: z.array(
    z.object({ leftIdentity: z.string(), rightIdentity: z.string() }),
  ),
});

const corpusPath = new URL('../fixtures/notation-corpus.json', import.meta.url);
const corpus = CorpusSchema.parse(JSON.parse(readFileSync(corpusPath, 'utf8')));

const summarizeParse = (
  source: string,
): z.infer<typeof ExpectedParseSchema> => {
  const parsed = parseNotation(source);
  return parsed.ok
    ? { ok: true, value: [...parsed.value] }
    : {
        ok: false,
        code: parsed.diagnostic.code,
        offset: parsed.diagnostic.offset,
      };
};

const identity = (source: string): string => {
  const parsed = parseNotation(source);
  if (!parsed.ok) {
    throw new Error(`Invalid corpus notation: ${source}`);
  }
  return notationIdentity(parsed.value);
};

const pythonProgram = String.raw`
import json
import sys
from dataclasses import fields, is_dataclass

from cso_python.notation import notation_identity, parse_notation


def encode(value):
    if isinstance(value, tuple):
        return [encode(item) for item in value]
    if is_dataclass(value):
        encoded = {field.name: encode(getattr(value, field.name)) for field in fields(value)}
        return {"kind": value.kind, **encoded}
    return value


def parse_case(source):
    parsed = parse_notation(source)
    if parsed.ok:
        return {"ok": True, "value": encode(parsed.value)}
    return {
        "ok": False,
        "code": parsed.diagnostic.code,
        "offset": parsed.diagnostic.offset,
    }


def identity(source):
    parsed = parse_notation(source)
    if not parsed.ok:
        raise ValueError(f"Invalid corpus notation: {source!r}")
    return notation_identity(parsed.value)


corpus = json.load(sys.stdin)
result = {
    "parseCases": [parse_case(case["source"]) for case in corpus["parseCases"]],
    "identityPairs": [
        {
            "leftIdentity": identity(pair["left"]),
            "rightIdentity": identity(pair["right"]),
        }
        for pair in corpus["identityPairs"]
    ],
}
json.dump(result, sys.stdout, ensure_ascii=True, separators=(",", ":"))
`;

const runPythonCorpus = (): z.infer<typeof PythonResultSchema> => {
  const environment = { ...process.env };
  for (const key of ['NODE_PATH', 'PYTHONHOME', 'PYTHONPATH']) {
    Reflect.deleteProperty(environment, key);
  }
  const result = spawnSync(
    process.env.PYTHON ?? 'python3',
    ['-I', '-c', pythonProgram],
    {
      encoding: 'utf8',
      env: environment,
      input: JSON.stringify(corpus),
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Python notation corpus failed with status ${result.status}\n${result.stderr}`,
    );
  }
  return PythonResultSchema.parse(JSON.parse(result.stdout));
};

describe('cross-language notation conformance', () => {
  const python = runPythonCorpus();
  const parseCases = corpus.parseCases.map((testCase, index) => {
    const pythonResult = python.parseCases[index];
    if (pythonResult === undefined) {
      throw new Error(`Python omitted parse case ${index}`);
    }
    return { ...testCase, pythonResult };
  });
  const identityPairs = corpus.identityPairs.map((pair, index) => {
    const pythonResult = python.identityPairs[index];
    if (pythonResult === undefined) {
      throw new Error(`Python omitted identity pair ${index}`);
    }
    return { ...pair, pythonResult };
  });

  test.each(parseCases)('$name', ({ source, expected, pythonResult }) => {
    expect(summarizeParse(source)).toEqual(expected);
    expect(pythonResult).toEqual(expected);
  });

  test.each(identityPairs)('$name', ({ left, right, equal, pythonResult }) => {
    const leftIdentity = identity(left);
    const rightIdentity = identity(right);

    expect(pythonResult.leftIdentity).toBe(leftIdentity);
    expect(pythonResult.rightIdentity).toBe(rightIdentity);
    expect(leftIdentity === rightIdentity).toBe(equal);
  });
});
