import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as esm from '@cs-object/core';

const require = createRequire(import.meta.url);
const cjs = require('@cs-object/core');

const read = (directory, name) =>
  JSON.parse(
    readFileSync(
      new URL(`../${directory}/${name}.json`, import.meta.url),
      'utf8',
    ),
  );

const contractExecution = (api, name) => {
  const response = api.ExecutionResponseSchema.parse(
    read('contract-cases', name),
  );
  assert.equal(response.ok, true, `${name} is a successful synthetic envelope`);
  return response.execution;
};

const span = (moduleId, line) => ({
  moduleId,
  start: { line, column: 0 },
  end: { line, column: 20 },
});

const numericLiteral = (value) => ({ kind: 'number', value });

const cachedNumber = (value) => ({ kind: 'number', value });

const clone = (value) => structuredClone(value);

const report = (api, label, input) => {
  const result = api.verifyExecution(input);
  assert.deepEqual(
    api.VerificationReportSchema.parse(result),
    result,
    `${label} produces a public verification report`,
  );
  return result;
};

const diagnostic = (reportValue, code) => {
  const found = reportValue.diagnostics.find((item) => item.code === code);
  assert(found, `expected diagnostic ${code}`);
  return found;
};

const expectPassed = (reportValue, label) => {
  assert.equal(reportValue.ok, true, label);
  assert.equal(
    reportValue.checks.sourceToDocumentConsistency.status,
    'passed',
    `${label} source consistency`,
  );
};

const expectFailure = (reportValue, check, code, label) => {
  assert.equal(reportValue.ok, false, label);
  assert.equal(reportValue.checks[check].status, 'failed', `${label} check`);
  return diagnostic(reportValue, code);
};

const sourceHash = (description) =>
  createHash('sha256').update(description, 'utf8').digest('hex');

const sourceSymbolId = (api, localId) =>
  api.namespacedId('symbol', 'root', localId);

const formulaSymbol = ({
  api,
  localId,
  unit,
  moduleId,
  line,
  functionId,
  arguments: argumentsList,
  result,
  includeCache = true,
}) => {
  const nodes = argumentsList.map((argument, index) => {
    const key = `arg_${index + 1}`;
    if (argument.kind === 'literal') {
      return { key, mode: 'LITERAL', literal: numericLiteral(argument.value) };
    }
    return {
      key,
      mode: 'SYMBOL',
      symbol: { id: sourceSymbolId(api, argument.localId) },
    };
  });
  const root = {
    key: 'root',
    mode: 'FUNCTION',
    funcSpec: { id: functionId },
    funcArgs: nodes.map(({ key }) => ({ key })),
  };
  if (includeCache) {
    root.result = cachedNumber(result);
  }
  nodes.push(root);
  const valueTree = { rootKey: 'root', nodes };
  if (includeCache) {
    valueTree.result = cachedNumber(result);
  }
  return {
    id: sourceSymbolId(api, localId),
    glyph: localId,
    glyphPlaintext: localId,
    description: localId,
    unit,
    metadata: {
      invocationId: 'root',
      localId,
      location: span(moduleId, line),
    },
    valueTree,
  };
};

const inputSymbol = ({ api, localId, unit, moduleId, line, value }) => ({
  id: sourceSymbolId(api, localId),
  glyph: localId,
  glyphPlaintext: localId,
  description: localId,
  unit,
  metadata: {
    invocationId: 'root',
    localId,
    location: span(moduleId, line),
  },
  valueTree: {
    rootKey: 'root',
    result: cachedNumber(value),
    nodes: [
      {
        key: 'root',
        mode: 'LITERAL',
        literal: numericLiteral(value),
        result: cachedNumber(value),
      },
    ],
  },
});

const makeExecution = (api, definition) => {
  const moduleId = definition.binding.entryModuleId;
  const inputEntries = Object.entries(definition.binding.resolvedInputs);
  const firstFormulaLine = inputEntries.length + 10;
  const inputItems = inputEntries.map(([localId, value], index) => ({
    kind: 'symbol',
    symbol: inputSymbol({
      api,
      localId,
      unit: definition.inputUnits?.[localId] ?? '1',
      moduleId,
      line: index + 2,
      value,
    }),
  }));
  const formulaItems = definition.formulas.map((formula, index) => ({
    kind: 'symbol',
    symbol: formulaSymbol({
      api,
      moduleId,
      line: firstFormulaLine + index,
      ...formula,
    }),
  }));
  const detachedFormulaIds = new Set(definition.detachedFormulaIds ?? []);
  const placedFormulaItems = formulaItems.filter(
    ({ symbol }) => !detachedFormulaIds.has(symbol.glyph),
  );
  const detachedItems = formulaItems.filter(({ symbol }) =>
    detachedFormulaIds.has(symbol.glyph),
  );
  const items = [...inputItems, ...placedFormulaItems];
  const symbols = [
    ...inputEntries.map(([localId], index) => ({
      symbolId: sourceSymbolId(api, localId),
      localId,
      variableName: localId,
      definitionLocation: span(moduleId, index + 2),
      kind: 'input',
      givenSource: { kind: 'parameter', parameterName: localId },
    })),
    ...definition.formulas.map((formula, index) => ({
      symbolId: sourceSymbolId(api, formula.localId),
      localId: formula.localId,
      variableName: formula.localId,
      definitionLocation: span(moduleId, firstFormulaLine + index),
      kind: 'formula',
      address: {
        symbolId: sourceSymbolId(api, formula.localId),
        nodeKey: 'root',
      },
    })),
  ];
  const observations = [
    ...inputEntries.map(([localId, value], index) => ({
      symbolId: sourceSymbolId(api, localId),
      invocationId: 'root',
      kind: 'input',
      value,
      definitionLocation: span(moduleId, index + 2),
    })),
    ...definition.formulas.map((formula, index) => ({
      symbolId: sourceSymbolId(api, formula.localId),
      invocationId: 'root',
      kind: 'formula',
      value: formula.result,
      definitionLocation: span(moduleId, firstFormulaLine + index),
    })),
  ];
  const operationObservations = definition.formulas
    .filter((formula) => formula.includeCache !== false)
    .map((formula, index) => ({
      address: {
        symbolId: sourceSymbolId(api, formula.localId),
        nodeKey: 'root',
      },
      invocationId: 'root',
      value: formula.result,
      location: span(moduleId, firstFormulaLine + index),
    }));
  const execution = {
    cso: {
      schemaVersion: '1.0.0',
      title: 'Synthetic arithmetic protocol case',
      source: {
        id: 'synthetic-arithmetic-protocol',
        metadata: { purpose: definition.sourceDescription },
      },
      rootSectionIds: [api.namespacedId('section', 'root', 'function')],
      sections: [
        {
          id: api.namespacedId('section', 'root', 'function'),
          title: definition.binding.function,
          metadata: {
            invocationId: 'root',
            localId: 'function',
            location: span(moduleId, 1),
          },
          items,
        },
      ],
      ...(detachedItems.length === 0 ? {} : { detachedItems }),
    },
    entry: {
      moduleId,
      function: definition.binding.function,
      sourceHash: definition.binding.entrySourceHash,
      invocationId: 'root',
      resolvedInputs: definition.binding.resolvedInputs,
    },
    sourceManifest: [{ moduleId, sha256: definition.binding.entrySourceHash }],
    sourceClosureHash: definition.binding.sourceClosureHash,
    invocations: [
      {
        id: 'root',
        moduleId,
        function: definition.binding.function,
        resolvedInputs: definition.binding.resolvedInputs,
        inputBindings: inputEntries.map(([parameterName, value], index) => ({
          kind: 'entrySupplied',
          parameterName,
          parameterLocation: span(moduleId, index + 2),
          value,
        })),
        symbols,
      },
    ],
    observations,
    operationObservations,
    assets: [],
    versions: {
      pythonPackage: 'synthetic-protocol-fixture',
      pythonInterpreter: 'no-python-execution-captured',
      pythonVersion: 'not-applicable',
    },
  };
  return api.ExecutionPayloadSchema.parse(execution);
};

const arithmeticExecution = (api, referenceCase) => {
  if (
    referenceCase.id === 'rational-nine' ||
    referenceCase.id === 'rational-zero'
  ) {
    const expected =
      referenceCase.id === 'rational-nine'
        ? { sum: 6, sumTimesC: 18, result: 9 }
        : { sum: 0, sumTimesC: 0, result: 0 };
    return makeExecution(api, {
      binding: referenceCase.binding,
      sourceDescription: referenceCase.basis.sourceDescription,
      formulas: [
        {
          localId: 'sum',
          unit: '1',
          functionId: 'fg.add',
          arguments: [
            { kind: 'symbol', localId: 'a' },
            { kind: 'symbol', localId: 'b' },
          ],
          result: expected.sum,
        },
        {
          localId: 'sum_times_c',
          unit: '1',
          functionId: 'fg.multiply',
          arguments: [
            { kind: 'symbol', localId: 'sum' },
            { kind: 'symbol', localId: 'c' },
          ],
          result: expected.sumTimesC,
        },
        {
          localId: 'result',
          unit: '1',
          functionId: 'fg.divide',
          arguments: [
            { kind: 'symbol', localId: 'sum_times_c' },
            { kind: 'symbol', localId: 'd' },
          ],
          result: expected.result,
        },
      ],
    });
  }
  if (referenceCase.id === 'sqrt-nine') {
    return makeExecution(api, {
      binding: referenceCase.binding,
      sourceDescription: referenceCase.basis.sourceDescription,
      inputUnits: { radicand: 'm^2' },
      formulas: [
        {
          localId: 'root',
          unit: 'm',
          functionId: 'fg.sqrt',
          arguments: [{ kind: 'symbol', localId: 'radicand' }],
          result: 9,
        },
      ],
    });
  }
  throw new Error(`Unknown arithmetic reference case ${referenceCase.id}`);
};

const standaloneBinding = (api, moduleId, functionName, sourceDescription) => {
  const entrySourceHash = sourceHash(sourceDescription);
  const sourceManifest = [{ moduleId, sha256: entrySourceHash }];
  return {
    entryModuleId: moduleId,
    entrySourceHash,
    sourceClosureHash: api.sourceClosureHash(sourceManifest),
    function: functionName,
    resolvedInputs: {},
  };
};

const unsafeIntermediateExecution = (api) => {
  const sourceDescription =
    'Synthetic verifier protocol fixture. No Python execution was captured. Formula: 2 ** 53 + 1 - 2 ** 53.';
  const binding = standaloneBinding(
    api,
    'unsafe-intermediate.cso.py',
    'calculate_unsafe_intermediate',
    sourceDescription,
  );
  const execution = makeExecution(api, {
    binding,
    sourceDescription,
    formulas: [
      {
        localId: 'result',
        unit: '1',
        functionId: 'fg.subtract',
        arguments: [
          { kind: 'literal', value: 1 },
          { kind: 'literal', value: 0 },
        ],
        result: 1,
        includeCache: false,
      },
    ],
  });
  const symbol = execution.cso.sections[0].items[0].symbol;
  symbol.valueTree = {
    rootKey: 'subtract',
    nodes: [
      { key: 'base', mode: 'LITERAL', literal: numericLiteral(2) },
      { key: 'exponent', mode: 'LITERAL', literal: numericLiteral(53) },
      {
        key: 'power',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.pow' },
        funcArgs: [{ key: 'base' }, { key: 'exponent' }],
      },
      { key: 'one', mode: 'LITERAL', literal: numericLiteral(1) },
      {
        key: 'add',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.add' },
        funcArgs: [{ key: 'power' }, { key: 'one' }],
      },
      {
        key: 'subtract',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.subtract' },
        funcArgs: [{ key: 'add' }, { key: 'power' }],
      },
    ],
  };
  const definition = execution.invocations[0].symbols[0];
  definition.address.nodeKey = 'subtract';
  return api.ExecutionPayloadSchema.parse(execution);
};

const cyclicExecution = (api) => {
  const sourceDescription =
    'Synthetic verifier protocol fixture. No Python execution was captured. Formula graph has a cycle.';
  const binding = standaloneBinding(
    api,
    'cycle.cso.py',
    'calculate_cycle',
    sourceDescription,
  );
  const execution = makeExecution(api, {
    binding,
    sourceDescription,
    formulas: [
      {
        localId: 'result',
        unit: '1',
        functionId: 'fg.add',
        arguments: [
          { kind: 'literal', value: 0 },
          { kind: 'literal', value: 0 },
        ],
        result: 0,
        includeCache: false,
      },
    ],
  });
  const symbol = execution.cso.sections[0].items[0].symbol;
  symbol.valueTree = {
    rootKey: 'left',
    nodes: [
      {
        key: 'left',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.add' },
        funcArgs: [{ key: 'right' }, { key: 'zero' }],
      },
      {
        key: 'right',
        mode: 'FUNCTION',
        funcSpec: { id: 'fg.add' },
        funcArgs: [{ key: 'left' }, { key: 'zero' }],
      },
      { key: 'zero', mode: 'LITERAL', literal: numericLiteral(0) },
    ],
  };
  execution.invocations[0].symbols[0].address.nodeKey = 'left';
  return api.ExecutionPayloadSchema.parse(execution);
};

const malformedOperandExecution = (api) => {
  const execution = clone(contractExecution(api, 'single-success'));
  const item = execution.cso.sections[0].items[1];
  assert.equal(
    item.kind,
    'symbol',
    'single fixture keeps its formula as a symbol',
  );
  item.symbol.valueTree.nodes[2].funcArgs[1].key = 'missing_operand';
  return execution;
};

const bareFormulaExecution = (api) => {
  const execution = clone(contractExecution(api, 'single-success'));
  const item = execution.cso.sections[0].items[1];
  assert.equal(
    item.kind,
    'symbol',
    'single fixture keeps its formula as a symbol',
  );
  item.symbol.valueTree = {
    rootKey: 'root',
    result: cachedNumber(8),
    nodes: [
      {
        key: 'root',
        mode: 'LITERAL',
        literal: numericLiteral(8),
        result: cachedNumber(8),
      },
    ],
  };
  execution.invocations[0].symbols[1].address.nodeKey = 'root';
  return api.ExecutionPayloadSchema.parse(execution);
};

const invalidArityExecution = (api) => {
  const execution = clone(contractExecution(api, 'single-success'));
  const item = execution.cso.sections[0].items[1];
  assert.equal(
    item.kind,
    'symbol',
    'single fixture keeps its formula as a symbol',
  );
  item.symbol.valueTree.nodes[2].funcArgs.pop();
  return api.ExecutionPayloadSchema.parse(execution);
};

const unsupportedExecution = (api) => {
  const execution = clone(contractExecution(api, 'single-success'));
  const definition = execution.invocations[0].symbols[1];
  execution.invocations[0].symbols[1] = {
    symbolId: definition.symbolId,
    localId: definition.localId,
    variableName: definition.variableName,
    definitionLocation: definition.definitionLocation,
    kind: 'unsupported',
    reason: 'documented_result',
  };
  execution.observations[1].kind = 'unsupported';
  return api.ExecutionPayloadSchema.parse(execution);
};

const detachedFormulaExecution = (api) => {
  const execution = clone(contractExecution(api, 'single-success'));
  const section = execution.cso.sections[0];
  const [input, formula] = section.items;
  assert(input && formula, 'single fixture contains input and formula symbols');
  section.items = [input];
  execution.cso.detachedItems = [formula];
  return api.ExecutionPayloadSchema.parse(execution);
};

for (const [apiName, api] of [
  ['ESM', esm],
  ['CJS', cjs],
]) {
  assert.equal(
    typeof api.verifyExecution,
    'function',
    `${apiName} verifier export`,
  );
  assert(api.VerificationReportSchema, `${apiName} report schema export`);

  for (const value of [0, -0]) {
    const sourceDescription =
      'Synthetic signed-zero case: result = x * factor.';
    const binding = {
      ...standaloneBinding(api, 'zero.cso.py', 'calculate', sourceDescription),
      resolvedInputs: { x: value, factor: 2 },
    };
    const execution = makeExecution(api, {
      binding,
      sourceDescription,
      formulas: [
        {
          localId: 'result',
          unit: '1',
          functionId: 'fg.multiply',
          arguments: [
            { kind: 'symbol', localId: 'x' },
            { kind: 'symbol', localId: 'factor' },
          ],
          result: value,
        },
      ],
    });
    assert(Object.is(execution.entry.resolvedInputs.x, value));
    const matching = api.ReferenceCaseSchema.parse({
      id: 'matching',
      revision: '1',
      basis: { method: 'Arithmetic', derivation: 'x * 2', sourceDescription },
      binding: { ...binding, resolvedInputs: { factor: 2, x: value } },
      // Result tolerance accepts the other zero sign; binding identity does not.
      expected: [
        { symbolId: sourceSymbolId(api, 'result'), value: -value, unit: '1' },
      ],
    });
    const opposite = clone(matching);
    opposite.id = 'opposite';
    opposite.binding.resolvedInputs.x = -value;
    assert.equal(
      api.executionBindingKey(binding),
      api.referenceBindingKey(matching.binding),
    );
    assert.notEqual(
      api.executionBindingKey(binding),
      api.referenceBindingKey(opposite.binding),
    );
    api.BoundReferenceCaseSchema.parse({ execution, referenceCase: matching });
    const unbound = api.BoundReferenceCaseSchema.safeParse({
      execution,
      referenceCase: opposite,
    });
    assert.equal(unbound.success, false);
    assert(
      api
        .contractIssuesToDiagnostics(unbound.error.issues)
        .some(({ code }) => code === 'REFERENCE_BINDING_MISMATCH'),
    );
    const file = api.ReferenceFileSchema.parse({
      referenceVersion: '1',
      cases: [opposite, matching],
    });
    assert.equal(file.cases.length, 2, 'Both zero signs coexist in one file');
    for (const referenceCases of [
      [matching],
      file.cases,
      [...file.cases].reverse(),
    ]) {
      const matched = report(api, `${apiName} same-sign reference`, {
        execution,
        referenceCases,
      });
      expectPassed(
        matched,
        'Same-sign input with opposite-sign expected result',
      );
      assert.deepEqual(matched.checks.independentReferenceAgreement, {
        status: 'passed',
        counts: { checked: 1, passed: 1, failed: 0 },
      });
    }
    const unmatched = report(api, `${apiName} opposite-sign reference`, {
      execution,
      referenceCases: [opposite],
    });
    expectPassed(unmatched, 'Source consistency without a matching reference');
    assert.deepEqual(unmatched.checks.independentReferenceAgreement, {
      status: 'not_applicable',
      counts: { checked: 0, passed: 0, failed: 0 },
    });
    const duplicate = { ...matching, id: 'duplicate', binding };
    const invalidFile = api.ReferenceFileSchema.safeParse({
      referenceVersion: '1',
      cases: [matching, duplicate],
    });
    assert.equal(invalidFile.success, false);
    assert(
      api
        .contractIssuesToDiagnostics(invalidFile.error.issues)
        .some(({ code }) => code === 'DUPLICATE_REFERENCE_BINDING'),
    );
    const duplicated = report(api, `${apiName} duplicate same-sign reference`, {
      execution,
      referenceCases: [matching, duplicate],
    });
    expectFailure(
      duplicated,
      'independentReferenceAgreement',
      'DUPLICATE_REFERENCE_BINDING',
      'Same-sign duplicate is invalid',
    );
  }
  process.stdout.write(
    `PASS ${apiName} signed-zero binding identity, coexistence, duplicates and reference matching\n`,
  );

  for (const name of [
    'single-success',
    'repeated-nested-success',
    'two-panel-success',
    'child-defaults-success',
  ]) {
    const passed = report(api, `${apiName} ${name}`, {
      execution: contractExecution(api, name),
    });
    expectPassed(passed, `${apiName} ${name}`);
    assert.equal(
      passed.checks.independentReferenceAgreement.status,
      'not_applicable',
      `${apiName} ${name} has no invented reference pass`,
    );
  }

  const arithmeticReference = api.ReferenceFileSchema.parse(
    read('verifier-cases', 'arithmetic-reference-cases'),
  );
  for (const referenceCase of arithmeticReference.cases) {
    assert.equal(
      sourceHash(referenceCase.basis.sourceDescription),
      referenceCase.binding.entrySourceHash,
      `${apiName} ${referenceCase.id} has a known synthetic source hash`,
    );
    assert.equal(
      api.sourceClosureHash([
        {
          moduleId: referenceCase.binding.entryModuleId,
          sha256: referenceCase.binding.entrySourceHash,
        },
      ]),
      referenceCase.binding.sourceClosureHash,
      `${apiName} ${referenceCase.id} binds its complete source closure`,
    );
    const execution = arithmeticExecution(api, referenceCase);
    assert.deepEqual(
      execution.invocations[0].symbols
        .filter((symbol) => symbol.kind === 'formula')
        .map((symbol) => symbol.address.nodeKey),
      referenceCase.expected.map(() => 'root'),
      `${apiName} ${referenceCase.id} keeps same-key formula nodes qualified by symbol`,
    );
    const passed = report(api, `${apiName} ${referenceCase.id}`, {
      execution,
      referenceCases: arithmeticReference.cases,
    });
    expectPassed(passed, `${apiName} ${referenceCase.id}`);
    assert.equal(
      passed.checks.independentReferenceAgreement.status,
      'passed',
      `${apiName} ${referenceCase.id} independent agreement`,
    );
    assert.equal(
      passed.checks.formulaConsistency.counts.checked,
      referenceCase.expected.length,
      `${apiName} ${referenceCase.id} evaluates every hand-derived calculated symbol`,
    );
  }

  const completeReference = api.ReferenceFileSchema.parse(
    read('contract-cases', 'reference-cases'),
  );
  const complete = report(api, `${apiName} complete reference`, {
    execution: contractExecution(api, 'two-panel-success'),
    referenceCases: completeReference.cases,
  });
  expectPassed(complete, `${apiName} complete reference`);
  assert.equal(
    complete.checks.independentReferenceAgreement.status,
    'passed',
    `${apiName} complete reference agreement`,
  );

  for (const [name, code] of [
    ['wrong-runtime', 'FORMULA_MISMATCH'],
    ['wrong-cache', 'CACHE_MISMATCH'],
  ]) {
    const failed = report(api, `${apiName} ${name}`, {
      execution: contractExecution(api, name),
    });
    const found = expectFailure(
      failed,
      'formulaConsistency',
      code,
      `${apiName} ${name}`,
    );
    if (name === 'wrong-runtime') {
      assert.deepEqual(found.comparison, {
        actual: 999,
        expected: 8,
        absoluteError: 991,
        absoluteTolerance: 1e-9,
        relativeTolerance: 1e-12,
      });
    } else {
      assert.equal(
        failed.checks.formulaConsistency.cacheCounts.failed,
        1,
        `${apiName} cache mismatch has cache-only coverage`,
      );
    }
  }

  for (const kind of ['parameter', 'literal', 'constant']) {
    for (const mode of ['FUNCTION', 'SYMBOL']) {
      const execution = clone(contractExecution(api, 'single-success'));
      const invocation = execution.invocations[0];
      const definition = invocation.symbols.find(
        (item) => item.kind === 'input',
      );
      const width = execution.cso.sections
        .flatMap((section) => section.items)
        .find(
          (item) =>
            item.kind === 'symbol' && item.symbol.id === definition.symbolId,
        ).symbol;
      if (kind === 'constant') {
        invocation.symbols = invocation.symbols.map((item) =>
          item === definition
            ? {
                symbolId: item.symbolId,
                localId: item.localId,
                variableName: item.variableName,
                definitionLocation: item.definitionLocation,
                kind: 'constant',
                literal: { value: 2, location: item.definitionLocation },
              }
            : item,
        );
        execution.observations.find(
          (item) => item.symbolId === definition.symbolId,
        ).kind = 'constant';
      } else if (kind === 'literal') {
        definition.givenSource = {
          kind: 'literal',
          value: 2,
          location: definition.definitionLocation,
        };
      }
      const rootKey = width.valueTree.rootKey;
      if (mode === 'FUNCTION') {
        width.valueTree.nodes = [
          { key: 'one', mode: 'LITERAL', literal: numericLiteral(1) },
          {
            key: rootKey,
            mode: 'FUNCTION',
            funcSpec: { id: 'fg.add' },
            funcArgs: [{ key: 'one' }, { key: 'one' }],
            result: cachedNumber(2),
          },
        ];
      } else {
        const area = execution.cso.sections
          .flatMap((section) => section.items)
          .find(
            (item) =>
              item.kind === 'symbol' && item.symbol.id !== definition.symbolId,
          ).symbol;
        const areaDefinition = invocation.symbols.find(
          (item) => item.symbolId === area.id,
        );
        invocation.symbols = invocation.symbols.map((item) =>
          item === areaDefinition
            ? {
                symbolId: item.symbolId,
                localId: item.localId,
                variableName: item.variableName,
                definitionLocation: item.definitionLocation,
                kind: 'constant',
                literal: { value: 2, location: item.definitionLocation },
              }
            : item,
        );
        const observation = execution.observations.find(
          (item) => item.symbolId === area.id,
        );
        observation.kind = 'constant';
        observation.value = 2;
        area.valueTree.nodes = [
          {
            key: area.valueTree.rootKey,
            mode: 'LITERAL',
            literal: numericLiteral(2),
            result: cachedNumber(2),
          },
        ];
        area.valueTree.result = cachedNumber(2);
        width.valueTree.nodes = [
          {
            key: rootKey,
            mode: 'SYMBOL',
            symbol: { id: area.id },
            result: cachedNumber(2),
          },
        ];
      }
      const failed = report(api, `${apiName} computed ${kind} ${mode} root`, {
        execution: api.ExecutionPayloadSchema.parse(execution),
      });
      const check =
        kind === 'constant' ? 'constantConsistency' : 'inputConsistency';
      const found = expectFailure(
        failed,
        check,
        'SOURCE_VALUE_GRAPH_MISMATCH',
        `${apiName} source graph shape`,
      );
      assert.equal(found.symbolId, definition.symbolId);
      assert.equal(found.invocationId, 'root');
      assert.deepEqual(found.location, definition.definitionLocation);
      assert.equal(failed.checks[check].cacheCounts.failed, 0);
    }
  }

  const callerReferences = clone(contractExecution(api, 'two-panel-success'));
  const callerSymbols = callerReferences.cso.sections
    .flatMap((section) => section.items)
    .filter((item) => item.kind === 'symbol')
    .map((item) => item.symbol);
  let callerReferenceCount = 0;
  for (const invocation of callerReferences.invocations) {
    for (const definition of invocation.symbols) {
      if (
        definition.kind !== 'input' ||
        definition.givenSource.kind !== 'parameter'
      )
        continue;
      const binding = invocation.inputBindings.find(
        (item) => item.parameterName === definition.givenSource.parameterName,
      );
      if (binding?.kind !== 'callerSymbol') continue;
      const symbol = callerSymbols.find(
        (item) => item.id === definition.symbolId,
      );
      const root = symbol.valueTree.nodes.find(
        (item) => item.key === symbol.valueTree.rootKey,
      );
      root.mode = 'SYMBOL';
      root.literal = undefined;
      root.symbol = { id: binding.source.symbolId };
      callerReferenceCount += 1;
    }
  }
  assert.equal(callerReferenceCount, 7);
  expectPassed(
    report(api, `${apiName} exact caller references`, {
      execution: api.ExecutionPayloadSchema.parse(callerReferences),
    }),
    `${apiName} exact caller references`,
  );
  const wrongCaller = clone(callerReferences);
  const childWidthId = api.namespacedId('symbol', 'root/panel_a', 'width');
  const equivalentChildId = api.namespacedId('symbol', 'root/panel_b', 'width');
  const wrongSymbol = wrongCaller.cso.sections
    .flatMap((section) => section.items)
    .find(
      (item) => item.kind === 'symbol' && item.symbol.id === childWidthId,
    ).symbol;
  wrongSymbol.valueTree.nodes.find(
    (item) => item.key === wrongSymbol.valueTree.rootKey,
  ).symbol.id = equivalentChildId;
  const wrongCallerReport = report(api, `${apiName} equivalent wrong caller`, {
    execution: api.ExecutionPayloadSchema.parse(wrongCaller),
  });
  assert.equal(
    expectFailure(
      wrongCallerReport,
      'inputConsistency',
      'SOURCE_VALUE_GRAPH_MISMATCH',
      `${apiName} wrong caller`,
    ).symbolId,
    childWidthId,
  );
  assert.equal(wrongCallerReport.checks.inputConsistency.cacheCounts.failed, 0);

  const missingBinding = clone(contractExecution(api, 'single-success'));
  missingBinding.invocations[0].inputBindings = [];
  const missingBindingReport = report(api, `${apiName} missing input binding`, {
    execution: missingBinding,
  });
  const missingBindingDiagnostic = diagnostic(
    missingBindingReport,
    'MISSING_INPUT_BINDING',
  );
  const missingBindingDefinition = missingBinding.invocations[0].symbols.find(
    (definition) => definition.kind === 'input',
  );
  assert(missingBindingDefinition, `${apiName} missing binding has a consumer`);
  assert.equal(
    missingBindingDiagnostic.symbolId,
    missingBindingDefinition.symbolId,
  );
  assert.equal(missingBindingDiagnostic.invocationId, 'root');
  assert.deepEqual(
    missingBindingDiagnostic.location,
    missingBindingDefinition.definitionLocation,
  );
  const sharedMissingBinding = clone(missingBinding);
  const sharedRoot = sharedMissingBinding.invocations[0];
  const sharedWidth = sharedRoot.symbols.find(
    (definition) => definition.kind === 'input',
  );
  const sharedArea = sharedRoot.symbols.find(
    (definition) => definition.kind === 'formula',
  );
  assert(
    sharedWidth && sharedArea,
    `${apiName} shared consumer definitions exist`,
  );
  sharedRoot.symbols = sharedRoot.symbols.map((definition) =>
    definition.symbolId === sharedArea.symbolId
      ? {
          ...sharedWidth,
          symbolId: sharedArea.symbolId,
          localId: sharedArea.localId,
          variableName: sharedArea.variableName,
          definitionLocation: sharedArea.definitionLocation,
        }
      : definition,
  );
  const sharedSymbols = sharedMissingBinding.cso.sections
    .flatMap((section) => section.items)
    .filter((item) => item.kind === 'symbol')
    .map((item) => item.symbol);
  const widthGraph = sharedSymbols.find(
    (symbol) => symbol.id === sharedWidth.symbolId,
  );
  const areaGraph = sharedSymbols.find(
    (symbol) => symbol.id === sharedArea.symbolId,
  );
  assert(widthGraph && areaGraph, `${apiName} shared consumer graphs exist`);
  areaGraph.valueTree = clone(widthGraph.valueTree);
  const areaObservation = sharedMissingBinding.observations.find(
    (observation) => observation.symbolId === sharedArea.symbolId,
  );
  assert(areaObservation, `${apiName} shared consumer observation exists`);
  areaObservation.kind = 'input';
  areaObservation.value = 2;
  sharedRoot.resolvedInputs.unused = 3;
  sharedMissingBinding.entry.resolvedInputs.unused = 3;
  const sharedReport = report(
    api,
    `${apiName} shared and unused missing bindings`,
    { execution: sharedMissingBinding },
  );
  const sharedDiagnostics = sharedReport.diagnostics.filter(
    (item) => item.code === 'MISSING_INPUT_BINDING',
  );
  assert.equal(sharedDiagnostics.length, 3);
  for (const definition of sharedRoot.symbols) {
    const found = sharedDiagnostics.find(
      (item) => item.symbolId === definition.symbolId,
    );
    assert(found, `${apiName} shared missing binding consumer context`);
    assert.equal(found.invocationId, 'root');
    assert.deepEqual(found.location, definition.definitionLocation);
  }
  const unusedDiagnostic = sharedDiagnostics.find(
    (item) => item.symbolId === undefined,
  );
  assert(unusedDiagnostic, `${apiName} unused binding stays unqualified`);
  assert.equal(unusedDiagnostic.location, undefined);

  const missingObservations = clone(contractExecution(api, 'single-success'));
  missingObservations.observations = [];
  const missingObservationReport = report(
    api,
    `${apiName} missing observations`,
    { execution: missingObservations },
  );
  const missingDiagnostics = missingObservationReport.diagnostics.filter(
    (item) => item.code === 'MISSING_OBSERVATION',
  );
  assert.equal(missingDiagnostics.length, 2);
  for (const definition of missingObservations.invocations[0].symbols) {
    const missing = missingDiagnostics.find(
      (item) => item.symbolId === definition.symbolId,
    );
    assert(missing, `${apiName} omitted symbol observation context`);
    assert.equal(missing.invocationId, 'root');
    assert.deepEqual(missing.location, definition.definitionLocation);
  }
  const missingDefinitions = clone(contractExecution(api, 'single-success'));
  const definitionsBeforeRemoval = missingDefinitions.invocations[0].symbols;
  missingDefinitions.invocations[0].symbols = [];
  const missingDefinitionReport = report(
    api,
    `${apiName} missing definitions`,
    { execution: missingDefinitions },
  );
  for (const definition of definitionsBeforeRemoval) {
    const missing = missingDefinitionReport.diagnostics.find(
      (item) =>
        item.code === 'MISSING_SYMBOL_DEFINITION' &&
        item.symbolId === definition.symbolId,
    );
    assert(missing, `${apiName} missing definition retains CSO context`);
    assert.equal(missing.invocationId, 'root');
    assert.deepEqual(missing.location, definition.definitionLocation);
  }

  const addressTamper = clone(contractExecution(api, 'single-success'));
  const addressRoot = addressTamper.invocations.find(
    (item) => item.id === 'root',
  );
  const addressDefinition = addressRoot?.symbols.find(
    (item) => item.kind === 'formula',
  );
  assert(addressDefinition, `${apiName} formula definition exists`);
  addressDefinition.address.nodeKey = 'missing';
  const addressReport = report(api, `${apiName} invalid definition address`, {
    execution: addressTamper,
  });
  const addressDiagnostic = diagnostic(addressReport, 'UNKNOWN_NODE_ADDRESS');
  assert.equal(addressDiagnostic.symbolId, addressDefinition.symbolId);
  assert.equal(addressDiagnostic.nodeKey, 'missing');
  assert.equal(addressDiagnostic.invocationId, 'root');
  assert.deepEqual(
    addressDiagnostic.location,
    addressDefinition.definitionLocation,
  );

  const bindingTamper = clone(contractExecution(api, 'single-success'));
  const bindingRoot = bindingTamper.invocations.find(
    (item) => item.id === 'root',
  );
  assert(bindingRoot, `${apiName} root invocation exists`);
  bindingTamper.entry.resolvedInputs.width = 3;
  bindingRoot.resolvedInputs.width = 3;
  const bindingReport = report(api, `${apiName} failed binding symbol`, {
    execution: api.ExecutionPayloadSchema.parse(bindingTamper),
  });
  const bindingDiagnostic = bindingReport.diagnostics.find(
    (item) =>
      item.code === 'INPUT_MISMATCH' &&
      item.message.startsWith('Resolved input'),
  );
  assert(bindingDiagnostic, `${apiName} failed binding diagnostic exists`);
  assert.equal(bindingDiagnostic.symbolId, sourceSymbolId(api, 'width'));
  assert.equal(bindingDiagnostic.invocationId, 'root');
  assert.equal(bindingDiagnostic.comparison.actual, 3);
  assert.equal(bindingDiagnostic.comparison.expected, 2);

  for (const mutual of [false, true]) {
    const cyclicInputs = clone(contractExecution(api, 'two-panel-success'));
    const parentId = api.namespacedId('symbol', 'root', 'width');
    const childId = api.namespacedId('symbol', 'root/panel_a', 'width');
    const replacements = mutual
      ? [
          [parentId, childId],
          [childId, parentId],
        ]
      : [[parentId, parentId]];
    for (const [symbolId, targetId] of replacements) {
      const symbol = cyclicInputs.cso.sections
        .flatMap((section) => section.items)
        .find(
          (item) => item.kind === 'symbol' && item.symbol.id === symbolId,
        )?.symbol;
      assert(symbol, `${apiName} cycle input exists`);
      const root = symbol.valueTree.nodes.find(
        (node) => node.key === symbol.valueTree.rootKey,
      );
      assert(root, `${apiName} cycle input root exists`);
      root.mode = 'SYMBOL';
      root.literal = undefined;
      root.symbol = { id: targetId };
    }
    const cyclicReport = report(api, `${apiName} coherent input cycle`, {
      execution: api.ExecutionPayloadSchema.parse(cyclicInputs),
    });
    assert.equal(cyclicReport.ok, false);
    assert.equal(
      cyclicReport.checks.sourceToDocumentConsistency.status,
      'failed',
    );
    diagnostic(cyclicReport, 'FORMULA_CYCLE');
  }

  const inputTamper = clone(contractExecution(api, 'two-panel-success'));
  const childInput = inputTamper.observations.find(
    (observation) =>
      observation.invocationId === 'root/panel_a' &&
      observation.kind === 'input',
  );
  assert(childInput, `${apiName} child input evidence exists`);
  childInput.value = 999;
  const tamperedGiven = report(api, `${apiName} tampered child given`, {
    execution: api.ExecutionPayloadSchema.parse(inputTamper),
  });
  const givenDiagnostic = expectFailure(
    tamperedGiven,
    'inputConsistency',
    'INPUT_MISMATCH',
    `${apiName} tampered child given`,
  );
  assert.equal(givenDiagnostic.invocationId, 'root/panel_a');
  assert(
    givenDiagnostic.location,
    `${apiName} child given reports its source location`,
  );
  assert.equal(
    givenDiagnostic.callChain?.length,
    1,
    `${apiName} child given retains the caller binding site`,
  );

  const missingOperand = malformedOperandExecution(api);
  assert.equal(
    api.ExecutionPayloadSchema.safeParse(missingOperand).success,
    false,
    `${apiName} missing operand is a boundary-invalid execution`,
  );
  const missingOperandReport = report(api, `${apiName} missing operand`, {
    execution: missingOperand,
  });
  expectFailure(
    missingOperandReport,
    'executionValidity',
    'MISSING_FORMULA_OPERAND',
    `${apiName} missing operand`,
  );

  for (const [label, execution, code] of [
    ['cycle', cyclicExecution(api), 'FORMULA_CYCLE'],
    ['invalid arity', invalidArityExecution(api), 'INVALID_FUNCTION_ARITY'],
    [
      'unsafe intermediate with safe final',
      unsafeIntermediateExecution(api),
      'UNSUPPORTED_NUMERIC_RANGE',
    ],
    ['documented result', unsupportedExecution(api), 'UNSUPPORTED_RESULT'],
    ['omitted formula', bareFormulaExecution(api), 'OMITTED_FORMULA'],
  ]) {
    const failed = report(api, `${apiName} ${label}`, { execution });
    expectFailure(failed, 'formulaConsistency', code, `${apiName} ${label}`);
  }

  const detached = report(api, `${apiName} detached render formula`, {
    execution: detachedFormulaExecution(api),
  });
  expectPassed(detached, `${apiName} detached render formula`);
  assert.equal(
    detached.checks.formulaConsistency.counts.checked,
    1,
    `${apiName} evaluates a formula outside render roots`,
  );

  const nonFinite = clone(contractExecution(api, 'single-success'));
  nonFinite.observations[1].value = Number.POSITIVE_INFINITY;
  assert.equal(
    api.ExecutionPayloadSchema.safeParse(nonFinite).success,
    false,
    `${apiName} non-finite evidence fails the protocol boundary`,
  );
  const nonFiniteReport = report(api, `${apiName} non-finite evidence`, {
    execution: nonFinite,
  });
  expectFailure(
    nonFiniteReport,
    'executionValidity',
    'NON_FINITE_NUMBER',
    `${apiName} non-finite evidence`,
  );
  const nonNumeric = clone(contractExecution(api, 'single-success'));
  nonNumeric.observations[1].value = 'not-a-number';
  assert.equal(
    api.ExecutionPayloadSchema.safeParse(nonNumeric).success,
    false,
    `${apiName} nonnumeric evidence fails the protocol boundary`,
  );
  const nonNumericReport = report(api, `${apiName} nonnumeric evidence`, {
    execution: nonNumeric,
  });
  expectFailure(
    nonNumericReport,
    'executionValidity',
    'NONNUMERIC_RESULT',
    `${apiName} nonnumeric evidence`,
  );

  const referenceExecution = contractExecution(api, 'two-panel-success');
  for (const [name, code] of [
    ['reference-missing-output', 'MISSING_REFERENCE_SYMBOL'],
    ['reference-unknown-output', 'UNKNOWN_REFERENCE_SYMBOL'],
    ['reference-wrong-unit', 'REFERENCE_UNIT_MISMATCH'],
    ['reference-wrong-value', 'REFERENCE_FORMULA_MISMATCH'],
  ]) {
    const referenceCases = api.ReferenceFileSchema.parse(
      read('contract-cases', name),
    ).cases;
    if (name === 'reference-wrong-value') {
      assert.equal(
        referenceCases[0].expected.find(
          (item) => item.symbolId === '["symbol","root","mass"]',
        ).value,
        701,
        `${apiName} reference mismatch is the independently stated 701 value`,
      );
    }
    const failed = report(api, `${apiName} ${name}`, {
      execution: referenceExecution,
      referenceCases,
    });
    expectFailure(
      failed,
      'independentReferenceAgreement',
      code,
      `${apiName} ${name}`,
    );
    if (
      name === 'reference-wrong-unit' ||
      name === 'reference-missing-output'
    ) {
      const rowDiagnostic = diagnostic(failed, code);
      assert.equal(typeof rowDiagnostic.symbolId, 'string');
      const owner = referenceExecution.invocations.find((invocation) =>
        invocation.symbols.some(
          (symbol) => symbol.symbolId === rowDiagnostic.symbolId,
        ),
      );
      const definition = owner?.symbols.find(
        (symbol) => symbol.symbolId === rowDiagnostic.symbolId,
      );
      assert(definition, `${apiName} reference row has a definition`);
      assert.equal(rowDiagnostic.invocationId, owner.id);
      assert.deepEqual(rowDiagnostic.location, definition.definitionLocation);
    }
    assert.equal(
      failed.checks.sourceToDocumentConsistency.status,
      'passed',
      `${apiName} ${name} keeps source consistency separate`,
    );
  }

  for (const staleBinding of [false, true]) {
    const duplicateCase = clone(completeReference.cases[0]);
    const duplicateRow = clone(duplicateCase.expected[0]);
    duplicateCase.expected.push(duplicateRow);
    if (staleBinding) duplicateCase.binding.sourceClosureHash = '0'.repeat(64);
    const duplicateReport = report(api, `${apiName} duplicate reference row`, {
      execution: referenceExecution,
      referenceCases: [duplicateCase],
    });
    const duplicateDiagnostic = diagnostic(
      duplicateReport,
      'DUPLICATE_REFERENCE_SYMBOL',
    );
    assert.equal(duplicateDiagnostic.symbolId, duplicateRow.symbolId);
    const owner = referenceExecution.invocations.find((invocation) =>
      invocation.symbols.some(
        (symbol) => symbol.symbolId === duplicateRow.symbolId,
      ),
    );
    const definition = owner?.symbols.find(
      (symbol) => symbol.symbolId === duplicateRow.symbolId,
    );
    assert(definition, `${apiName} duplicate row definition exists`);
    assert.equal(
      duplicateDiagnostic.invocationId,
      staleBinding ? undefined : owner.id,
    );
    assert.deepEqual(
      duplicateDiagnostic.location,
      staleBinding ? undefined : definition.definitionLocation,
    );
  }

  const staleCase = clone(completeReference.cases[0]);
  staleCase.binding.sourceClosureHash = '0'.repeat(64);
  const stale = report(api, `${apiName} stale reference`, {
    execution: referenceExecution,
    referenceCases: [staleCase],
  });
  expectPassed(stale, `${apiName} stale reference`);
  assert.equal(
    stale.checks.independentReferenceAgreement.status,
    'not_applicable',
    `${apiName} stale reference is not an invented pass`,
  );
  const absent = report(api, `${apiName} absent reference`, {
    execution: referenceExecution,
  });
  expectPassed(absent, `${apiName} absent reference`);
  assert.equal(
    absent.checks.independentReferenceAgreement.status,
    'not_applicable',
    `${apiName} absent reference is not applicable`,
  );
}

process.stdout.write(
  'PASS verifier ESM/CJS fixtures, independent arithmetic references, evaluator failures and public reports\n',
);
