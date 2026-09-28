import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'create-cs-object-'));
const consumer = join(temporary, 'consumer');
const cli = join(consumer, 'node_modules/create-cs-object/dist/cli.js');
function invoke(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: temporary,
    encoding: 'utf8',
    timeout: 15_000,
  });
}
before(() => {
  mkdirSync(consumer);
  const packed = spawnSync(
    'npm',
    ['pack', '--ignore-scripts', '--pack-destination', temporary],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  assert.equal(packed.status, 0, packed.stderr);
  const archive = readdirSync(temporary).find((name) => name.endsWith('.tgz'));
  assert.ok(archive, 'npm pack must produce an archive');
  const installed = spawnSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(temporary, archive),
    ],
    {
      cwd: consumer,
      encoding: 'utf8',
      timeout: 60_000,
    },
  );
  assert.equal(installed.status, 0, installed.stderr);
});
after(() => rmSync(temporary, { recursive: true, force: true }));

test('the installed archive creates a complete project without installing', () => {
  const result = invoke(['area-report', '--skip-install']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /cd area-report\nnpm run setup\nnpm run dev/);
  const project = join(temporary, 'area-report');
  const manifest = z
    .object({
      name: z.string(),
      scripts: z.record(z.string(), z.string()),
      dependencies: z.record(z.string(), z.string()),
    })
    .parse(JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')));
  assert.equal(manifest.name, 'area-report');
  assert.equal(manifest.scripts.dev, 'node scripts/dev.ts');
  assert.equal(manifest.dependencies['@cs-object/cli'], '0.1.0');
  assert.equal(manifest.dependencies['@cs-object/core'], '0.1.0');
  assert.equal(manifest.dependencies['@base-ui/react'], '^1.8.0');
  assert.equal(manifest.dependencies.vite, '^8');
  assert.equal(manifest.scripts.build, 'tsc -b && vite build');
  for (const file of [
    'components.json',
    'index.html',
    'vite.config.ts',
    'src/App.tsx',
    'src/index.css',
    'src/components/ui/button.tsx',
    'src/components/ui/sidebar.tsx',
    'reports.json',
  ])
    assert.ok(readFileSync(join(project, file)).length > 0, file);
  assert.deepEqual(
    JSON.parse(readFileSync(join(project, 'reports.json'), 'utf8')),
    [
      {
        id: 'rectangle-area',
        title: 'Rectangle area',
        source: 'calculations/report.cso.py',
        function: 'calculate',
      },
    ],
  );
  const dev = spawnSync(process.execPath, ['scripts/dev.ts'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(dev.status, 1);
  assert.match(dev.stderr, /npm run setup/);
  const setup = spawnSync(process.execPath, ['scripts/setup.ts'], {
    cwd: project,
    encoding: 'utf8',
    env: { ...process.env, PYTHON: join(temporary, 'missing-python') },
  });
  assert.equal(setup.status, 1);
  assert.match(setup.stderr, /Python 3.11 or newer is required/);
  assert.match(setup.stderr, /run npm run setup again/);
  assert.equal(
    readFileSync(join(project, 'requirements.txt'), 'utf8'),
    'cs-object==0.1.0\n',
  );
});

test('invalid names and options fail before creating a destination', () => {
  for (const args of [
    [],
    ['../escape'],
    ['Bad Name'],
    ['.'],
    ['node_modules'],
    ['valid', '--unknown'],
    ['valid', '--skip-install', '--skip-install'],
  ]) {
    const result = invoke(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /Usage: npm create cs-object/);
  }
  assert.equal(invoke(['--help']).status, 0);
});

test('existing files and directories survive unchanged', () => {
  const project = join(temporary, 'existing');
  mkdirSync(project);
  writeFileSync(join(project, 'brief.md'), 'User calculation brief.\n');
  const result = invoke(['existing', '--skip-install']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EEXIST/);
  assert.deepEqual(readdirSync(project), ['brief.md']);
  assert.equal(
    readFileSync(join(project, 'brief.md'), 'utf8'),
    'User calculation brief.\n',
  );
  writeFileSync(join(temporary, 'existing-file'), 'Keep this file.\n');
  assert.equal(invoke(['existing-file', '--skip-install']).status, 1);
  assert.equal(
    readFileSync(join(temporary, 'existing-file'), 'utf8'),
    'Keep this file.\n',
  );
});

test('automatic installation failure preserves the project and gives a recovery command', () => {
  const result = spawnSync(process.execPath, [cli, 'retry-report'], {
    cwd: temporary,
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      npm_config_registry: 'http://127.0.0.1:1',
      npm_config_cache: join(temporary, 'npm-cache'),
      npm_config_fetch_retries: '0',
      npm_config_fetch_timeout: '1000',
    },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Your project remains at/);
  assert.match(result.stderr, /Run npm run setup in that directory to retry/);
  assert.match(
    readFileSync(
      join(temporary, 'retry-report/calculations/report.cso.py'),
      'utf8',
    ),
    /def calculate\(/,
  );
});
