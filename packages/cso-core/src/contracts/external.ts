import { z } from 'zod';
import {
  HashSchema,
  ModuleIdSchema,
  PythonIdentifierSchema,
  SourceSpanSchema,
  collectCsoSymbols,
} from './common.ts';
import { NumericValueSchema } from './numbers.ts';
import type {
  ExecutionPayload,
  MethodContentItem,
  MethodHelperRecord,
} from './execution.ts';

const ExternalNumberSchema = NumericValueSchema.superRefine((record, ctx) => {
  if (record.numericKind === 'int' && Object.is(record.value, -0))
    ctx.addIssue({
      code: 'custom',
      path: ['value'],
      message:
        'Captured native Python integers cannot carry a negative-zero sign.',
      params: { diagnosticCode: 'NUMERIC_KIND_MISMATCH' },
    });
});
const ExternalQuantitySchema = ExternalNumberSchema.safeExtend({
  name: z.string().min(1),
  symbolId: z.string().min(1),
  numericType: z.enum(['int', 'float']),
});
const MetadataSchema = z.strictObject({
  glyph: z.string().min(1),
  description: z.string().min(1),
  unit: z.string(),
  comment: z.string().optional(),
  notation_scope: z.string().min(1).optional(),
});
const DeclaredInputsSchema = z.array(
  z.tuple([PythonIdentifierSchema, z.enum(['int', 'float']), MetadataSchema]),
);
const DeclaredOutputsSchema = z.array(
  z.tuple([z.string().min(1), z.enum(['int', 'float']), MetadataSchema]),
);
const ExternalInterfaceSchema = z
  .strictObject({
    path: ModuleIdSchema,
    function: PythonIdentifierSchema,
    description: z.string().refine((value) => value.trim().length > 0),
    inputs: DeclaredInputsSchema,
    outputs: DeclaredOutputsSchema.min(1),
    defaults: z.array(
      ExternalNumberSchema.safeExtend({ name: PythonIdentifierSchema }),
    ),
  })
  .superRefine((declaration, ctx) => {
    const inputNames = declaration.inputs.map((input) => input[0]);
    const outputNames = declaration.outputs.map((output) => output[0]);
    const defaultNames = declaration.defaults.map((input) => input.name);
    if (
      new Set(inputNames).size !== inputNames.length ||
      new Set(outputNames).size !== outputNames.length ||
      new Set(defaultNames).size !== defaultNames.length
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'External declarations require unique input, output and default names',
        params: { diagnosticCode: 'INVALID_EXTERNAL_DECLARATION' },
      });
    for (const [index, value] of declaration.defaults.entries()) {
      const input = declaration.inputs.find((input) => input[0] === value.name);
      if (
        !input ||
        value.numericKind === undefined ||
        (input[1] === 'int' && value.numericKind !== 'int')
      )
        ctx.addIssue({
          code: 'custom',
          path: ['defaults', index],
          message:
            'External defaults must match a declared input and native numeric kind',
          params: { diagnosticCode: 'INVALID_EXTERNAL_DECLARATION' },
        });
    }
  });

export const ExternalCallSchema = z.strictObject({
  id: z.string().min(1),
  parentInvocationId: z.string().min(1),
  callBindingName: PythonIdentifierSchema,
  callSite: SourceSpanSchema,
  declaration: z.strictObject({
    moduleId: ModuleIdSchema,
    name: PythonIdentifierSchema,
    fingerprint: HashSchema,
    location: SourceSpanSchema,
    interface: ExternalInterfaceSchema,
  }),
  adapter: z.strictObject({
    moduleId: ModuleIdSchema,
    sha256: HashSchema,
    function: PythonIdentifierSchema,
  }),
  description: z.string().refine((value) => value.trim().length > 0),
  inputs: z.array(ExternalQuantitySchema),
  outputs: z.array(ExternalQuantitySchema).min(1),
  warnings: z.array(z.string()),
});
export type ExternalCall = z.infer<typeof ExternalCallSchema>;

export const ExternalEnvironmentSchema = z.strictObject({
  pythonVersion: z.string().min(1),
  pythonImplementation: z.string().min(1),
  distributions: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
});

export const methodExternalCalls = (
  content: readonly MethodContentItem[],
): Extract<MethodContentItem, { kind: 'external' }>[] =>
  content.flatMap((item) =>
    item.kind === 'external'
      ? [item]
      : item.kind === 'section'
        ? methodExternalCalls(item.content)
        : [],
  );
const hasExternalMethods = (methods: readonly MethodHelperRecord[]): boolean =>
  methods.some(
    (method) =>
      methodExternalCalls(method.content).length > 0 ||
      hasExternalMethods(method.helpers),
  );

/** Validate the opaque boundary, never the adapter's internal algorithm. */
export function validateExternalCalls(
  execution: ExecutionPayload,
  ctx: z.RefinementCtx,
): void {
  const calls = execution.externalCalls ?? [];
  const staticExternal = hasExternalMethods(execution.methods ?? []);
  const external = calls.length > 0 || staticExternal;
  const invocations = new Map(
    execution.invocations.map((item) => [item.id, item]),
  );
  const symbols = new Map(
    collectCsoSymbols(execution.cso).map((item) => [item.id, item]),
  );
  const seen = new Set<string>();
  const issue = (index: number, message: string) =>
    ctx.addIssue({
      code: 'custom',
      path: ['externalCalls', index],
      message,
      params: { diagnosticCode: 'EXTERNAL_BOUNDARY_MISMATCH' },
    });
  if (
    external !== (execution.cso.schemaVersion === '1.2.0') ||
    external !== (execution.externalCalls !== undefined) ||
    external !== (execution.runId !== undefined) ||
    external !== (execution.environment !== undefined) ||
    staticExternal !== (execution.cso.source.externalMethods === true)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['externalCalls'],
      message:
        'External evidence requires calculation schema 1.2.0, run identity and environment',
      params: { diagnosticCode: 'INCOMPATIBLE_CONTRACT' },
    });
  }
  for (const [index, call] of calls.entries()) {
    const invocation = invocations.get(call.id);
    if (
      seen.has(call.id) ||
      !invocation ||
      !('parentInvocationId' in invocation) ||
      invocation.parentInvocationId !== call.parentInvocationId ||
      invocation.callBindingName !== call.callBindingName ||
      JSON.stringify(invocation.callSite) !== JSON.stringify(call.callSite) ||
      invocation.moduleId !== call.declaration.moduleId ||
      invocation.function !== call.declaration.name ||
      call.declaration.location.moduleId !== call.declaration.moduleId
    ) {
      issue(
        index,
        'External call identity must match its captured invocation, declaration and call site',
      );
      continue;
    }
    seen.add(call.id);
    const declared = call.declaration.interface;
    if (
      declared.path !== call.adapter.moduleId ||
      declared.function !== call.adapter.function ||
      declared.description !== call.description ||
      declared.inputs.length !== call.inputs.length ||
      declared.outputs.length !== call.outputs.length
    )
      issue(
        index,
        'Captured adapter, method and quantities must match the declared interface',
      );
    if (
      !execution.sourceManifest.some(
        (item) =>
          item.moduleId === call.adapter.moduleId &&
          item.sha256 === call.adapter.sha256,
      )
    )
      issue(
        index,
        'External adapter identity must resolve to the captured source manifest',
      );
    const parameters =
      execution.authoring?.parameters.filter(
        (item) => item.invocationId === call.id,
      ) ?? [];
    const defaults = new Map(
      declared.defaults.map((value) => [value.name, value]),
    );
    if (
      defaults.size !== declared.defaults.length ||
      declared.defaults.some(
        (value) =>
          !declared.inputs.some(
            (input) =>
              input[0] === value.name &&
              (input[1] !== 'int' || value.numericKind === 'int'),
          ) || value.numericKind === undefined,
      )
    )
      issue(
        index,
        'External defaults must have unique declared input names and native numeric kinds',
      );
    for (const binding of invocation.inputBindings) {
      if (binding.kind !== 'parsedDefault') continue;
      const value = defaults.get(binding.parameterName);
      if (
        !value ||
        !Object.is(binding.value, value.value) ||
        binding.numericKind !== value.numericKind
      )
        issue(
          index,
          'Resolved external defaults must match their declaration values and kinds',
        );
    }
    const outputs = invocation.symbols.filter(
      (item) => item.kind === 'externalResult',
    );
    if (
      parameters.length !== call.inputs.length ||
      outputs.length !== call.outputs.length
    )
      issue(
        index,
        'External calls must retain every declared input and output',
      );
    for (const [role, quantities] of [
      ['input', call.inputs],
      ['output', call.outputs],
    ] as const) {
      const names = new Set<string>();
      for (const quantity of quantities) {
        const expected = (
          role === 'input' ? declared.inputs : declared.outputs
        )[names.size];
        const symbol = symbols.get(quantity.symbolId);
        const observed = execution.observations.find(
          (item) => item.symbolId === quantity.symbolId,
        );
        if (
          names.has(quantity.name) ||
          !symbol ||
          !observed ||
          !Object.is(observed.value, quantity.value) ||
          observed.numericKind !== quantity.numericKind ||
          quantity.numericKind === undefined ||
          (quantity.numericType === 'int' && quantity.numericKind !== 'int')
        )
          issue(
            index,
            'External quantities require unique names and matching native numeric evidence',
          );
        names.add(quantity.name);
        if (
          !expected ||
          expected[0] !== quantity.name ||
          expected[1] !== quantity.numericType ||
          symbol?.unit !== expected[2].unit
        )
          issue(
            index,
            'External quantities must retain declaration order, type and units',
          );
        if (role === 'input') {
          const parameter = parameters.find(
            (item) => item.parameterName === quantity.name,
          );
          if (
            parameter?.symbolId !== quantity.symbolId ||
            parameter.numericType !== quantity.numericType ||
            !Object.is(
              invocation.resolvedInputs[quantity.name],
              quantity.value,
            ) ||
            invocation.resolvedInputKinds?.[quantity.name] !==
              quantity.numericKind
          )
            issue(
              index,
              'External arguments must match the captured parameter bindings',
            );
        } else {
          if (
            symbol &&
            expected &&
            (symbol.description !== expected[2].description ||
              (symbol.metadata?.authoredGlyph ?? symbol.glyph) !==
                expected[2].glyph ||
              symbol.notationScope !== expected[2].notation_scope ||
              symbol.comment !== (expected[2].comment ?? ''))
          )
            issue(index, 'External outputs must retain the declared metadata');
          const definition = outputs.find(
            (item) => item.symbolId === quantity.symbolId,
          );
          const output = execution.authoring?.outputs.find(
            (item) =>
              item.invocationId === call.id && item.name === quantity.name,
          );
          const literal = symbol?.valueTree.nodes[0];
          if (
            definition?.kind !== 'externalResult' ||
            definition.externalCallId !== call.id ||
            definition.outputName !== quantity.name ||
            JSON.stringify(definition.definitionLocation) !==
              JSON.stringify(call.declaration.location) ||
            output?.symbolId !== quantity.symbolId ||
            !Object.is(output.value, quantity.value) ||
            output.numericKind !== quantity.numericKind ||
            literal?.mode !== 'LITERAL' ||
            literal.literal?.kind !== 'number' ||
            !Object.is(literal.literal.value, quantity.value) ||
            literal.literal.numericKind !== quantity.numericKind ||
            symbol?.valueTree.nodes.length !== 1 ||
            symbol.valueTree.result?.kind !== 'number' ||
            !Object.is(symbol.valueTree.result.value, quantity.value) ||
            symbol.valueTree.result.numericKind !== quantity.numericKind
          )
            issue(
              index,
              'External output must resolve to its own named result, observation and displayed quantity',
            );
        }
      }
    }
  }
  for (const invocation of execution.invocations) {
    for (const definition of invocation.symbols) {
      if (
        definition.kind === 'externalResult' &&
        !calls.some(
          (call) =>
            call.id === invocation.id &&
            call.id === definition.externalCallId &&
            call.outputs.some(
              (output) =>
                output.name === definition.outputName &&
                output.symbolId === definition.symbolId,
            ),
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['externalCalls'],
          message:
            'Every external result must belong to exactly one captured call and output',
          params: { diagnosticCode: 'UNKNOWN_EXTERNAL_RESULT' },
        });
      }
    }
  }
}
