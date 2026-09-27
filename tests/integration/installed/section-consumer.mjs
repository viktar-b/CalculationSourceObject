// Runs with installed npm archives and a Python wheel outside the checkout.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CommandReportSchema } from '@cs-object/core';

const cli = resolve('node_modules/@cs-object/cli/dist/cli.js');
const root = resolve('examples/section-properties');
function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    result.error?.message ?? result.stdout + result.stderr,
  );
  return result.stdout;
}
for (const args of [[], ['--check']]) {
  const generated = JSON.parse(
    run(process.execPath, [cli, 'bindings', root, ...args]),
  );
  assert.equal(generated.ok, true);
}
const results = [];
for (const [name, depth] of [
  ['compare_hot_formed', 1056],
  ['compare_tapered', 100],
]) {
  for (const inputs of [[], ['--input', `candidate_depth=${depth}`]]) {
    const report = CommandReportSchema.parse(
      JSON.parse(
        run(process.execPath, [
          cli,
          'verify',
          `${root}/compare.cso.py`,
          '--function',
          name,
          ...inputs,
          '--format',
          'json',
        ]),
      ),
    );
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.checks.formulaConsistency.status, 'passed');
    results.push({ name, inputs, ok: report.ok });
  }
}
assert(process.env.PYTHON);
run(
  process.env.PYTHON,
  [
    '-c',
    [
      'from _cso_bindings.compare import compare_hot_formed, compare_tapered',
      'from _cso_bindings.comparison import compare_properties',
      'from math import isclose, pi',
      // Areas follow the default section geometry: rectangles plus root fillets
      // for hot-formed sections, and rectangles plus taper trapezoids otherwise.
      'for calculation, baseline_area, candidate_area in [(compare_hot_formed, 77200 - 900 * pi, 82384 - 900 * pi), (compare_tapered, 1250, 1350)]:',
      '    defaults = calculation()',
      '    assert isclose(defaults["baseline_area"], baseline_area, rel_tol=1e-12)',
      '    assert isclose(defaults["candidate_area"], candidate_area, rel_tol=1e-12)',
      '    assert isclose(defaults["area_ratio"], candidate_area / baseline_area, rel_tol=1e-12)',
      '    assert defaults["inertia_ratio"] > 1',
      'for calculation, depth in [(compare_hot_formed, 1056), (compare_tapered, 100)]:',
      '    result = calculation(candidate_depth=depth)',
      '    assert result["area_ratio"] == result["inertia_ratio"] == 1',
      '    changed = calculation(candidate_depth=depth * 1.1)',
      '    assert changed["candidate_area"] > changed["baseline_area"]',
      'assert compare_properties(baseline_area=2, candidate_area=6, baseline_inertia=4, candidate_inertia=20) == {"area_ratio": 3, "inertia_ratio": 5}',
    ].join('\n'),
  ],
  root,
);
writeFileSync(
  'section-results.json',
  JSON.stringify({ ok: true, results }, null, 2),
);
