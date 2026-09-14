import { describe, expect, test } from 'vitest';
import { namespacedId, sourceClosureHash } from '../src/contracts/common.ts';
import {
  type ExecutionPayload,
  ExecutionPayloadSchema,
  ExecutionResponseSchema,
  InvocationSchema,
  SymbolDefinitionSchema,
} from '../src/contracts/execution.ts';
import { scopedGlyph } from '../src/contracts/glyphs.ts';
import { verifyExecution } from '../src/verification/verify.ts';

const span = (moduleId: string, line: number) => ({
  moduleId,
  start: { line, column: 0 },
  end: { line, column: 10 },
});
const symbolId = (invocationId: string, localId: string) =>
  namespacedId('symbol', invocationId, localId);
const sectionId = (invocationId: string) =>
  namespacedId('section', invocationId, 'calculation');
const required = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error('Fixture item is missing');
  }
  return value;
};
const symbolsFor = (invocationId: string, value = 2) => {
  const length = symbolId(invocationId, 'length');
  const scope = invocationId.split('/').slice(1).join(',');
  const glyph = (base: string) =>
    scope === '' ? base : scopedGlyph(base, scope);
  return [
    {
      id: length,
      glyph: glyph('x'),
      unit: 'm',
      valueTree: {
        rootKey: 'n1',
        result: { kind: 'number', value },
        nodes: [
          { key: 'n1', mode: 'LITERAL', literal: { kind: 'number', value } },
        ],
      },
    },
    {
      id: symbolId(invocationId, 'area'),
      glyph: glyph('A'),
      unit: 'm^2',
      valueTree: {
        rootKey: 'n2',
        result: { kind: 'number', value: value * value },
        nodes: [
          { key: 'n1', mode: 'SYMBOL', symbol: { id: length } },
          {
            key: 'n2',
            mode: 'FUNCTION',
            funcSpec: { id: 'fg.multiply' },
            funcArgs: [{ key: 'n1' }, { key: 'n1' }],
            result: { kind: 'number', value: value * value },
          },
        ],
      },
    },
  ];
};
const definitionsFor = (invocationId: string, moduleId: string) => [
  {
    symbolId: symbolId(invocationId, 'length'),
    localId: 'length',
    variableName: 'dimension',
    definitionLocation: span(moduleId, 10),
    kind: 'input',
    givenSource: { kind: 'parameter', parameterName: 'x' },
  },
  {
    symbolId: symbolId(invocationId, 'area'),
    localId: 'area',
    variableName: 'square_area',
    definitionLocation: span(moduleId, 20),
    kind: 'formula',
    address: { symbolId: symbolId(invocationId, 'area'), nodeKey: 'n2' },
  },
];
const makeExecution = (value = 2): ExecutionPayload => {
  const moduleId = 'estimate.cso.py';
  const sourceManifest = [{ moduleId, sha256: 'a'.repeat(64) }];
  const symbols = definitionsFor('root', moduleId);
  return ExecutionPayloadSchema.parse({
    cso: {
      schemaVersion: '1.0.0',
      title: 'Square',
      source: { id: 'square', metadata: {} },
      rootSectionIds: [sectionId('root')],
      sections: [
        {
          id: sectionId('root'),
          title: 'Square',
          items: symbolsFor('root', value).map((symbol) => ({
            kind: 'symbol',
            symbol,
          })),
        },
      ],
    },
    entry: {
      moduleId,
      function: 'estimate',
      sourceHash: 'a'.repeat(64),
      invocationId: 'root',
      resolvedInputs: { x: value },
    },
    sourceManifest,
    sourceClosureHash: sourceClosureHash(sourceManifest),
    invocations: [
      {
        id: 'root',
        moduleId,
        function: 'estimate',
        resolvedInputs: { x: value },
        inputBindings: [
          {
            kind: 'entrySupplied',
            parameterName: 'x',
            parameterLocation: span(moduleId, 2),
            value,
          },
        ],
        symbols,
      },
    ],
    observations: symbols.map((symbol, index) => ({
      symbolId: symbol.symbolId,
      invocationId: 'root',
      kind: symbol.kind,
      value: index === 0 ? value : value * value,
      definitionLocation: symbol.definitionLocation,
    })),
    assets: [],
    versions: {
      pythonPackage: '0.1.0',
      pythonInterpreter: 'python3',
      pythonVersion: '3.12.0',
    },
  });
};
const addChild = (
  execution: ExecutionPayload,
  name: string,
  parentId: string,
  callLine: number,
  sourceId: string,
): ExecutionPayload => {
  const parent = required(
    execution.invocations.find((invocation) => invocation.id === parentId),
  );
  const id = `${parentId}/${name}`;
  const moduleId = 'geometry.cso.py';
  const sourceManifest = execution.sourceManifest.some(
    (item) => item.moduleId === moduleId,
  )
    ? execution.sourceManifest
    : [...execution.sourceManifest, { moduleId, sha256: 'b'.repeat(64) }];
  const symbols = definitionsFor(id, moduleId);
  return ExecutionPayloadSchema.parse({
    ...execution,
    sourceManifest,
    sourceClosureHash: sourceClosureHash(sourceManifest),
    cso: {
      ...execution.cso,
      sections: [
        ...execution.cso.sections,
        {
          id: sectionId(id),
          title: name,
          items: symbolsFor(id).map((symbol) => ({ kind: 'symbol', symbol })),
        },
      ],
    },
    invocations: [
      ...execution.invocations,
      {
        id,
        parentInvocationId: parentId,
        callBindingName: name,
        callSite: span(parent.moduleId, callLine),
        moduleId,
        function: 'geometry',
        resolvedInputs: { x: 2 },
        inputBindings: [
          {
            kind: 'callerSymbol',
            parameterName: 'x',
            parameterLocation: span(moduleId, 2),
            callerLocation: span(parent.moduleId, callLine),
            source: {
              symbolId: sourceId,
              nodeKey: sourceId.endsWith(',"area"]') ? 'n2' : 'n1',
            },
          },
        ],
        symbols,
      },
    ],
    observations: [
      ...execution.observations,
      ...symbols.map((symbol, index) => ({
        symbolId: symbol.symbolId,
        invocationId: id,
        kind: symbol.kind,
        value: index === 0 ? 2 : 4,
        definitionLocation: symbol.definitionLocation,
      })),
    ],
  });
};
const makeNested = (): ExecutionPayload => {
  let execution = addChild(
    makeExecution(),
    'panel_a',
    'root',
    15,
    symbolId('root', 'length'),
  );
  execution = addChild(
    execution,
    'nested',
    'root/panel_a',
    15,
    symbolId('root/panel_a', 'length'),
  );
  return addChild(
    execution,
    'panel_b',
    'root',
    18,
    symbolId('root/panel_a', 'area'),
  );
};
const codes = (value: unknown): unknown[] => {
  const result = ExecutionPayloadSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.flatMap((issue) =>
        issue.code === 'custom' ? [issue.params?.diagnosticCode] : [],
      );
};

describe('execution evidence contract', () => {
  test.each([0, -0])(
    'preserves matching signed-zero input identities (%s)',
    (value) => {
      const execution = makeExecution(value);
      const parsed = ExecutionPayloadSchema.parse(execution);
      expect(Object.is(parsed.entry.resolvedInputs.x, value)).toBe(true);
      expect(
        Object.is(required(parsed.invocations[0]).resolvedInputs.x, value),
      ).toBe(true);
      expect(verifyExecution({ execution }).ok).toBe(true);
    },
  );

  test.each([0, -0])(
    'rejects opposite signed-zero entry and invocation identities (%s)',
    (value) => {
      const execution = makeExecution(value);
      execution.entry.resolvedInputs.x = -value;
      expect(codes(execution)).toContain('ENTRY_INVOCATION_MISMATCH');
      const report = verifyExecution({
        execution,
        referenceCases: [
          {
            id: 'zero',
            revision: '1',
            basis: {
              method: 'Arithmetic',
              derivation: 'Zero squared is zero',
              sourceDescription: 'Synthetic contract case',
            },
            binding: {
              entryModuleId: execution.entry.moduleId,
              entrySourceHash: execution.entry.sourceHash,
              sourceClosureHash: execution.sourceClosureHash,
              function: execution.entry.function,
              resolvedInputs: execution.entry.resolvedInputs,
            },
            expected: [
              { symbolId: symbolId('root', 'area'), value: 0, unit: 'm^2' },
            ],
          },
        ],
      });
      expect(report.ok).toBe(false);
      expect(report.checks.executionValidity.status).toBe('failed');
      expect(report.checks.independentReferenceAgreement.status).not.toBe(
        'passed',
      );
      expect(
        report.diagnostics.some(
          (diagnostic) => diagnostic.code === 'ENTRY_INVOCATION_MISMATCH',
        ),
      ).toBe(true);
    },
  );

  test('accepts qualified repeated local node keys and nested/repeated invocations', () => {
    const execution = makeNested();
    execution.invocations.reverse();
    execution.cso.sections[0]?.items.push({
      kind: 'symbolRef',
      id: symbolId('root', 'area'),
    });
    execution.operationObservations = [
      {
        address: { symbolId: symbolId('root', 'length'), nodeKey: 'n1' },
        invocationId: 'root',
        value: 2,
        location: span('estimate.cso.py', 10),
      },
      {
        address: { symbolId: symbolId('root', 'area'), nodeKey: 'n1' },
        invocationId: 'root',
        value: 2,
        location: span('estimate.cso.py', 20),
      },
    ];
    expect(
      ExecutionResponseSchema.parse({
        protocolVersion: '1',
        ok: true,
        diagnostics: [],
        execution,
      }).ok,
    ).toBe(true);
  });

  test('keeps wrong runtime, cache and binding values for numerical verification', () => {
    const execution = makeNested();
    required(execution.observations[0]).value = 999;
    const firstItem = required(required(execution.cso.sections[0]).items[0]);
    if (firstItem.kind !== 'symbol') {
      throw new Error('Expected fixture symbol');
    }
    firstItem.symbol.valueTree.result = { kind: 'number', value: 777 };
    const root = required(
      execution.invocations.find((invocation) => invocation.id === 'root'),
    );
    const firstBinding = required(root.inputBindings[0]);
    if (firstBinding.kind !== 'entrySupplied') {
      throw new Error('Expected supplied root binding');
    }
    firstBinding.value = 888;
    expect(ExecutionPayloadSchema.safeParse(execution).success).toBe(true);
  });

  test('keeps explicit input, constant, alias and unsupported evidence variants', () => {
    const identity = required(
      required(makeExecution().invocations[0]).symbols[0],
    );
    const base = {
      symbolId: identity.symbolId,
      localId: identity.localId,
      variableName: identity.variableName,
      definitionLocation: identity.definitionLocation,
    };
    expect(
      SymbolDefinitionSchema.parse({
        ...base,
        kind: 'input',
        givenSource: {
          kind: 'literal',
          value: 2,
          location: span('estimate.cso.py', 10),
        },
      }).kind,
    ).toBe('input');
    expect(
      SymbolDefinitionSchema.parse({
        ...base,
        kind: 'constant',
        literal: { value: 2, location: span('estimate.cso.py', 10) },
      }).kind,
    ).toBe('constant');
    expect(
      SymbolDefinitionSchema.parse({
        ...base,
        kind: 'unsupported',
        reason: 'documented_result',
      }).kind,
    ).toBe('unsupported');
    expect(
      SymbolDefinitionSchema.safeParse({ ...base, kind: 'constant', value: 2 })
        .success,
    ).toBe(false);
  });

  test('requires strict root/child shapes and permits all accepted binding variants', () => {
    const root = required(makeExecution().invocations[0]);
    expect(
      InvocationSchema.safeParse({ ...root, parentInvocationId: 'other' })
        .success,
    ).toBe(false);
    expect(InvocationSchema.safeParse({ ...root, outputs: {} }).success).toBe(
      false,
    );
    expect(
      InvocationSchema.parse({
        ...root,
        inputBindings: [
          {
            kind: 'parsedDefault',
            parameterName: 'x',
            parameterLocation: span(root.moduleId, 2),
            value: 2,
            defaultLocation: span(root.moduleId, 2),
          },
        ],
      }).id,
    ).toBe('root');
    const child = required(
      makeNested().invocations.find(
        (invocation) => invocation.id === 'root/panel_a',
      ),
    );
    expect(
      InvocationSchema.parse({
        ...child,
        inputBindings: [
          {
            kind: 'callerLiteral',
            parameterName: 'x',
            parameterLocation: span(child.moduleId, 2),
            value: 2,
            callerLocation: span(root.moduleId, 15),
          },
        ],
      }).id,
    ).toBe(child.id);
    expect(
      InvocationSchema.safeParse({
        ...child,
        inputBindings: root.inputBindings,
      }).success,
    ).toBe(false);
  });

  test('structured failure has diagnostics and cannot carry successful execution', () => {
    const failure = {
      protocolVersion: '1',
      ok: false,
      diagnostics: [
        {
          code: 'UNSUPPORTED_SYNTAX',
          stage: 'source',
          message: 'Unsupported source statement',
        },
      ],
    };
    expect(ExecutionResponseSchema.parse(failure).ok).toBe(false);
    expect(
      ExecutionResponseSchema.safeParse({
        ...failure,
        execution: makeExecution(),
      }).success,
    ).toBe(false);
    expect(
      ExecutionResponseSchema.safeParse({ ...failure, diagnostics: [] })
        .success,
    ).toBe(false);
  });

  test('successful response diagnostic spans resolve through the execution manifest', () => {
    const response = {
      protocolVersion: '1',
      ok: true,
      diagnostics: [
        {
          code: 'NOTE',
          message: 'Available source note',
          stage: 'source',
          location: span('missing.cso.py', 1),
        },
      ],
      execution: makeExecution(),
    };
    expect(ExecutionResponseSchema.safeParse(response).success).toBe(false);
    expect(
      ExecutionResponseSchema.safeParse({
        ...response,
        diagnostics: [
          {
            ...required(response.diagnostics[0]),
            location: span('estimate.cso.py', 1),
          },
        ],
      }).success,
    ).toBe(true);
  });

  test('successful diagnostic identities resolve to the same invocation and symbol graph', () => {
    const execution = makeNested();
    const diagnostic = {
      code: 'NOTE',
      message: 'Observed operation',
      stage: 'contract',
      symbolId: symbolId('root', 'area'),
      invocationId: 'root',
      nodeKey: 'n1',
    };
    const response = {
      protocolVersion: '1',
      ok: true,
      diagnostics: [diagnostic],
      execution,
    };
    expect(ExecutionResponseSchema.safeParse(response).success).toBe(true);
    expect(
      ExecutionResponseSchema.safeParse({
        ...response,
        diagnostics: [{ ...diagnostic, symbolId: symbolId('root', 'length') }],
      }).success,
    ).toBe(true);
    const malformed = [
      {
        patch: { invocationId: 'root/missing' },
        code: 'UNKNOWN_DIAGNOSTIC_INVOCATION',
        field: 'invocationId',
      },
      {
        patch: { symbolId: symbolId('root', 'missing') },
        code: 'UNKNOWN_DIAGNOSTIC_SYMBOL',
        field: 'symbolId',
      },
      {
        patch: { invocationId: 'root/panel_a' },
        code: 'DIAGNOSTIC_SYMBOL_INVOCATION_MISMATCH',
        field: 'invocationId',
      },
      {
        patch: { nodeKey: 'missing' },
        code: 'UNKNOWN_DIAGNOSTIC_NODE',
        field: 'nodeKey',
      },
      {
        patch: { symbolId: symbolId('root', 'length'), nodeKey: 'n2' },
        code: 'UNKNOWN_DIAGNOSTIC_NODE',
        field: 'nodeKey',
      },
    ];
    for (const { patch, code, field } of malformed) {
      const diagnostics = [{ ...diagnostic, ...patch }];
      const result = ExecutionResponseSchema.safeParse({
        ...response,
        diagnostics,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'custom',
              path: ['diagnostics', 0, field],
              params: { diagnosticCode: code },
            }),
          ]),
        );
      }
      expect(
        ExecutionResponseSchema.safeParse({
          protocolVersion: '1',
          ok: false,
          diagnostics,
        }).success,
      ).toBe(true);
    }
  });

  test('rejects missing, duplicate and orphan observations with stable codes', () => {
    const execution = makeExecution();
    expect(codes({ ...execution, observations: [] })).toContain(
      'MISSING_OBSERVATION',
    );
    expect(
      codes({
        ...execution,
        observations: [
          ...execution.observations,
          required(execution.observations[0]),
        ],
      }),
    ).toContain('DUPLICATE_OBSERVATION');
    expect(
      codes({
        ...execution,
        observations: [
          ...execution.observations,
          {
            ...required(execution.observations[0]),
            symbolId: symbolId('root', 'orphan'),
          },
        ],
      }),
    ).toContain('ORPHAN_OBSERVATION');
  });

  test('rejects observation identity, kind and source-location disagreement', () => {
    const execution = makeExecution();
    const first = required(execution.observations[0]);
    for (const [patch, code] of [
      [{ invocationId: 'root/unknown' }, 'OBSERVATION_INVOCATION_MISMATCH'],
      [{ kind: 'formula' }, 'OBSERVATION_KIND_MISMATCH'],
      [
        { definitionLocation: span('estimate.cso.py', 100) },
        'OBSERVATION_LOCATION_MISMATCH',
      ],
    ] as const) {
      expect(
        codes({
          ...execution,
          observations: [
            { ...first, ...patch },
            ...execution.observations.slice(1),
          ],
        }),
      ).toContain(code);
    }
  });

  test('rejects bare/foreign operation addresses while allowing reused node keys', () => {
    const execution = makeNested();
    const observation = {
      address: { symbolId: symbolId('root', 'area'), nodeKey: 'n2' },
      invocationId: 'root/panel_a',
      value: 4,
      location: span('geometry.cso.py', 20),
    };
    expect(
      codes({ ...execution, operationObservations: [observation] }),
    ).toContain('NODE_INVOCATION_MISMATCH');
    expect(
      codes({
        ...execution,
        operationObservations: [
          {
            ...observation,
            address: { symbolId: symbolId('root', 'area'), nodeKey: 'missing' },
          },
        ],
      }),
    ).toContain('UNKNOWN_NODE_ADDRESS');
    expect(
      ExecutionPayloadSchema.safeParse({
        ...execution,
        operationObservations: [{ ...observation, address: { nodeKey: 'n2' } }],
      }).success,
    ).toBe(false);
    const valid = {
      ...observation,
      invocationId: 'root',
      location: span('estimate.cso.py', 20),
    };
    expect(
      codes({ ...execution, operationObservations: [valid, valid] }),
    ).toContain('DUPLICATE_OPERATION_OBSERVATION');
  });

  test('rejects closure and entry disagreement without throwing from safeParse', () => {
    const execution = makeExecution();
    expect(
      codes({ ...execution, sourceClosureHash: 'c'.repeat(64) }),
    ).toContain('SOURCE_CLOSURE_HASH_MISMATCH');
    expect(
      codes({
        ...execution,
        entry: { ...execution.entry, sourceHash: 'c'.repeat(64) },
      }),
    ).toContain('ENTRY_SOURCE_HASH_MISMATCH');
    expect(
      codes({
        ...execution,
        sourceManifest: [
          ...execution.sourceManifest,
          required(execution.sourceManifest[0]),
        ],
      }),
    ).toContain('DUPLICATE_MODULE_ID');
    expect(
      codes({ ...execution, entry: { ...execution.entry, function: 'other' } }),
    ).toContain('ENTRY_INVOCATION_MISMATCH');
  });

  test('rejects missing, duplicate and foreign parameter bindings', () => {
    const execution = makeExecution();
    const root = required(execution.invocations[0]);
    const binding = required(root.inputBindings[0]);
    expect(
      codes({ ...execution, invocations: [{ ...root, inputBindings: [] }] }),
    ).toContain('MISSING_INPUT_BINDING');
    expect(
      codes({
        ...execution,
        invocations: [{ ...root, inputBindings: [binding, binding] }],
      }),
    ).toContain('DUPLICATE_INPUT_BINDING');
    expect(
      codes({
        ...execution,
        invocations: [
          { ...root, inputBindings: [{ ...binding, parameterName: 'other' }] },
        ],
      }),
    ).toContain('UNKNOWN_INPUT_BINDING');
    expect(
      codes({
        ...execution,
        invocations: [
          {
            ...root,
            inputBindings: [
              { ...binding, parameterLocation: span('missing.cso.py', 2) },
            ],
          },
        ],
      }),
    ).toContain('LOCATION_MODULE_MISMATCH');
  });

  test('rejects declaration gaps, namespaces, duplicate return keys and order changes', () => {
    const execution = makeExecution();
    const root = required(execution.invocations[0]);
    const first = required(root.symbols[0]);
    const second = required(root.symbols[1]);
    expect(
      codes({ ...execution, invocations: [{ ...root, symbols: [first] }] }),
    ).toContain('MISSING_SYMBOL_DEFINITION');
    expect(
      codes({
        ...execution,
        invocations: [
          { ...root, symbols: [{ ...first, localId: 'wrong' }, second] },
        ],
      }),
    ).toContain('SYMBOL_NAMESPACE_MISMATCH');
    expect(
      codes({
        ...execution,
        invocations: [
          {
            ...root,
            symbols: [first, { ...second, variableName: first.variableName }],
          },
        ],
      }),
    ).toContain('DUPLICATE_VARIABLE_NAME');
    expect(
      codes({
        ...execution,
        invocations: [{ ...root, symbols: [second, first] }],
      }),
    ).toContain('SYMBOL_DEFINITION_ORDER');
  });

  test('requires formula and caller sources to address graph roots', () => {
    const execution = makeNested();
    const root = required(execution.invocations[0]);
    const formula = required(root.symbols[1]);
    expect(
      codes({
        ...execution,
        invocations: [
          {
            ...root,
            symbols: [
              required(root.symbols[0]),
              {
                ...formula,
                address: { symbolId: formula.symbolId, nodeKey: 'n1' },
              },
            ],
          },
          ...execution.invocations.slice(1),
        ],
      }),
    ).toContain('NON_ROOT_NODE_BINDING');
    const child = required(
      execution.invocations.find(
        (invocation) => invocation.id === 'root/panel_b',
      ),
    );
    const binding = required(child.inputBindings[0]);
    expect(
      codes({
        ...execution,
        invocations: execution.invocations.map((invocation) =>
          invocation.id === child.id
            ? {
                ...child,
                inputBindings: [
                  {
                    ...binding,
                    source: {
                      symbolId: symbolId('root/panel_a', 'area'),
                      nodeKey: 'n1',
                    },
                  },
                ],
              }
            : invocation,
        ),
      }),
    ).toContain('NON_ROOT_NODE_BINDING');
  });

  test('rejects later caller definitions and later or inaccessible child sources', () => {
    const execution = makeNested();
    const child = required(
      execution.invocations.find(
        (invocation) => invocation.id === 'root/panel_a',
      ),
    );
    const binding = required(child.inputBindings[0]);
    for (const source of [
      { symbolId: symbolId('root', 'area'), nodeKey: 'n2' },
      { symbolId: symbolId('root/panel_b', 'area'), nodeKey: 'n2' },
      { symbolId: symbolId('root/panel_a/nested', 'area'), nodeKey: 'n2' },
    ]) {
      expect(
        codes({
          ...execution,
          invocations: execution.invocations.map((invocation) =>
            invocation.id === child.id
              ? { ...child, inputBindings: [{ ...binding, source }] }
              : invocation,
          ),
        }),
      ).toContain('INVALID_CALLER_SYMBOL_SOURCE');
    }
  });

  test('rejects disconnected invocation trees and wrong call-site modules', () => {
    const execution = makeNested();
    const child = required(
      execution.invocations.find(
        (invocation) => invocation.id === 'root/panel_a',
      ),
    );
    expect(
      codes({
        ...execution,
        invocations: execution.invocations.filter(
          (invocation) => invocation.id !== 'root',
        ),
      }),
    ).toContain('MISSING_ROOT_INVOCATION');
    expect(
      codes({
        ...execution,
        invocations: execution.invocations.map((invocation) =>
          invocation.id === child.id
            ? { ...child, parentInvocationId: 'unknown' }
            : invocation,
        ),
      }),
    ).toContain('DISCONNECTED_INVOCATION');
    expect(
      codes({
        ...execution,
        invocations: execution.invocations.map((invocation) =>
          invocation.id === child.id
            ? { ...child, callSite: span('geometry.cso.py', 15) }
            : invocation,
        ),
      }),
    ).toContain('LOCATION_MODULE_MISMATCH');
  });

  test('safeParse rejects malformed refined identity data without throwing', () => {
    const execution = makeExecution();
    const root = required(execution.invocations[0]);
    const first = required(root.symbols[0]);
    expect(
      ExecutionPayloadSchema.safeParse({
        ...execution,
        sourceManifest: [
          { moduleId: '../outside.cso.py', sha256: 'a'.repeat(64) },
        ],
      }).success,
    ).toBe(false);
    expect(
      ExecutionPayloadSchema.safeParse({
        ...execution,
        invocations: [
          {
            ...root,
            symbols: [
              { ...first, localId: '\uD800' },
              ...root.symbols.slice(1),
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ExecutionPayloadSchema.safeParse({
        ...execution,
        sourceManifest: [{ moduleId: '\uD800.cso.py', sha256: 'a'.repeat(64) }],
      }).success,
    ).toBe(false);
  });

  test('optional metadata identities and spans cannot contradict execution evidence', () => {
    const execution = makeExecution();
    const section = required(execution.cso.sections[0]);
    section.metadata = {
      invocationId: 'root/unknown',
      localId: 'calculation',
      location: span('estimate.cso.py', 1),
    };
    expect(codes(execution)).toContain('METADATA_INVOCATION_MISMATCH');
    section.metadata = { location: span('unknown.cso.py', 1) };
    expect(codes(execution)).toContain('UNKNOWN_MODULE');
    section.metadata = {};
    const item = required(section.items[0]);
    if (item.kind !== 'symbol') {
      throw new Error('Expected fixture symbol');
    }
    item.metadata = { invocationId: 'root/unknown' };
    expect(codes(execution)).toContain('UNKNOWN_METADATA_INVOCATION');
    item.metadata = { localId: 'different' };
    expect(codes(execution)).toContain('METADATA_LOCAL_ID_MISMATCH');
    item.metadata = {};
    item.symbol.metadata = { location: span('estimate.cso.py', 99) };
    expect(codes(execution)).toContain('METADATA_LOCATION_MISMATCH');
  });

  test('rejects unsafe observations, unknown assets and unnamespaced content', () => {
    const execution = makeExecution();
    for (const value of [Number.POSITIVE_INFINITY, Number.NaN, 2 ** 53]) {
      expect(
        ExecutionPayloadSchema.safeParse({
          ...execution,
          observations: [
            { ...required(execution.observations[0]), value },
            ...execution.observations.slice(1),
          ],
        }).success,
      ).toBe(false);
    }
    expect(
      codes({
        ...execution,
        assets: [
          {
            id: 'figure-bytes',
            moduleId: 'missing.cso.py',
            path: 'figure.png',
            mediaType: 'image/png',
            sha256: 'a'.repeat(64),
          },
        ],
      }),
    ).toContain('UNKNOWN_MODULE');
    const section = required(execution.cso.sections[0]);
    expect(
      codes({
        ...execution,
        cso: {
          ...execution.cso,
          sections: [
            {
              ...section,
              items: [
                ...section.items,
                {
                  kind: 'text',
                  id: 'unqualified',
                  text: { content: 'Explanation' },
                },
              ],
            },
          ],
        },
      }),
    ).toContain('ITEM_NAMESPACE_MISMATCH');
  });
});
