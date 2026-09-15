import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as esm from '@cs-object/core';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const read = (name) =>
  JSON.parse(readFileSync(new URL(`./${name}.json`, import.meta.url), 'utf8'));
for (const api of [esm, require('@cs-object/core')]) {
  for (const name of [
    'single-success',
    'repeated-nested-success',
    'two-panel-success',
    'two-panel-width-1',
    'child-defaults-success',
    'wrong-runtime',
    'wrong-cache',
  ]) {
    assert.equal(api.ExecutionResponseSchema.parse(read(name)).ok, true, name);
  }
  const rejected = (schema, name, code) => {
    const parsed = schema.safeParse(read(name));
    assert.equal(parsed.success, false, name);
    assert(
      api
        .contractIssuesToDiagnostics(parsed.error.issues)
        .some((diagnostic) => diagnostic.code === code),
      `${name} must report ${code}`,
    );
  };
  rejected(
    api.ExecutionResponseSchema,
    'missing-observation',
    'MISSING_OBSERVATION',
  );
  rejected(
    api.ExecutionResponseSchema,
    'ambiguous-node-address',
    'SCHEMA_INVALID_TYPE',
  );
  rejected(
    api.ExecutionResponseSchema,
    'unsafe-observation',
    'UNSUPPORTED_NUMERIC_RANGE',
  );
  rejected(api.CommandReportSchema, 'false-inspection', 'SCHEMA_INVALID_VALUE');
  assert.equal(
    api.ExecutionResponseSchema.parse(read('structured-execution-failure')).ok,
    false,
  );
  assert.equal(
    api.ExecutionResponseSchema.parse(read('wrong-runtime')).execution
      .observations[1].value,
    999,
    'Parsing preserves the wrong observed return for the verifier',
  );
  assert.equal(
    api.ExecutionResponseSchema.parse(read('wrong-cache')).execution.cso
      .sections[0].items[1].symbol.valueTree.nodes[2].result.value,
    999,
    'Parsing preserves the wrong cache for the verifier',
  );

  const execution = api.ExecutionResponseSchema.parse(
    read('two-panel-success'),
  ).execution;
  const sourceResponse = read('repeated-nested-success');
  const sourceMetadata = sourceResponse.execution.cso.sections[0].metadata;
  Object.defineProperty(sourceMetadata, '__proto__', {
    value: { retained: true },
    enumerable: true,
  });
  Object.defineProperty(sourceMetadata, 'constructor', {
    value: { retained: true },
    enumerable: true,
  });
  const parsedSourceMetadata = api.ExecutionResponseSchema.parse(sourceResponse)
    .execution.cso.sections[0].metadata;
  assert.equal(Object.hasOwn(parsedSourceMetadata, '__proto__'), true);
  assert.equal(Object.hasOwn(parsedSourceMetadata, 'constructor'), true);
  assert.equal(
    Object.getPrototypeOf(parsedSourceMetadata),
    Object.prototype,
  );
  const reference = api.ReferenceFileSchema.parse(read('reference-cases'));
  assert.equal(reference.cases[0].expected.length, 9);
  assert.equal(
    execution.invocations
      .flatMap((invocation) => invocation.symbols)
      .filter((symbol) => symbol.kind === 'input').length,
    12,
  );
  api.BoundReferenceCaseSchema.parse({
    execution,
    referenceCase: reference.cases[0],
  });
  api.BoundReferenceCaseSchema.parse({
    execution: api.ExecutionResponseSchema.parse(read('two-panel-width-1'))
      .execution,
    referenceCase: reference.cases[1],
  });
  for (const [name, code] of [
    ['reference-missing-output', 'MISSING_REFERENCE_SYMBOL'],
    ['reference-unknown-output', 'UNKNOWN_REFERENCE_SYMBOL'],
    ['reference-wrong-unit', 'REFERENCE_UNIT_MISMATCH'],
  ]) {
    const file = api.ReferenceFileSchema.parse(read(name));
    const parsed = api.BoundReferenceCaseSchema.safeParse({
      execution,
      referenceCase: file.cases[0],
    });
    assert.equal(parsed.success, false, name);
    assert(
      api
        .contractIssuesToDiagnostics(parsed.error.issues)
        .some((diagnostic) => diagnostic.code === code),
      name,
    );
  }
  const wrongValue = api.ReferenceFileSchema.parse(
    read('reference-wrong-value'),
  ).cases[0];
  assert.equal(
    api.BoundReferenceCaseSchema.parse({ execution, referenceCase: wrongValue })
      .referenceCase.expected[8].value,
    701,
    'Coverage validation does not compare numbers',
  );
  const reordered = structuredClone(reference.cases[0]);
  reordered.binding.resolvedInputs = Object.fromEntries(
    Object.entries(reordered.binding.resolvedInputs).reverse(),
  );
  api.BoundReferenceCaseSchema.parse({ execution, referenceCase: reordered });
  assert.equal(
    api.ReferenceFileSchema.safeParse({
      referenceVersion: '1',
      cases: [reference.cases[0], reordered],
    }).success,
    false,
    'Reordered duplicate input bindings fail',
  );
  assert.equal(
    api.VerifyExecutionInputSchema.safeParse({
      execution,
      referenceCases: [reference.cases[0], reordered],
    }).success,
    false,
  );
  assert.equal(
    api.BoundReferenceCaseSchema.safeParse({
      execution,
      referenceCase: reference.cases[1],
    }).success,
    false,
    'Every resolved input binds the reference',
  );
  const changedClosure = structuredClone(reference.cases[0]);
  changedClosure.binding.sourceClosureHash = '0'.repeat(64);
  assert.equal(
    api.BoundReferenceCaseSchema.safeParse({
      execution,
      referenceCase: changedClosure,
    }).success,
    false,
    'Dependency closure binds reference even when values are unchanged',
  );

  const document = api.PreparedDocumentSchema.parse(read('ordered-content'));
  api.BoundPreparedDocumentSchema.parse({ execution, document });
  assert.equal(Object.hasOwn(document, 'sourceMetadata'), false);
  const authoredSourceMetadata = JSON.parse(
    '{"purpose":"Panel estimate","assumptions":["Dry material",{"factor":1.25}],"empty":{},"list":[],"__proto__":{"retained":true},"constructor":"authored","nested":{"__proto__":null,"constructor":[false,3,"text",null]},"review":{"approved":true}}',
  );
  for (const sourceMetadata of [{}, authoredSourceMetadata]) {
    const parsed = api.PreparedDocumentSchema.parse({
      ...document,
      sourceMetadata,
    });
    assert.deepEqual(parsed.sourceMetadata, sourceMetadata);
    assert.equal(
      JSON.stringify(parsed.sourceMetadata),
      JSON.stringify(sourceMetadata),
    );
    assert.deepEqual(parsed.source, document.source);
    assert.deepEqual(parsed.historicalReviews, document.historicalReviews);
    assert.equal(
      Object.getPrototypeOf(parsed.sourceMetadata),
      Object.prototype,
    );
    api.BoundPreparedDocumentSchema.parse({ execution, document: parsed });
  }
  const withSourceMetadata = api.PreparedDocumentSchema.parse({
    ...document,
    sourceMetadata: authoredSourceMetadata,
  });
  assert.equal(
    Object.hasOwn(withSourceMetadata.sourceMetadata, '__proto__'),
    true,
  );
  assert.equal(
    Object.hasOwn(withSourceMetadata.sourceMetadata, 'constructor'),
    true,
  );
  for (const sourceMetadata of [
    null,
    [],
    'metadata',
    4,
    { nested: undefined },
    { nested: Number.NaN },
    { nested: Number.POSITIVE_INFINITY },
    { nested: () => 1 },
    { nested: new Date() },
  ]) {
    const parsed = api.PreparedDocumentSchema.safeParse({
      ...document,
      sourceMetadata,
    });
    assert.equal(parsed.success, false);
    assert(parsed.error.issues.length > 0);
    assert(
      parsed.error.issues.every((issue) => issue.path[0] === 'sourceMetadata'),
    );
  }
  const legacyMetadata = structuredClone(execution.cso);
  legacyMetadata.source.metadata = { nonJsonLegacyValue: Number.NaN };
  assert.equal(
    api.CalculationSourceObjectSchema.safeParse(legacyMetadata).success,
    true,
  );

  const withFigureWidth = (width) => {
    const value = structuredClone(document);
    const figure = value.sections
      .flatMap((section) => section.items)
      .find((item) => item.kind === 'figure');
    assert(figure && figure.kind === 'figure', 'Fixture requires a figure');
    Reflect.set(figure.figure, 'width', width);
    return value;
  };
  const omittedFigure = document.sections
    .flatMap((section) => section.items)
    .find((item) => item.kind === 'figure');
  assert(
    omittedFigure && omittedFigure.kind === 'figure',
    'Fixture requires a figure',
  );
  assert.equal(Object.hasOwn(omittedFigure.figure, 'width'), false);
  for (const width of [0.5, 299.25]) {
    const parsed = api.PreparedDocumentSchema.parse(withFigureWidth(width));
    const figure = parsed.sections
      .flatMap((section) => section.items)
      .find((item) => item.kind === 'figure');
    assert(figure && figure.kind === 'figure', 'Fixture requires a figure');
    assert.equal(figure.figure.width, width);
  }
  for (const width of [
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '299',
  ]) {
    assert.equal(
      api.PreparedDocumentSchema.safeParse(withFigureWidth(width)).success,
      false,
    );
  }
  const documentWithSourceMetadata = api.PreparedDocumentSchema.parse({
    ...document,
    sections: [
      { ...document.sections[0], metadata: parsedSourceMetadata },
      ...document.sections.slice(1),
    ],
  });
  assert.equal(
    JSON.stringify(documentWithSourceMetadata.sections[0].metadata),
    JSON.stringify(parsedSourceMetadata),
    'Prepared sections retain parsed source metadata',
  );
  const acceptedSourceResponse = read('repeated-nested-success');
  acceptedSourceResponse.execution.cso.sections[0].metadata = {
    undefinedValue: undefined,
    nonFiniteValue: Number.NaN,
  };
  assert.deepEqual(
    api.ExecutionResponseSchema.parse(acceptedSourceResponse).execution.cso
      .sections[0].metadata,
    { undefinedValue: undefined, nonFiniteValue: Number.NaN },
  );
  for (const [metadata, received] of [
    [null, 'null'],
    [[], 'array'],
    ['invalid', 'string'],
  ]) {
    const invalidSourceResponse = read('repeated-nested-success');
    invalidSourceResponse.execution.cso.sections[0].metadata = metadata;
    const invalidSourceResult = api.ExecutionResponseSchema.safeParse(
      invalidSourceResponse,
    );
    assert.equal(invalidSourceResult.success, false);
    if (!invalidSourceResult.success) {
      assert.deepEqual(invalidSourceResult.error.issues, [
        {
          expected: 'record',
          code: 'invalid_type',
          path: ['execution', 'cso', 'sections', 0, 'metadata'],
          message: `Invalid input: expected record, received ${received}`,
        },
      ]);
    }
    const customizedSourceResult = api.ExecutionResponseSchema.safeParse(
      invalidSourceResponse,
      {
        error: (issue) =>
          issue.input === metadata
            ? `Custom metadata error: ${received}`
            : 'Custom metadata error lost original input',
      },
    );
    assert.equal(customizedSourceResult.success, false);
    if (!customizedSourceResult.success) {
      assert.deepEqual(customizedSourceResult.error.issues, [
        {
          expected: 'record',
          code: 'invalid_type',
          path: ['execution', 'cso', 'sections', 0, 'metadata'],
          message: `Custom metadata error: ${received}`,
        },
      ]);
    }
  }
  const globalSourceResponse = read('repeated-nested-success');
  globalSourceResponse.execution.cso.sections[0].metadata = null;
  const originalCustomError = z.config().customError;
  const globalInputs = [];
  const callerInputs = [];
  try {
    z.config({
      customError: (issue) => {
        globalInputs.push(issue.input);
        return `Global metadata error: ${globalInputs.length}`;
      },
    });
    const globallyCustomized = api.ExecutionResponseSchema.safeParse(
      globalSourceResponse,
    );
    assert.equal(globallyCustomized.success, false);
    if (!globallyCustomized.success) {
      assert.deepEqual(globallyCustomized.error.issues, [
        {
          expected: 'record',
          code: 'invalid_type',
          path: ['execution', 'cso', 'sections', 0, 'metadata'],
          message: 'Global metadata error: 1',
        },
      ]);
    }
    const callerCustomized = api.ExecutionResponseSchema.safeParse(
      globalSourceResponse,
      {
        error: (issue) => {
          callerInputs.push(issue.input);
          return 'Caller metadata error';
        },
      },
    );
    assert.equal(callerCustomized.success, false);
    if (!callerCustomized.success) {
      assert.deepEqual(callerCustomized.error.issues, [
        {
          expected: 'record',
          code: 'invalid_type',
          path: ['execution', 'cso', 'sections', 0, 'metadata'],
          message: 'Caller metadata error',
        },
      ]);
    }
    assert.deepEqual(globalInputs, [null]);
    assert.deepEqual(callerInputs, [null]);
  } finally {
    z.config({ customError: originalCustomError });
  }
  assert.equal(
    Object.hasOwn(document.sections[0], 'metadata'),
    false,
    'A section without authored metadata stays absent',
  );
  const sectionMetadata = JSON.parse(
    '{"designBasis":"EN 1993","localId":"authored-local","invocationId":"authored/invocation","location":{"file":"authored.cso.py","line":1},"review":{"approved":true},"__proto__":{"retained":true},"nested":{"constructor":4,"__proto__":"retained"},"values":[false,3,null]}',
  );
  const documentWithSectionMetadata = api.PreparedDocumentSchema.parse({
    ...document,
    sections: [
      { ...document.sections[0], metadata: sectionMetadata },
      ...document.sections.slice(1),
    ],
  });
  const parsedSectionMetadata = documentWithSectionMetadata.sections[0].metadata;
  assert.deepEqual(parsedSectionMetadata, sectionMetadata);
  assert.equal(Object.hasOwn(parsedSectionMetadata, '__proto__'), true);
  assert.equal(
    documentWithSectionMetadata.sections[0].localId,
    document.sections[0].localId,
  );
  assert.equal(
    documentWithSectionMetadata.sections[0].invocationId,
    document.sections[0].invocationId,
  );
  assert.deepEqual(
    documentWithSectionMetadata.sections[0].location,
    document.sections[0].location,
  );
  assert.deepEqual(
    documentWithSectionMetadata.historicalReviews,
    document.historicalReviews,
    'Section metadata does not add a review record',
  );
  api.BoundPreparedDocumentSchema.parse({
    execution,
    document: documentWithSectionMetadata,
  });
  assert.equal(
    api.PreparedDocumentSchema.safeParse({
      ...document,
      sections: [
        { ...document.sections[0], metadata: { factor: Number.NaN } },
        ...document.sections.slice(1),
      ],
    }).success,
    false,
    'Section metadata rejects non-finite JSON values',
  );
  assert.equal(
    api.BoundPreparedDocumentSchema.safeParse({
      execution: api.ExecutionResponseSchema.parse(read('two-panel-width-1'))
        .execution,
      document,
    }).success,
    false,
    'Prepared content binds the selected inputs',
  );
  const sections = new Map(
    document.sections.map((section) => [section.id, section]),
  );
  const order = [];
  const visit = (id) => {
    for (const item of sections.get(id).items) {
      order.push(item.sourcePlacementId);
      if (item.kind === 'section') visit(item.id);
    }
  };
  document.rootSectionIds.forEach(visit);
  assert.deepEqual(order, [
    'intro',
    'area-definition',
    'detail-call',
    'diagram',
    'detail-note',
    'area-repeat',
    'summary',
  ]);
  assert.equal(document.historicalReviews[0].scope, 'historical');
  for (const name of [
    'verify-no-reference',
    'pdf-pending-inspection',
    'usage-failure',
    'cache-failure-reference-passed',
  ])
    api.CommandReportSchema.parse(read(name));
  assert.equal(
    api.CommandReportSchema.parse(read('verify-no-reference')).checks
      .independentReferenceAgreement.status,
    'not_applicable',
  );
  assert.equal(
    api.CommandReportSchema.parse(read('pdf-pending-inspection')).checks
      .visualInspection.status,
    'pending',
  );
  const vector = read('source-hash-vector');
  const manifest = vector.manifest
    .map(([moduleId, sha256]) => ({ moduleId, sha256 }))
    .reverse();
  assert.equal(api.serializeSourceManifest(manifest), vector.serializedUtf8);
  assert.equal(api.sourceClosureHash(manifest), vector.sha256);
  assert.equal(
    api.namespacedId('symbol', 'root/panel_a', 'area'),
    vector.namespacedSymbolId,
  );
  assert.equal(
    api.ResolvedInputsSchema.parse(JSON.parse('{"__proto__":2,"width":1}'))
      .__proto__,
    2,
  );
  assert.equal(
    Object.hasOwn(
      api.ResolvedInputsSchema.parse(JSON.parse('{"__proto__":2}')),
      '__proto__',
    ),
    true,
  );
  const comparison = {
    actual: 999,
    expected: 8,
    absoluteError: 991,
    absoluteTolerance: 1e-9,
    relativeTolerance: 1e-12,
  };
  api.ComparisonSchema.parse(comparison);
  assert.equal(
    api.ComparisonSchema.safeParse({ ...comparison, absoluteError: 0 }).success,
    false,
    'Comparison error must agree with compared values',
  );
  const missingCounts = read('verify-no-reference');
  Reflect.deleteProperty(missingCounts.checks.formulaConsistency, 'counts');
  assert.equal(
    api.CommandReportSchema.safeParse(missingCounts).success,
    false,
    'Passed comparisons require positive result counts',
  );
  const wrongStage = read('cache-failure-reference-passed');
  wrongStage.diagnostics[0].stage = 'usage';
  assert.equal(
    api.CommandReportSchema.safeParse(wrongStage).success,
    false,
    'Explicit check attribution still needs its owning stage',
  );
  assert.equal(
    typeof api.verifyExecution,
    'function',
    'Core exports the implemented pure verifier',
  );
}
process.stdout.write(
  'PASS contract ESM/CJS fixtures, evidence coverage, reference identity, ordered content, report states and UTF-8 hashing\n',
);
