import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = mkdtempSync(join(tmpdir(), 'cso-library-archives-'));
const archiveDirectory = join(artifactRoot, 'archives');
const environment = { ...process.env };
Reflect.deleteProperty(environment, 'NODE_PATH');
Reflect.deleteProperty(environment, 'PYTHONPATH');

const run = (cwd: string, command: string, args: string[]): void => {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}`);
  }
};

const write = (directory: string, filename: string, contents: string): void => {
  writeFileSync(join(directory, filename), contents, 'utf8');
};

const createConsumer = (name: string, dependencies: string[]): string => {
  const directory = join(artifactRoot, name);
  mkdirSync(directory);
  write(
    directory,
    'package.json',
    JSON.stringify({
      name: `cso-${name}-consumer`,
      private: true,
      type: 'module',
    }),
  );
  run(directory, 'npm', [
    'install',
    '--no-audit',
    '--no-fund',
    ...dependencies,
  ]);
  copyFileSync(
    join(repoRoot, 'tests/fixtures/contract-cases/single-success.json'),
    join(directory, 'synthetic.json'),
  );
  return directory;
};

const packedArchive = (prefix: string): string => {
  const matches = readdirSync(archiveDirectory).filter(
    (filename) => filename.startsWith(prefix) && filename.endsWith('.tgz'),
  );
  const filename = matches[0];
  if (matches.length !== 1 || !filename) {
    throw new Error(`Expected one ${prefix} archive`);
  }
  return join(archiveDirectory, filename);
};

process.stdout.write(`Library consumer artifacts: ${artifactRoot}\n`);
mkdirSync(archiveDirectory);
for (const packageName of ['@cs-object/core', '@cs-object/react']) {
  run(repoRoot, 'npm', [
    'pack',
    '--workspace',
    packageName,
    '--pack-destination',
    archiveDirectory,
  ]);
}
const coreArchive = packedArchive('cs-object-core-');
const reactArchive = packedArchive('cs-object-react-');
const coreDirectory = createConsumer('core', [coreArchive]);

write(
  coreDirectory,
  'check.mjs',
  `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as esm from '@cs-object/core';
const require = createRequire(import.meta.url);
const cjs = require('@cs-object/core');
const source = JSON.parse(readFileSync('synthetic.json', 'utf8')).execution.cso;
for (const api of [esm, cjs]) {
  const parsed = api.CalculationSourceObjectSchema.parse(source);
  const calculation = api.createSheetFromCalculationSourceObject(parsed, { id: 'synthetic', label: 'Synthetic calculation' });
  assert.equal(calculation.sheet.symbols.length, 2, 'Synthetic conversion retains both symbols');
  assert.equal(calculation.diagnostics.unresolvedReferences, 0, 'Synthetic conversion resolves every reference');
  assert(api.createPythonFromCalculation(calculation).includes('def '), 'Core generates Python source without Python');
  assert.throws(() => api.CalculationSourceObjectSchema.parse({}), 'Core rejects invalid CSO data');
}
for (const dependency of ['react', 'next', 'playwright']) {
  assert.throws(() => require.resolve(dependency), dependency + ' is absent from the core consumer');
}
assert.throws(() => require.resolve('@cs-object/core/src/index.ts'), 'Core private source is not exported');
console.log('PASS core ESM/CJS validation, conversion, Python generation and dependency isolation');
`,
);
run(coreDirectory, process.execPath, ['check.mjs']);
cpSync(
  join(repoRoot, 'tests/fixtures/contract-cases'),
  join(coreDirectory, 'contract-cases'),
  { recursive: true },
);
run(coreDirectory, process.execPath, ['contract-cases/check.mjs']);
cpSync(
  join(repoRoot, 'tests/fixtures/verifier-cases'),
  join(coreDirectory, 'verifier-cases'),
  { recursive: true },
);
run(coreDirectory, process.execPath, ['verifier-cases/check.mjs']);

const reactDirectory = createConsumer('react', [
  coreArchive,
  reactArchive,
  'react@18.3.1',
  'react-dom@18.3.1',
  '@types/react@18.3.31',
  '@types/react-dom@18.3.7',
  '@types/node@20.19.43',
  'typescript@5.9.3',
  'esbuild@0.28.2',
]);
write(
  reactDirectory,
  'check.mjs',
  `
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CalculationSourceObjectSchema, createSheetFromCalculationSourceObject } from '@cs-object/core';
import * as esm from '@cs-object/react';
const require = createRequire(import.meta.url);
const cjs = require('@cs-object/react');
const source = CalculationSourceObjectSchema.parse(JSON.parse(readFileSync('synthetic.json', 'utf8')).execution.cso);
const { sheet } = createSheetFromCalculationSourceObject(source, { id: 'synthetic', label: 'Synthetic calculation' });
for (const api of [esm, cjs]) {
  const html = renderToStaticMarkup(React.createElement(api.FormulaSheet, { sheet }));
  assert(html.includes('<math'), 'FormulaSheet emits MathML');
  assert(html.includes('8.00'), 'FormulaSheet renders the synthetic area');
  assert.equal(api.printFormulaSheet(), false, 'Browser print helper is safe during SSR');
}
for (const dependency of ['next', 'playwright']) {
  assert.throws(() => require.resolve(dependency), dependency + ' is absent from the React consumer');
}
const css = readFileSync(require.resolve('@cs-object/react/style.css'), 'utf8');
assert(css.includes('formula-sheet-printing'), 'Packaged CSS contains print rules');
assert.throws(() => require.resolve('@cs-object/react/src/FormulaSheet.tsx'), 'React private source is not exported');
writeFileSync('style.css', css);
writeFileSync('index.html', '<!doctype html><title>Installed CSO React archive</title><link rel="stylesheet" href="./style.css"><div id="root"></div><script src="./browser.js"></script>');
console.log('PASS React ESM/CJS SSR, packaged CSS and dependency isolation');
`,
);
write(
  reactDirectory,
  'consumer.tsx',
  `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CalculationSourceObjectSchema, createSheetFromCalculationSourceObject, type SheetDocument } from '@cs-object/core';
import { FormulaSheet, AsciiMathView } from '@cs-object/react';
import response from './synthetic.json';
const sheet: SheetDocument = createSheetFromCalculationSourceObject(
  CalculationSourceObjectSchema.parse(response.execution.cso), { id: 'synthetic', label: 'Synthetic calculation' },
).sheet;
const root = document.getElementById('root');
if (!root) throw new Error('Missing mount');
createRoot(root).render(<><FormulaSheet sheet={sheet}/><math><AsciiMathView expression="A_c^2"/></math></>);
`,
);
const nodeConsumer = `
import { verifyExecution, type VerifyExecution, type VerifyExecutionInput, type VerificationReport } from '@cs-object/core';
const verifier: VerifyExecution = verifyExecution;
const checkSignature = (input: VerifyExecutionInput): VerificationReport => verifier(input);
void checkSignature;

import { FormulaSheet } from '@cs-object/react';
import type { SheetDocument } from '@cs-object/core';
export const render = (sheet: SheetDocument) => FormulaSheet({ sheet });
`;
write(reactDirectory, 'consumer.mts', nodeConsumer);
write(reactDirectory, 'consumer.cts', nodeConsumer);
write(
  reactDirectory,
  'tsconfig.json',
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      jsx: 'react-jsx',
      esModuleInterop: true,
      resolveJsonModule: true,
      strict: true,
      noEmit: true,
      skipLibCheck: false,
    },
    include: ['consumer.mts', 'consumer.cts'],
  }),
);
run(reactDirectory, process.execPath, ['check.mjs']);
const tsc = join(reactDirectory, 'node_modules/typescript/bin/tsc');
run(reactDirectory, process.execPath, [tsc, '--pretty', 'false']);
run(reactDirectory, process.execPath, [
  tsc,
  '--noEmit',
  '--strict',
  '--skipLibCheck',
  'false',
  '--jsx',
  'react-jsx',
  '--module',
  'esnext',
  '--moduleResolution',
  'bundler',
  '--esModuleInterop',
  '--resolveJsonModule',
  '--target',
  'ES2022',
  'consumer.tsx',
]);
run(reactDirectory, join(reactDirectory, 'node_modules/.bin/esbuild'), [
  'consumer.tsx',
  '--bundle',
  '--format=iife',
  '--outfile=browser.js',
]);
process.stdout.write(
  'PASS strict NodeNext ESM/CJS declarations and bundler TSX with MathML JSX declarations\n',
);
process.stdout.write(
  `Browser inspection artifact: ${join(reactDirectory, 'index.html')}\n`,
);
process.stdout.write(
  'Browser inspection has not been performed by this command.\n',
);

cpSync(
  join(repoRoot, 'tests/fixtures/contract-cases'),
  join(reactDirectory, 'contract-cases'),
  { recursive: true },
);
write(
  reactDirectory,
  'contract-browser.ts',
  `
import { BoundPreparedDocumentSchema, ExecutionResponseSchema, PreparedDocumentSchema, VerificationReportSchema, sourceClosureHash, verifyExecution } from '@cs-object/core';
import execution from './contract-cases/repeated-nested-success.json';
import mismatch from './contract-cases/wrong-runtime.json';
import prepared from './contract-cases/ordered-content.json';
import vector from './contract-cases/source-hash-vector.json';
if (!ExecutionResponseSchema.parse(execution).ok) throw new Error('Execution parse failed');
const verified = VerificationReportSchema.parse(verifyExecution({ execution: execution.execution }));
if (!verified.ok) throw new Error('Browser formula verification failed');
const rejected = VerificationReportSchema.parse(verifyExecution({ execution: mismatch.execution }));
if (rejected.ok || rejected.checks.formulaConsistency.status !== 'failed') throw new Error('Browser accepted runtime mismatch');
PreparedDocumentSchema.parse(prepared);
BoundPreparedDocumentSchema.parse({ execution: ExecutionResponseSchema.parse(execution).execution, document: prepared });
const manifest = vector.manifest.map(([moduleId, sha256]) => ({moduleId, sha256}));
if (sourceClosureHash(manifest) !== vector.sha256) throw new Error('Browser UTF-8 hash differs');
document.documentElement.dataset.contracts = 'passed';
`,
);
run(reactDirectory, join(reactDirectory, 'node_modules/.bin/esbuild'), [
  'contract-browser.ts',
  '--bundle',
  '--platform=browser',
  '--format=iife',
  '--outfile=contract-browser.js',
]);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.addScriptTag({
    path: join(reactDirectory, 'contract-browser.js'),
  });
  const status = await page.evaluate(
    () => document.documentElement.dataset.contracts,
  );
  if (status !== 'passed')
    throw new Error('Installed browser contract consumer failed');
  process.stdout.write(
    'PASS installed browser schemas, UTF-8 hashing and pure formula verification without Node APIs\n',
  );
} finally {
  await browser.close();
}
