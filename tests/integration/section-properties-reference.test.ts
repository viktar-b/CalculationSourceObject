import { execFileSync, spawnSync } from 'node:child_process';
import { ExecutionResponseSchema, verifyExecution } from '@cs-object/core';
import { expect, it } from 'vitest';

type Point = readonly [number, number];
// Polygon integrals are independent of the source's component decomposition.
function moments(points: readonly Point[]) {
  let area = 0;
  let first = 0;
  let aboutBottom = 0;
  let aboutCentre = 0;
  for (const [index, [x, y]] of points.entries()) {
    const [nextX, nextY] = points[(index + 1) % points.length];
    const cross = x * nextY - nextX * y;
    area += cross / 2;
    first += ((y + nextY) * cross) / 6;
    aboutBottom += ((y * y + y * nextY + nextY * nextY) * cross) / 12;
    aboutCentre += ((x * x + x * nextX + nextX * nextX) * cross) / 12;
  }
  return { area, first, aboutBottom, aboutCentre };
}
function clipBelow(points: readonly Point[], height: number): Point[] {
  const clipped: Point[] = [];
  for (const [index, point] of points.entries()) {
    const next = points[(index + 1) % points.length];
    if (point[1] <= height) clipped.push(point);
    if (point[1] <= height !== next[1] <= height)
      clipped.push([
        point[0] +
          ((next[0] - point[0]) * (height - point[1])) / (next[1] - point[1]),
        height,
      ]);
  }
  return clipped;
}

it.each([
  {
    region: 'inactive bottom wedge singularity',
    dimensions: [50, 5, 31.875, 3, 5, 30, 5, 10],
    interval: [10, 45],
  },
  {
    region: 'inactive top wedge singularity',
    dimensions: [50, 5, 30, 5, 10, 31.875, 3, 5],
    interval: [5, 40],
  },
  {
    region: 'bottom flange/taper boundary',
    dimensions: [100, 4, 28, 10, 14, 20, 30, 34],
    interval: [29.99999999, 30.00000001],
  },
  {
    region: 'bottom taper/web boundary',
    dimensions: [100, 4, 36, 10, 14, 20, 30, 34],
    interval: [33.99999999, 34.00000001],
  },
  {
    region: 'top flange/taper boundary',
    dimensions: [100, 4, 20, 30, 34, 28, 10, 14],
    interval: [69.99999999, 70.00000001],
  },
  {
    region: 'top taper/web boundary',
    dimensions: [100, 4, 20, 30, 34, 36, 10, 14],
    interval: [65.99999999, 66.00000001],
  },
  {
    region: 'touching tapers',
    dimensions: [50, 5, 40, 5, 25, 40, 5, 25],
    interval: [24.99999999, 25.00000001],
  },
  {
    region: 'top taper',
    dimensions: [100, 5, 50, 10, 15, 30, 5, 10],
    interval: [85, 90],
  },
  {
    region: 'bottom taper',
    dimensions: [100, 5, 30, 5, 10, 50, 10, 15],
    interval: [10, 15],
  },
  {
    region: 'web',
    dimensions: [100, 5, 40, 5, 10, 40, 5, 10],
    interval: [10, 90],
  },
  {
    region: 'top flange',
    dimensions: [100, 5, 100, 30, 35, 30, 5, 10],
    interval: [70, 100],
  },
  {
    region: 'bottom flange',
    dimensions: [100, 5, 30, 5, 10, 100, 30, 35],
    interval: [0, 30],
  },
])(
  'agrees with polygon integration when the PNA is in the $region',
  ({ dimensions, interval }) => {
    const [
      depth,
      web,
      topWidth,
      topOuter,
      topInner,
      bottomWidth,
      bottomOuter,
      bottomInner,
    ] = dimensions;
    const perimeter: Point[] = [
      [-bottomWidth / 2, 0],
      [bottomWidth / 2, 0],
      [bottomWidth / 2, bottomOuter],
      [web / 2, bottomInner],
      [web / 2, depth - topInner],
      [topWidth / 2, depth - topOuter],
      [topWidth / 2, depth],
      [-topWidth / 2, depth],
      [-topWidth / 2, depth - topOuter],
      [-web / 2, depth - topInner],
      [-web / 2, bottomInner],
      [-bottomWidth / 2, bottomOuter],
    ];
    const total = moments(perimeter);
    const centroid = total.first / total.area;
    const inertiaX = total.aboutBottom - total.first * centroid;
    const inertiaY = total.aboutCentre;
    let low = 0;
    let high = depth;
    for (let iteration = 0; iteration < 70; iteration++) {
      const height = (low + high) / 2;
      if (moments(clipBelow(perimeter, height)).area < total.area / 2)
        low = height;
      else high = height;
    }
    const pna = (low + high) / 2;
    expect(pna).toBeGreaterThan(interval[0]);
    expect(pna).toBeLessThan(interval[1]);
    const lower = moments(clipBelow(perimeter, pna));
    const plasticModulus =
      total.first - 2 * lower.first + pna * (2 * lower.area - total.area);
    const rotated: Point[] = perimeter.map(([x, y]) => [-y, x]);
    const plasticModulusY = -2 * moments(clipBelow(rotated, 0)).first;
    const baseline = new Map<string, number>();
    const translated = new Set([
      'lower_trapezoid_flange_boundary',
      'lower_trapezoid_web_boundary',
      'upper_trapezoid_web_boundary',
      'upper_trapezoid_flange_boundary',
      'upper_section_boundary',
      'plastic_neutral_axis_location',
    ]);
    for (const origin of [0, 37, -23]) {
      const inputs = {
        section_depth: depth,
        web_thickness: web,
        width_of_top_flange: topWidth,
        outer_top_flange_thickness: topOuter,
        inner_top_flange_thickness: topInner,
        width_of_bot_flange: bottomWidth,
        outer_bot_flange_thickness: bottomOuter,
        inner_bot_flange_thickness: bottomInner,
        lower_section_boundary: origin,
      };
      const response = ExecutionResponseSchema.parse(
        JSON.parse(
          execFileSync(
            process.env.PYTHON ?? 'python3',
            [
              '-I',
              '-m',
              'cso_python',
              'execute',
              new URL(
                '../../examples/section-properties/unequal_tapered_i_beam/calculate.cso.py',
                import.meta.url,
              ).pathname,
              '--function',
              'calculate',
              '--inputs-json',
              JSON.stringify(inputs),
            ],
            { encoding: 'utf8' },
          ),
        ),
      );
      if (!response.ok) throw new Error(JSON.stringify(response.diagnostics));
      for (const output of response.execution.authoring?.outputs ?? []) {
        if (origin === 0) baseline.set(output.name, output.value);
        const initial = baseline.get(output.name);
        if (initial === undefined)
          throw new Error(`Missing baseline ${output.name}`);
        const shift =
          translated.has(output.name) ||
          output.name.startsWith('candidate_for_')
            ? origin
            : 0;
        expect(
          output.value,
          `Translation of ${output.name}, origin ${origin}`,
        ).toBeCloseTo(initial + shift, 6);
      }
      const retainedText = response.execution.cso.sections
        .flatMap((section) =>
          section.items.flatMap((item) =>
            item.kind === 'text' ? [item.text?.content ?? ''] : [],
          ),
        )
        .join(' ');
      expect(retainedText).toContain(
        'Outside this interval these quantities are inapplicable',
      );
      expect(retainedText).toContain('Input requirement:');
      for (const output of response.execution.authoring?.outputs ?? []) {
        if (
          !output.name.includes('wedge') &&
          !output.name.startsWith('the_width_at_the_pna')
        )
          continue;
        const topTaper =
          output.name.includes('top_trapz') ||
          output.name.endsWith('top_trapezoid');
        const lower = topTaper ? depth - topInner : bottomOuter;
        const upper = topTaper ? depth - topOuter : bottomInner;
        if (pna < lower - 1e-8 || pna > upper + 1e-8) {
          expect(output.value, `Inactive ${output.name}`).toBe(0);
        }
        expect(output.value, output.name).toBeGreaterThanOrEqual(-1e-8);
      }
      const report = verifyExecution({ execution: response.execution });
      expect(report.ok, JSON.stringify(report.diagnostics)).toBe(true);
      const expected: Record<string, number> = {
        total_area_of_the_section: total.area,
        distance_to_centroid_y_axis_from_the_bottom_of_the_section: centroid,
        second_moment_of_area_about_x_axis: inertiaX,
        second_moment_of_area_about_y_axis: inertiaY,
        second_moment_of_area_about_the_x1_axis: total.aboutBottom,
        polar_second_moment_of_area_about_the_z_axis: inertiaX + inertiaY,
        radius_of_gyration_about_x_axis: Math.sqrt(inertiaX / total.area),
        radius_of_gyration_about_y_axis: Math.sqrt(inertiaY / total.area),
        radius_of_gyration_about_the_z_axis: Math.sqrt(
          (inertiaX + inertiaY) / total.area,
        ),
        elastic_section_modulus_about_x_axis:
          inertiaX / Math.max(centroid, depth - centroid),
        elastic_section_modulus_about_y_axis:
          inertiaY / (Math.max(topWidth, bottomWidth) / 2),
        plastic_neutral_axis_location: pna + origin,
        distance_to_plastic_neutral_axis_from_lower_boundary: pna,
        plastic_section_modulus_about_x_axis: plasticModulus,
        plastic_section_mosulus_about_y_axis: plasticModulusY,
        lower_trapezoid_flange_boundary: bottomOuter + origin,
        lower_trapezoid_web_boundary: bottomInner + origin,
        upper_trapezoid_web_boundary: depth - topInner + origin,
        upper_trapezoid_flange_boundary: depth - topOuter + origin,
        upper_section_boundary: depth + origin,
      };
      for (const [name, value] of Object.entries(expected)) {
        const output = response.execution.authoring?.outputs.find(
          (item) => item.name === name,
        );
        expect(output?.value, `${name}, origin ${origin}`).toBeCloseTo(
          value,
          6,
        );
      }
    }
  },
);

it.each([
  { inputs: { section_depth: 20 }, message: 'overlapping flanges' },
  { inputs: { section_depth: -1 }, message: 'positive' },
  { inputs: { web_thickness: 0 }, message: 'positive' },
  { inputs: { width_of_top_flange: -1 }, message: 'positive' },
  { inputs: { outer_bot_flange_thickness: 0 }, message: 'positive' },
  { inputs: { inner_top_flange_thickness: 0 }, message: 'positive' },
  { inputs: { inner_top_flange_thickness: 10 }, message: 'taper heights' },
  { inputs: { inner_bot_flange_thickness: 5 }, message: 'taper heights' },
  { inputs: { inner_top_flange_thickness: 9 }, message: 'taper heights' },
  { inputs: { width_of_bot_flange: 5 }, message: 'taper gradients' },
  { inputs: { width_of_top_flange: 5 }, message: 'taper gradients' },
  { inputs: { width_of_bot_flange: 4 }, message: 'taper gradients' },
])('rejects unsupported geometry: $inputs', ({ inputs, message }) => {
  for (const filename of ['calculate.cso.py', 'area_inertia.cso.py']) {
    const result = spawnSync(
      process.env.PYTHON ?? 'python3',
      [
        '-I',
        '-m',
        'cso_python',
        'execute',
        new URL(
          `../../examples/section-properties/unequal_tapered_i_beam/${filename}`,
          import.meta.url,
        ).pathname,
        '--function',
        'calculate',
        '--inputs-json',
        JSON.stringify(inputs),
      ],
      { encoding: 'utf8' },
    );
    const response = ExecutionResponseSchema.parse(JSON.parse(result.stdout));
    expect(response.ok).toBe(false);
    expect(response.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'INPUT_PRECONDITION_FAILED',
          message: expect.stringContaining(message),
        }),
      ]),
    );
  }
});
