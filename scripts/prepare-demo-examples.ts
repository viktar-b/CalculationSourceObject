import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareExecutionDocument } from '@cs-object/react';
import { captureAssets } from '../apps/cso-cli/src/assets.ts';
import { bindingsCommand } from '../apps/cso-cli/src/bindings.ts';
import { stringifyJson } from '../apps/cso-cli/src/json.ts';
import { executeAndVerify } from '../apps/cso-cli/src/verification.ts';
import type { VerifiedOptions } from '../apps/cso-cli/src/verified-arguments.ts';
import { PythonSourceBundleSchema } from '../apps/demo/src/examples/python-source.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const excludedDirectories = new Set([
  '_cso_bindings',
  '__pycache__',
  'generated',
  'pdfs',
]);

const writeJson = (path: string, value: unknown): void => {
  writeFileSync(path, `${stringifyJson(value)}\n`);
};

export function prepareDemoExamples({
  directory,
  sourceDirectory = join(root, 'examples/two-panel'),
}: {
  readonly directory: string;
  readonly sourceDirectory?: string;
}): string {
  const source = join(directory, 'source');
  const prepared = join(directory, 'prepared');
  const receipts = join(directory, 'receipts');
  cpSync(sourceDirectory, source, {
    recursive: true,
    filter: (path) => !excludedDirectories.has(basename(path)),
  });
  mkdirSync(prepared);
  mkdirSync(receipts);

  if (bindingsCommand([source]) !== 0) {
    throw new Error('Canonical example bindings could not be generated');
  }

  const id = 'two-panel-width-2';
  const sourcePath = join(source, 'estimate.cso.py');
  const result = executeAndVerify({
    command: 'verify',
    sourcePath,
    functionName: 'estimate',
    inputs: { width: 2 },
    referencePath: join(source, 'reference.json'),
  } satisfies VerifiedOptions);
  if (result.kind === 'failed') {
    throw new Error(
      `${id}: canonical verification failed: ${stringifyJson(result.outcome.report)}`,
    );
  }

  const verification = result.report;
  if (
    !verification.ok ||
    verification.checks.independentReferenceAgreement.status !== 'passed'
  ) {
    throw new Error(
      `${id}: the canonical reference did not pass. Review source changes and reference bindings before regenerating.`,
    );
  }

  const document = prepareExecutionDocument({
    execution: result.capture.execution,
    assets: captureAssets(sourcePath, result.capture.execution),
  });
  const { entry, sourceManifest, sourceClosureHash } = result.capture.execution;
  const pythonSource = PythonSourceBundleSchema.parse({
    version: '1',
    binding: {
      entryModuleId: entry.moduleId,
      entrySourceHash: entry.sourceHash,
      sourceClosureHash,
      function: entry.function,
      resolvedInputs: entry.resolvedInputs,
    },
    files: sourceManifest.map((file) => ({
      ...file,
      code: readFileSync(join(source, file.moduleId), 'utf8'),
    })),
  });
  writeJson(join(prepared, `${id}.source.json`), pythonSource);
  writeJson(join(prepared, `${id}.prepared.json`), document);
  writeFileSync(
    join(receipts, `${id}.execution.json`),
    result.capture.executionBytes,
  );
  writeJson(join(receipts, `${id}.verification.json`), verification);
  return prepared;
}
