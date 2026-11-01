import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BoundPreparedDocumentSchema,
  CommandReportSchema,
  createSheetFromCalculationSourceObject,
  executionBindingFrom,
  executionBindingKey,
  ExecutionResponseSchema,
  verifyExecution,
} from '@cs-object/core';
import { afterAll, expect, test } from 'vitest';
import {
  prepareExecutionDocument,
  PreparedFormulaSheet,
} from '@cs-object/react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const directory = mkdtempSync(join(tmpdir(), 'cso-external-integration-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const python = process.env.PYTHON ?? 'python3';
const cli = join(import.meta.dirname, '../../packages/cso-cli/dist/cli.js');

writeFileSync(
  join(directory, 'methods.py'),
  `from typing import Annotated, TypeAlias
from cso_python import external_function, symbol
Length: TypeAlias = Annotated[float, symbol(glyph="L", description="Length", unit="m")]
Area: TypeAlias = Annotated[float, symbol(glyph="A", description="Area", unit="m^2")]
Count: TypeAlias = Annotated[int, symbol(glyph="n", description="Calls", unit="", comment="Diagnostic call count retained even when unused.")]
square = external_function(path="adapter.py", function="square", inputs={"length": Length}, outputs={"area": Area, "count": Count}, description="Square the supplied length.")
`,
);
writeFileSync(
  join(directory, 'adapter.py'),
  `calls = 0
def square(*, length):
    global calls
    calls += 1
    return {"area": length * length, "count": calls}
`,
);
writeFileSync(
  join(directory, 'root.cso.py'),
  `from typing import Annotated
from cso_python import calculation, section, symbol
from methods import Length
from _cso_bindings._external.methods import square
@calculation(id="external", title="External example")
@section(title="Example", root=True)
def calculate(length: Length = 3.0):
    first = square(length=length)
    doubled: Annotated[float, symbol(glyph="D", description="Double area", unit="m^2")] = first["area"] * 2.0
    return {"doubled": doubled}
`,
);

const capture = (name = 'root.cso.py', inputJson = '{}') => {
  const generated = spawnSync(
    python,
    ['-m', 'cso_python', 'bindings', directory],
    { encoding: 'utf8' },
  );
  expect(generated.status, generated.stdout + generated.stderr).toBe(0);
  const captured = spawnSync(
    python,
    [
      '-m',
      'cso_python',
      'execute',
      join(directory, name),
      '--function',
      'calculate',
      '--supported-execution-protocol',
      '4',
      '--inputs-json',
      inputJson,
    ],
    { encoding: 'utf8' },
  );
  const response = ExecutionResponseSchema.parse(JSON.parse(captured.stdout));
  expect(response.ok, JSON.stringify(response)).toBe(true);
  if (!response.ok) throw new Error('Execution failed');
  return response.execution;
};
const runCli = (...args: string[]) =>
  spawnSync(process.execPath, [cli, ...args], {
    cwd: directory,
    env: { ...process.env, PYTHON: python },
    encoding: 'utf8',
    timeout: 20_000,
  });

test('captured external results supply downstream formula authorities with explicit coverage', () => {
  const execution = capture();
  const report = verifyExecution({ execution });
  expect(report.ok, JSON.stringify(report)).toBe(true);
  expect(report.checks.formulaConsistency.counts?.checked).toBe(1);
  expect(report.checks.externalResultConsistency?.counts?.checked).toBe(2);
  expect(report.externalCoverage).toEqual({
    calls: 1,
    results: 2,
    algorithmVerification: 'excluded',
  });
  const document = prepareExecutionDocument({
    execution,
    assets: [],
    verificationReport: report,
  });
  expect(document.documentVersion).toBe('4');
  const html = renderToStaticMarkup(
    createElement(PreparedFormulaSheet, { document }),
  );
  expect(html).toContain('Square the supplied length.');
  expect(html).toContain(
    'External algorithm excluded from CSO formula verification.',
  );
  expect(html).toContain('data-external-quantity="count"');
  expect(html).toContain('External-result consistency: passed');
  expect(html).toContain('Diagnostic call count retained even when unused.');
});

test('external-only capture succeeds with no formula checks and cannot lose evidence in a sheet', () => {
  const source = readFileSync(join(directory, 'root.cso.py'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('doubled:'))
    .join('\n')
    .replace(
      'return {"doubled": doubled}',
      'return {"doubled": first["area"]}',
    );
  writeFileSync(join(directory, 'only.cso.py'), source);
  const execution = capture('only.cso.py');
  const report = verifyExecution({ execution });
  expect(report.ok, JSON.stringify(report)).toBe(true);
  expect(report.checks.formulaConsistency.status).toBe('not_applicable');
  expect(report.checks.formulaConsistency.counts?.checked).toBe(0);
  expect(() =>
    createSheetFromCalculationSourceObject(execution.cso, {
      id: 'lossy',
      label: 'Lossy',
    }),
  ).toThrow(/External-call evidence/u);
});

test('rejects broken call membership, argument evidence, adapter identity and omitted outputs', () => {
  const execution = capture();
  const call = execution.externalCalls?.[0];
  if (!call) throw new Error('Missing external call');
  const changedInputs = {
    ...call,
    inputs: call.inputs.map((input) => ({ ...input, value: 4.0 })),
  };
  const changedAdapter = {
    ...call,
    adapter: { ...call.adapter, sha256: '0'.repeat(64) },
  };
  const omittedOutput = { ...call, outputs: call.outputs.slice(0, 1) };
  const swappedIdentity = {
    ...call,
    outputs: call.outputs.map((output) => ({
      ...output,
      symbolId: call.inputs[0]?.symbolId ?? '',
    })),
  };
  for (const altered of [
    changedInputs,
    changedAdapter,
    omittedOutput,
    swappedIdentity,
  ]) {
    const report = verifyExecution({
      execution: { ...execution, externalCalls: [altered] },
    });
    expect(report.ok, JSON.stringify(altered)).toBe(false);
    expect(report.checks.executionValidity.status).toBe('failed');
  }
});

test('report and document bindings distinguish equal-input runs and reprepare without adapters', () => {
  const first = capture();
  const second = capture();
  const report = verifyExecution({ execution: first });
  const document = prepareExecutionDocument({
    execution: first,
    assets: [],
    verificationReport: report,
  });
  expect(executionBindingKey(executionBindingFrom(first))).not.toBe(
    executionBindingKey(executionBindingFrom(second)),
  );
  expect(() =>
    prepareExecutionDocument({
      execution: second,
      assets: [],
      verificationReport: report,
    }),
  ).toThrow(/exact captured execution/u);
  expect(
    BoundPreparedDocumentSchema.safeParse({ execution: second, document })
      .success,
  ).toBe(false);
  const adapter = join(directory, 'adapter.py');
  const original = readFileSync(adapter, 'utf8');
  try {
    writeFileSync(adapter, 'raise RuntimeError("no longer available")\n');
    const retained = prepareExecutionDocument({
      execution: first,
      assets: [],
      verificationReport: report,
    });
    expect(
      renderToStaticMarkup(
        createElement(PreparedFormulaSheet, { document: retained }),
      ),
    ).toContain('Square the supplied length.');
  } finally {
    writeFileSync(adapter, original);
  }
});

test('a prepared external block cannot change the sign of a captured zero', () => {
  const execution = capture('root.cso.py', '{"length":-0.0}');
  const document = prepareExecutionDocument({ execution, assets: [] });
  const changed = {
    ...document,
    sections: document.sections.map((section) => ({
      ...section,
      items: section.items.map((item) =>
        item.kind === 'externalCall'
          ? {
              ...item,
              call: {
                ...item.call,
                inputs: item.call.inputs.map((input) => ({
                  ...input,
                  value: 0,
                })),
              },
            }
          : item,
      ),
    })),
  };
  expect(
    BoundPreparedDocumentSchema.safeParse({ execution, document: changed })
      .success,
  ).toBe(false);
});

test('a bound report cannot misstate captured call coverage', () => {
  const execution = capture();
  const report = verifyExecution({ execution });
  if (!report.externalCoverage) throw new Error('Missing external coverage');
  const changed = {
    ...report,
    externalCoverage: { ...report.externalCoverage, calls: 2 },
  };
  expect(() =>
    prepareExecutionDocument({
      execution,
      assets: [],
      verificationReport: changed,
    }),
  ).toThrow(/coverage/u);
});

test('declared defaults must agree with resolved default arguments', () => {
  const methods = join(directory, 'methods.py');
  const original = readFileSync(methods, 'utf8');
  const source = readFileSync(join(directory, 'root.cso.py'), 'utf8').replace(
    'square(length=length)',
    'square()',
  );
  writeFileSync(join(directory, 'defaults.cso.py'), source);
  try {
    writeFileSync(
      methods,
      original.replace(
        'description="Square',
        'defaults={"length": 3.0}, description="Square',
      ),
    );
    const execution = capture('defaults.cso.py');
    const call = execution.externalCalls?.[0];
    if (!call) throw new Error('Missing call');
    const invalidDefaults: (typeof call.declaration.interface.defaults)[] = [
      [{ name: 'length', value: 99, numericKind: 'float' }],
      [{ name: 'unknown', value: 3, numericKind: 'float' }],
      [
        ...call.declaration.interface.defaults,
        ...call.declaration.interface.defaults,
      ],
    ];
    for (const defaults of invalidDefaults) {
      const altered = {
        ...call,
        declaration: {
          ...call.declaration,
          interface: { ...call.declaration.interface, defaults },
        },
      };
      expect(
        verifyExecution({
          execution: { ...execution, externalCalls: [altered] },
        }).ok,
      ).toBe(false);
    }
  } finally {
    writeFileSync(methods, original);
    rmSync(join(directory, 'defaults.cso.py'));
  }
});

test('CLI publishes the captured external block and retains full evidence', () => {
  capture();
  const out = join(directory, 'external.html');
  const command = runCli(
    'html',
    join(directory, 'root.cso.py'),
    '--function',
    'calculate',
    '--out',
    out,
    '--check-layout',
  );
  expect(command.status, command.stdout + command.stderr).toBe(0);
  const report = CommandReportSchema.parse(JSON.parse(command.stdout));
  expect(report.reportVersion).toBe('2');
  expect(report.externalCoverage?.results).toBe(2);
  expect(readFileSync(out, 'utf8')).toContain('data-external-quantity="count"');
  expect(existsSync(`${out}.evidence`)).toBe(true);
});

test('compatibility and export rejection run no adapter, and a deadline preserves previous HTML', () => {
  capture();
  const adapter = join(directory, 'adapter.py');
  const original = readFileSync(adapter, 'utf8');
  const marker = join(directory, 'called.txt');
  const out = join(directory, 'deadline.html');
  try {
    writeFileSync(
      adapter,
      `with open(${JSON.stringify(marker)}, "w") as marker:\n    marker.write("called")\ndef square(*, length):\n    while True:\n        pass\n`,
    );
    const oldConsumer = spawnSync(
      python,
      [
        '-I',
        '-m',
        'cso_python',
        'execute',
        join(directory, 'root.cso.py'),
        '--function',
        'calculate',
      ],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(oldConsumer.stdout).diagnostics[0].code).toBe(
      'INCOMPATIBLE_CONTRACT',
    );
    const lossy = runCli(
      'dev-export',
      '--source',
      join(directory, 'root.cso.py'),
      '--function',
      'calculate',
      '--out',
      join(directory, 'lossy.json'),
    );
    expect(lossy.status).not.toBe(0);
    expect(existsSync(marker)).toBe(false);
    writeFileSync(out, 'previous successful report');
    const deadline = runCli(
      'html',
      join(directory, 'root.cso.py'),
      '--function',
      'calculate',
      '--out',
      out,
      '--timeout',
      '0.5',
    );
    expect(deadline.status, deadline.stdout + deadline.stderr).toBe(1);
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(out, 'utf8')).toBe('previous successful report');
  } finally {
    writeFileSync(adapter, original);
  }
});
