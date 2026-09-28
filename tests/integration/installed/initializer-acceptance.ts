import assert from 'node:assert/strict';
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
import {
  createCommandRunner,
  type DevServer,
  startDev,
} from './_initializer-processes.ts';
import {
  closeRegistry,
  pack,
  registryPackage,
  startRegistry,
} from './_initializer-registry.ts';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const root = realpathSync(
  mkdtempSync(join(tmpdir(), 'cso installed packages initializer ')),
);
const archives = join(root, 'archives');
mkdirSync(archives);
const environment: NodeJS.ProcessEnv = { ...process.env };
for (const key of ['NODE_PATH', 'PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV'])
  Reflect.deleteProperty(environment, key);
const { commands, run } = createCommandRunner(root, environment);

function containsReleaseArchive(directory: string): boolean {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.venv'].includes(entry.name)) continue;
    if (/\.(?:tgz|whl)$/.test(entry.name)) return true;
    if (
      entry.isDirectory() &&
      containsReleaseArchive(join(directory, entry.name))
    )
      return true;
  }
  return false;
}

process.stdout.write(`Initializer acceptance artifacts: ${root}\n`);
let registry: Server | undefined;
let dev: DevServer | undefined;
try {
  await run({ cwd: repository, command: 'npm', args: ['run', 'build:lib'] });
  await run({
    cwd: repository,
    command: 'npm',
    args: ['run', 'build', '--workspace', '@cs-object/cli'],
  });
  await run({
    cwd: repository,
    command: 'npm',
    args: ['run', 'build', '--workspace', 'create-cs-object'],
  });
  const packed = await Promise.all(
    [
      '@cs-object/core',
      '@cs-object/react',
      '@cs-object/cli',
      'create-cs-object',
    ].map((workspace) => pack({ workspace, repository, archives, run })),
  );
  const packages = await Promise.all(
    packed.map((archive) => registryPackage({ archive, root, run })),
  );
  const initializer = packages.find(
    (item) => item.manifest.name === 'create-cs-object',
  );
  assert(initializer);
  const initializerFiles = (
    await run({
      cwd: root,
      command: 'tar',
      args: ['-tzf', initializer.archive],
    })
  )
    .trim()
    .split('\n');
  assert(
    !initializerFiles.some((path) => /(?:vendor|\.tgz$|\.whl$)/.test(path)),
    'The initializer archive must not vendor release artifacts',
  );

  const builder = join(root, 'wheel-builder');
  await run({
    cwd: root,
    command: process.env.PYTHON ?? 'python3',
    args: ['-m', 'venv', builder],
  });
  const builderPython = join(
    builder,
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
  await run({
    cwd: root,
    command: builderPython,
    args: [
      '-m',
      'pip',
      'wheel',
      '--no-deps',
      '--wheel-dir',
      archives,
      join(repository, 'packages/cso-python'),
    ],
  });
  const wheels = readdirSync(archives).filter((name) => name.endsWith('.whl'));
  assert.equal(wheels.length, 1);
  const wheel = join(archives, wheels[0] ?? 'missing.whl');

  const localRegistry = await startRegistry(packages);
  registry = localRegistry.server;
  const createEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    npm_config_registry: localRegistry.origin,
    npm_config_yes: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
    npm_config_fetch_retries: '1',
    npm_config_fetch_timeout: '30000',
    npm_config_cache: join(root, 'npm-cache'),
    PIP_FIND_LINKS: pathToFileURL(archives).href,
    PIP_NO_INDEX: '1',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
    PYTHON: process.env.PYTHON ?? 'python3',
  };
  await run({
    cwd: root,
    command: 'npm',
    args: ['create', 'cs-object', 'my-report'],
    env: createEnvironment,
    timeoutMs: 15 * 60_000,
  });
  await closeRegistry(registry);
  registry = undefined;
  await run({
    cwd: join(root, 'my-report'),
    command: 'npm',
    args: ['run', 'build'],
  });

  const project = join(root, 'my-report');
  const lock = LockSchema.parse(
    JSON.parse(readFileSync(join(project, 'package-lock.json'), 'utf8')),
  );
  for (const name of ['core', 'react', 'cli']) {
    const path = `node_modules/@cs-object/${name}`;
    const item = lock.packages[path];
    assert(item, `Missing ${path} from generated package lock`);
    assert.equal(item.link, undefined);
    assert.match(item.resolved ?? '', new RegExp(`^${localRegistry.origin}`));
    assert(!lstatSync(join(project, path)).isSymbolicLink());
  }
  assert(
    !containsReleaseArchive(project),
    'Generated projects must not contain release archives',
  );
  const installedPython = join(
    project,
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
  const pythonLocation = realpathSync(
    (
      await run({
        cwd: project,
        command: installedPython,
        args: ['-I', '-c', 'import cso_python; print(cso_python.__file__)'],
      })
    ).trim(),
  );
  assert(pythonLocation.startsWith(`${join(project, '.venv')}${sep}`));

  dev = await startDev({
    project,
    name: 'synthetic-dev',
    environment,
    logs: root,
  });
  const firstCatalog = z
    .array(z.object({ id: z.string(), title: z.string() }))
    .parse(await (await fetch(new URL('/api/reports', dev.origin))).json());
  assert.deepEqual(firstCatalog, [
    { id: 'rectangle-area', title: 'Rectangle area' },
  ]);
  const definitionResponse = await fetch(
    new URL('/api/reports/rectangle-area/definition', dev.origin),
  );
  assert.equal(definitionResponse.status, 200);
  const definition = z
    .looseObject({
      inputs: z.array(
        z.looseObject({ name: z.string(), default: z.number().optional() }),
      ),
      outputs: z.array(z.looseObject({ name: z.string() })),
    })
    .parse(await definitionResponse.json());
  assert.deepEqual(
    definition.inputs.map(({ name, default: value }) => ({ name, value })),
    [
      { name: 'width', value: 2 },
      { name: 'height', value: 3 },
    ],
  );
  assert.deepEqual(
    definition.outputs.map(({ name }) => name),
    ['area'],
  );
  const syntheticScreenshot = join(root, 'synthetic-browser.png');
  const syntheticDownload = join(root, 'synthetic-browser-download.pdf');
  await exerciseBrowser({
    origin: dev.origin,
    reportId: 'rectangle-area',
    reportTitle: 'Rectangle area',
    width: '4',
    expectedText: ['area', '12'],
    screenshot: syntheticScreenshot,
    downloadPath: syntheticDownload,
    initialText: ['area', '6'],
    inputs: { width: 4, height: 3 },
    outputs: { area: 12 },
  });

  const curl = OutputsSchema.parse(
    JSON.parse(
      await run({
        cwd: project,
        command: 'curl',
        args: [
          '--fail-with-body',
          '--silent',
          '--show-error',
          '-H',
          'content-type: application/json',
          '--data',
          JSON.stringify({ inputs: { width: 4, height: 3 } }),
          `${dev.origin}/api/reports/rectangle-area/calculate`,
        ],
      }),
    ),
  );
  assert.deepEqual(curl, { area: 12 });
  const syntheticRunResponse = await postJson(
    dev.origin,
    '/api/reports/rectangle-area/runs',
    {
      inputs: { width: 4, height: 3 },
    },
  );
  assert.equal(syntheticRunResponse.status, 201);
  const syntheticRun = RunSchema.parse(await syntheticRunResponse.json());
  const syntheticArtifacts = await artifactSet({
    root,
    origin: dev.origin,
    run: syntheticRun,
    inputs: { width: 4, height: 3 },
    outputs: { area: 12 },
    rows: [{ description: 'Rectangle area', unit: 'm^2' }],
    name: 'synthetic',
    reportId: 'rectangle-area',
  });
  const expiredRunPath = `/api/reports/rectangle-area/runs/${syntheticRun.id}`;
  await dev.stop();
  dev = await startDev({
    project,
    name: 'synthetic-restart',
    environment,
    logs: root,
  });
  assert.equal(
    (await fetch(new URL(expiredRunPath, dev.origin))).status,
    404,
    'A restarted process must not retain prior in-memory runs',
  );
  assert.equal((await fetch(dev.origin)).status, 200);
  await dev.stop();
  dev = undefined;

  const calculations = join(project, 'calculations');
  for (const entry of readdirSync(join(repository, 'examples/two-panel'), {
    withFileTypes: true,
  })) {
    if (entry.isFile())
      cpSync(
        join(repository, 'examples/two-panel', entry.name),
        join(calculations, entry.name),
      );
  }
  await run({
    cwd: project,
    command: installedPython,
    args: ['-I', '-m', 'cso_python', 'bindings', calculations],
  });
  const reportsPath = join(project, 'reports.json');
  const reports = z
    .array(z.record(z.string(), z.string()))
    .parse(JSON.parse(readFileSync(reportsPath, 'utf8')));
  reports.push({
    id: 'two-panel',
    title: 'Two-panel estimate',
    source: 'calculations/estimate.cso.py',
    function: 'estimate',
    reference: 'calculations/reference.json',
  });
  writeJson(reportsPath, reports);

  dev = await startDev({
    project,
    name: 'two-panel-dev',
    environment,
    logs: root,
  });
  const secondCatalog = z
    .array(z.object({ id: z.string(), title: z.string() }))
    .parse(await (await fetch(new URL('/api/reports', dev.origin))).json());
  assert.deepEqual(
    secondCatalog.map(({ id }) => id),
    ['rectangle-area', 'two-panel'],
  );
  const twoPanelScreenshot = join(root, 'two-panel-browser.png');
  const twoPanelDownload = join(root, 'two-panel-browser-download.pdf');
  const twoPanelInputs = {
    width: 1,
    first_panel_height: 3,
    second_panel_height: 4,
    thickness: 0.1,
    density: 500,
  };
  await exerciseBrowser({
    origin: dev.origin,
    reportId: 'two-panel',
    reportTitle: 'Two-panel estimate',
    width: '1',
    expectedText: ['area', '7', 'volume', '0.7', 'mass', '350'],
    screenshot: twoPanelScreenshot,
    downloadPath: twoPanelDownload,
    inputs: twoPanelInputs,
    outputs: { area: 7, volume: 0.7, mass: 350 },
  });
  const twoPanelRunResponse = await postJson(
    dev.origin,
    '/api/reports/two-panel/runs',
    {
      inputs: { width: 1 },
    },
  );
  assert.equal(twoPanelRunResponse.status, 201);
  const twoPanelRun = RunSchema.parse(await twoPanelRunResponse.json());
  const twoPanelArtifacts = await artifactSet({
    root,
    origin: dev.origin,
    run: twoPanelRun,
    inputs: twoPanelInputs,
    outputs: { area: 7, volume: 0.7, mass: 350 },
    rows: [
      { description: 'Total panel area', unit: 'm^2' },
      { description: 'Material volume', unit: 'm^3' },
      { description: 'Material mass', unit: 'kg' },
    ],
    referencePath: join(calculations, 'reference.json'),
    name: 'two-panel',
    reportId: 'two-panel',
  });
  await dev.stop();
  dev = undefined;

  const qualification = join(root, 'qualification.json');
  writeJson(qualification, {
    ok: true,
    root,
    registry: localRegistry.origin,
    project,
    wheel: { path: wheel, sha256: hashBytes(readFileSync(wheel)) },
    packages: packages.map((item) => ({
      name: item.manifest.name,
      version: item.manifest.version,
      path: item.archive,
      sha256: hashBytes(readFileSync(item.archive)),
    })),
    pythonLocation,
    screenshots: [syntheticScreenshot, twoPanelScreenshot],
    browserDownloads: [syntheticDownload, twoPanelDownload],
    reports: [syntheticArtifacts, twoPanelArtifacts].map((item) => ({
      html: item.htmlPath,
      pdf: item.pdfPath,
      evidence: item.evidencePath,
    })),
    commands,
  });
  process.stdout.write(
    `PASS installed initializer and generated localhost reports. Evidence: ${qualification}\n`,
  );
} catch (error) {
  writeJson(join(root, 'failure.json'), {
    ok: false,
    message: error instanceof Error ? error.message : String(error),
    commands,
  });
  throw error;
} finally {
  if (dev) await dev.stop();
  if (registry) await closeRegistry(registry);
}
