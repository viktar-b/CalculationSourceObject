import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { z } from 'zod';
import { exerciseBrowser } from './_initializer-browser.ts';
import {
  artifactSet,
  hashBytes,
  LockSchema,
  OutputsSchema,
  postJson,
  RunSchema,
  writeJson,
} from './_initializer-evidence.ts';

const BaseConfigSchema = z.strictObject({
  origin: z.string().url(),
  project: z.string().min(1),
  evidenceRoot: z.string().min(1),
});
const ConfigSchema = z.discriminatedUnion('kind', [
  BaseConfigSchema.extend({
    kind: z.literal('exercise'),
    registryOrigin: z.string().url(),
    pythonLocation: z.string().min(1),
    referencePath: z.string().min(1),
  }),
  BaseConfigSchema.extend({
    kind: z.literal('restart'),
    expiredRunPath: z.string().startsWith('/api/reports/'),
  }),
]);

const configPath = z
  .string()
  .min(1)
  .parse(process.env.CSO_WINDOWS_VERIFY_CONFIG);
const config = ConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));

if (config.kind === 'restart') {
  assert.equal(
    (await fetch(new URL(config.expiredRunPath, config.origin))).status,
    404,
    'A restarted process must not retain prior in-memory runs',
  );
  assert.equal((await fetch(config.origin)).status, 200);
  writeJson(join(config.evidenceRoot, 'restart.json'), {
    origin: config.origin,
    expiredRunPath: config.expiredRunPath,
    expiredRunStatus: 404,
    rootStatus: 200,
  });
} else {
  const lock = LockSchema.parse(
    JSON.parse(readFileSync(join(config.project, 'package-lock.json'), 'utf8')),
  );
  for (const name of ['core', 'react', 'cli']) {
    const packagePath = `node_modules/@cs-object/${name}`;
    const item = lock.packages[packagePath];
    assert(item, `Missing ${packagePath} from generated package lock`);
    assert.equal(item.link, undefined);
    assert.match(item.resolved ?? '', new RegExp(`^${config.registryOrigin}`));
  }
  assert(
    config.pythonLocation.startsWith(`${join(config.project, '.venv')}${sep}`),
    `Python resolved outside the generated project: ${config.pythonLocation}`,
  );

  const catalog = z
    .array(z.object({ id: z.string(), title: z.string() }))
    .parse(await (await fetch(new URL('/api/reports', config.origin))).json());
  assert.deepEqual(
    catalog.map(({ id }) => id),
    ['rectangle-area', 'two-panel', 'unicode-entry'],
  );
  const unicodeDefinition = z
    .object({ function: z.string() })
    .parse(
      await (
        await fetch(
          new URL('/api/reports/unicode-entry/definition', config.origin),
        )
      ).json(),
    );
  assert.equal(unicodeDefinition.function, 'calculer_é');

  const inputs = {
    width: 1,
    first_panel_height: 3,
    second_panel_height: 4,
    thickness: 0.1,
    density: 500,
  };
  const outputs = { area: 7, volume: 0.7, mass: 350 };
  const screenshot = join(config.evidenceRoot, 'two-panel-browser.png');
  const browserDownload = join(
    config.evidenceRoot,
    'two-panel-browser-download.pdf',
  );
  await exerciseBrowser({
    origin: config.origin,
    reportId: 'two-panel',
    reportTitle: 'Two-panel estimate',
    width: '1',
    expectedText: ['area', '7', 'volume', '0.7', 'mass', '350'],
    screenshot,
    downloadPath: browserDownload,
    inputs,
    outputs,
  });

  const calculation = OutputsSchema.parse(
    await (
      await postJson(config.origin, '/api/reports/two-panel/calculate', {
        inputs: { width: 1 },
      })
    ).json(),
  );
  assert.deepEqual(calculation, outputs);
  const runResponse = await postJson(
    config.origin,
    '/api/reports/two-panel/runs',
    { inputs: { width: 1 } },
  );
  assert.equal(runResponse.status, 201);
  const run = RunSchema.parse(await runResponse.json());
  const artifacts = await artifactSet({
    root: config.evidenceRoot,
    origin: config.origin,
    run,
    inputs,
    outputs,
    rows: [
      { description: 'Total panel area', unit: 'm^2' },
      { description: 'Material volume', unit: 'm^3' },
      { description: 'Material mass', unit: 'kg' },
    ],
    referencePath: config.referencePath,
    name: 'two-panel',
    reportId: 'two-panel',
  });
  writeJson(join(config.evidenceRoot, 'exercise.json'), {
    origin: config.origin,
    expiredRunPath: `/api/reports/two-panel/runs/${run.id}`,
    pythonLocation: config.pythonLocation,
    apiOutputs: calculation,
    screenshot: {
      path: screenshot,
      sha256: hashBytes(readFileSync(screenshot)),
    },
    browserDownload: {
      path: browserDownload,
      sha256: hashBytes(readFileSync(browserDownload)),
    },
    artifacts: Object.fromEntries(
      Object.entries(artifacts).map(([name, path]) => [
        name,
        { path, sha256: hashBytes(readFileSync(path)) },
      ]),
    ),
  });
}
