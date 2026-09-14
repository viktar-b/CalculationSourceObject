// Runs from the retained consumer, importing only its installed packages.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, symlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { CommandReportSchema, ExecutionResponseSchema, VerificationReportSchema, BoundPreparedDocumentSchema } from '@viktar-b/cso-core';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const cli = resolve('node_modules/@viktar-b/cso-cli/dist/cli.js');
const realPython = process.env.PYTHON;
const wrapper = resolve('pdf-python-observer.mjs');
mkdirSync('pdf-output', { recursive: true });
writeFileSync(wrapper, `#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {appendFileSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
appendFileSync('pdf-invocations.jsonl',JSON.stringify(process.argv.slice(2))+'\\n');
const result=spawnSync(${JSON.stringify(realPython)},process.argv.slice(2),{maxBuffer:64*1024*1024});
writeFileSync('pdf-execution.raw',result.stdout);
if(process.env.CSO_TEST_ASSET_REMOVE) rmSync(process.env.CSO_TEST_ASSET_REMOVE);
if(process.env.CSO_TEST_ASSET_CHANGE) writeFileSync(process.env.CSO_TEST_ASSET_CHANGE,'changed after capture');
process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode = result.status??1;
`, { mode: 0o755 });
const cases = []; const artifacts = []; const outputs = [];
const panelArgs = ['examples/two-panel/estimate.cso.py', '--function', 'estimate', '--input', 'width=2'];
const sentinel = Buffer.from('Previous PDF must survive every caught failure.');

function run(name, args, expected = 0, extraEnv = {}, outPath = resolve(`pdf-output/${name}.pdf`)) {
  rmSync('pdf-invocations.jsonl', { force: true });
  if (expected && !extraEnv.CSO_TEST_OUTPUT_DIRECTORY) writeFileSync(outPath, sentinel);
  const env = { ...process.env, PYTHON: wrapper, ...extraEnv };
  for (const key of ['NODE_PATH', 'PYTHONPATH', 'PYTHONHOME']) delete env[key];
  const result = spawnSync(process.execPath, [cli, 'pdf', ...args, '--out', outPath, '--format', 'json'], { env, maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(`pdf-output/${name}.stdout`, result.stdout); writeFileSync(`pdf-output/${name}.stderr`, result.stderr);
  cpSync('pdf-execution.raw', `pdf-output/${name}.execution.raw`);
  if (args.includes('--reference')) cpSync(args[args.indexOf('--reference') + 1], `pdf-output/${name}.reference.raw`);
  assert.equal(result.status, expected, `${name}: ${result.stdout}\n${result.stderr}`);
  const report = CommandReportSchema.parse(JSON.parse(result.stdout));
  assert.equal(result.stdout.toString().trim().split('\n').length, 1);
  const calls = readFileSync('pdf-invocations.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(calls.length, 1, name);
  assert.deepEqual(calls[0].slice(0, 4), ['-I', '-m', 'cso_python', 'execute']);
  assert.equal(report.command, 'pdf');
  assert.equal(report.ok, expected === 0);
  let manifest;
  if (expected) {
    assert.equal(report.output, undefined); assert.equal(report.checks.visualInspection.status, 'not_applicable');
    if (!extraEnv.CSO_TEST_OUTPUT_DIRECTORY) assert.deepEqual(readFileSync(outPath), sentinel);
    assert(!result.stderr.toString().includes('CSO evidence '));
  } else {
    assert.equal(report.checks.documentContent.status, 'passed');
    assert.equal(report.checks.rendering.status, 'passed');
    assert.equal(report.checks.visualInspection.status, 'pending');
    const locator = JSON.parse(result.stderr.toString().split('\n').find(line => line.startsWith('CSO evidence ')).slice('CSO evidence '.length));
    const manifestBytes = readFileSync(locator.path); assert.equal(hash(manifestBytes), locator.sha256);
    assert.equal(dirname(locator.path), `${outPath}.evidence/${locator.sha256}`);
    manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.prospectiveCommandReport.sha256, hash(result.stdout));
    assert.equal(manifest.pdf.sha256, hash(readFileSync(outPath))); assert.deepEqual(manifest.pdf, report.output);
    for (const artifact of manifest.artifacts) assert.equal(hash(readFileSync(join(dirname(locator.path), artifact.path))), artifact.sha256);
    assert.deepEqual(readFileSync(join(dirname(locator.path), 'execution.json')), readFileSync('pdf-execution.raw'));
    const execution = ExecutionResponseSchema.parse(json(join(dirname(locator.path), 'execution.json'))).execution;
    const prepared = json(join(dirname(locator.path), 'prepared.json'));
    BoundPreparedDocumentSchema.parse({ execution, document: prepared });
    const verification = VerificationReportSchema.parse(json(join(dirname(locator.path), 'verification.json')));
    assert.deepEqual(verification.checks.sourceToDocumentConsistency, report.checks.sourceToDocumentConsistency);
    assert.deepEqual(verification.checks.independentReferenceAgreement, report.checks.independentReferenceAgreement);
    if (args.includes('--reference')) assert.deepEqual(readFileSync(join(dirname(locator.path), 'reference.json')), readFileSync(args[args.indexOf('--reference') + 1]));
    const audit = json(join(dirname(locator.path), 'source-audit.json'));
    function leaves(value, path = '') { return value !== null && typeof value === 'object' && Object.keys(value).length ? Object.entries(value).flatMap(([key, value]) => leaves(value, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`)) : [path]; }
    for (const [artifact, value] of [['execution.json', json(join(dirname(locator.path), 'execution.json'))], ['prepared.json', prepared]]) {
      assert.deepEqual(audit.retainedFields.filter(field => field.artifact === artifact).map(field => field.pointer), leaves(value));
    }
    assert(audit.presentation.some(mapping => mapping.role.includes('engineering row')));
    const pdfInfo = spawnSync('pdfinfo', [outPath], { encoding: 'utf8' }); assert.equal(pdfInfo.status, 0, pdfInfo.stderr);
    const pageCount = Number(pdfInfo.stdout.match(/Pages:\s+(\d+)/)[1]);
    outputs.push({ name, path: outPath, sha256: report.output.sha256, pageCount, evidence: locator, visualInspection: 'pending' });
    artifacts.push(locator);
    if (name === 'negative-zero') {
      assert(Object.is(prepared.source.resolvedInputs.x, -0));
      assert(Object.is(report.provenance.resolvedInputs.x, -0));
      assert(readFileSync(join(dirname(locator.path), 'prepared.json'), 'utf8').includes('-0.0'));
    }
  }
  assert(!readdirSync(dirname(outPath)).some(name => name.endsWith('.tmp')));
  cases.push({ name, status: result.status, pythonExecutions: calls.length, checks: report.checks, diagnostics: report.diagnostics, reportSha256: hash(result.stdout) });
  return report;
}

for (const width of [2, 1]) {
  const report = run(`panel-${width}`, ['examples/two-panel/estimate.cso.py', '--function', 'estimate', '--input', `width=${width}`, '--reference', 'examples/two-panel/reference.json']);
  assert.equal(report.checks.formulaConsistency.counts.checked, 7);
  assert.equal(report.checks.independentReferenceAgreement.counts.checked, 7);
}
run('negative-zero', ['signed-zero.cso.py', '--function', 'signed_zero', '--input', 'x=-0.0', '--reference', 'negative-zero-reference.json']);

const notationSource = (glyph, unit) => `from typing import Annotated
from cso_python import CalculationResults, calculation, section, symbol

@calculation(id="notation", title="Notation")
@section(id="root", title="Notation")
def notation() -> CalculationResults:
    force: Annotated[float, symbol(glyph=${JSON.stringify(glyph)}, description="Force", unit=${JSON.stringify(unit)})] = 1.0
    return {"force": force}
`;
for (const [name, glyph, unit, field] of [
  ['malformed-glyph-notation', 'w_{pan', 'N', 'glyph'],
  ['malformed-unit-notation', 'F', 'N/', 'unit'],
]) {
  const source = `${name}.cso.py`;
  writeFileSync(source, notationSource(glyph, unit));
  const report = run(name, [source, '--function', 'notation'], 1);
  const diagnostic = report.diagnostics.find(item => item.code === 'INVALID_NOTATION');
  assert(diagnostic, `${name}: missing INVALID_NOTATION diagnostic`);
  assert.equal(diagnostic.symbolId, '["symbol","root","force"]');
  assert.match(diagnostic.message, new RegExp(field));
}

const geometry = 'examples/two-panel/geometry.cso.py'; const geometryBytes = readFileSync(geometry);
try {
  writeFileSync(geometry, geometryBytes.toString().replace('"area": area', '"area": 999'));
  const report = run('invalid-public-return', panelArgs, 1); assert.equal(report.checks.executionValidity.status, 'failed'); assert(report.diagnostics.some(d => d.code === 'MISSING_OUTPUT'));
} finally { writeFileSync(geometry, geometryBytes); }
const badReference = json('examples/two-panel/reference.json'); badReference.cases[0].expected[0].value = 999;
writeFileSync('pdf-bad-reference.json', JSON.stringify(badReference));
run('bad-reference', [...panelArgs, '--reference', 'pdf-bad-reference.json'], 1);
run('browser-unavailable', panelArgs, 1, { PLAYWRIGHT_BROWSERS_PATH: resolve('absent-browsers') });
const evidenceFailure = resolve('pdf-output/evidence-obstructed.pdf'); writeFileSync(`${evidenceFailure}.evidence`, 'obstruction');
const evidenceReport = run('evidence-obstructed', panelArgs, 1, {}, evidenceFailure);
assert.equal(evidenceReport.checks.rendering.status, 'passed'); assert(evidenceReport.diagnostics.some(d => d.stage === 'write' && !d.check));
const directoryOutput = resolve('pdf-output/destination-directory.pdf'); mkdirSync(directoryOutput); writeFileSync(join(directoryOutput, 'previous'), sentinel);
run('destination-directory', panelArgs, 1, { CSO_TEST_OUTPUT_DIRECTORY: '1' }, directoryOutput);
assert.deepEqual(readFileSync(join(directoryOutput, 'previous')), sentinel);
assert.equal(readdirSync(`${directoryOutput}.evidence`).length, 1, 'Complete unused bundle is retained');

const svg = resolve('examples/two-panel/panels.svg'); const svgBytes = readFileSync(svg);
const discardControl = svgBytes.toString().replace('<g stroke="#244c68"', '<g id="diagram" stroke="#244c68"');
assert(discardControl.includes('id="diagram"'));
try { writeFileSync(svg, discardControl); run('passive-svg-control', panelArgs); }
finally { writeFileSync(svg, svgBytes); }
for (const [name, env] of [['asset-removed-after-execution', { CSO_TEST_ASSET_REMOVE: svg }], ['asset-changed-after-execution', { CSO_TEST_ASSET_CHANGE: svg }]]) {
  try { const report = run(name, panelArgs, 1, env); assert.equal(report.checks.documentContent.status, 'failed'); }
  finally { writeFileSync(svg, svgBytes); }
}
for (const [name, bytes] of [
  ['active-svg', '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><script>alert(1)</script></svg>'],
  ['active-svg-discard', discardControl.replace('</svg>', '<discard begin="0s" href="#diagram"/></svg>')],
  ['active-svg-discard-xlink', discardControl.replace('xmlns="http://www.w3.org/2000/svg"', 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"').replace('</svg>', '<discard begin="0s" xlink:href="#diagram"/></svg>')],
  ['active-svg-discard-parent', discardControl.replace('</g>', '<discard begin="0s"/></g>')],
  ['external-svg', '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><image href="https://example.invalid/image.png"/></svg>'],
  ['malformed-svg', '<svg xmlns="http://www.w3.org/2000/svg"><unclosed></svg>'],
  ['media-mismatch', 'not an SVG'],
]) { try {
  writeFileSync(svg, bytes); const report = run(name, panelArgs, 1);
  if (name.startsWith('active-svg-discard')) {
    assert.equal(report.checks.rendering.status, 'failed');
    assert(report.diagnostics.some(diagnostic => diagnostic.message.includes('Active SVG element discard')));
  }
} finally { writeFileSync(svg, svgBytes); } }
// A truncated PNG must fail even when the source capture hashes its exact bytes.
const panelSource = 'examples/two-panel/estimate.cso.py';
const panelSourceBytes = readFileSync(panelSource);
const png = 'examples/two-panel/panel.png';
try {
  writeFileSync(panelSource, panelSourceBytes.toString().replace('panels.svg', 'panel.png'));
  writeFileSync(png, Buffer.from('89504e470d0a1a0a0000000d', 'hex'));
  run('undecodable-png', panelArgs, 1);
} finally { writeFileSync(panelSource, panelSourceBytes); rmSync(png, { force: true }); }
// Source preflight and CLI capture both enforce containment, including symlinks.
const outside = resolve('../outside-panel.svg'); writeFileSync(outside, svgBytes);
try { rmSync(svg); symlinkSync(outside, svg); run('asset-symlink-outside-root', panelArgs, 1); }
finally { rmSync(svg); writeFileSync(svg, svgBytes); rmSync(outside); }

writeFileSync('pdf-results.json', JSON.stringify({ ok: true, cases, artifacts, outputs, dataRetention: 'passed', engineeringPresentation: { automatic: 'passed', visualInspection: 'pending' } }, null, 2));
process.stdout.write(`PASS ${cases.length} installed PDF cases; ${outputs.length} PDFs require every-page inspection.\n`);

