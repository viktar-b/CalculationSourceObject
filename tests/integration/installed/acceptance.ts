import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const root = realpathSync(
  mkdtempSync(join(tmpdir(), 'cso installed packages ')),
);
const archives = join(root, 'archives');
const environment = { ...process.env };
for (const key of ['NODE_PATH', 'PYTHONPATH', 'PYTHONHOME'])
  Reflect.deleteProperty(environment, key);
const commands: {
  cwd: string;
  command: string;
  args: string[];
  status: number | null;
}[] = [];
const hash = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
function run(
  cwd: string,
  command: string,
  args: string[],
  expected = 0,
): string {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  commands.push({ cwd, command, args, status: result.status });
  writeFileSync(
    join(root, `command-${commands.length}.log`),
    `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  );
  if (result.error) throw result.error;
  if (result.status !== expected)
    throw new Error(
      `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}\nExpected ${expected}, received ${result.status}`,
    );
  return result.stdout;
}
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}
function consumer(name: string, dependencies: string[]): string {
  const directory = join(root, name);
  mkdirSync(directory);
  write(join(directory, 'package.json'), {
    name: `cso-${name.replaceAll(' ', '-')}`,
    private: true,
    type: 'module',
  });
  // All CSO dependencies are provided together as local archives. Registry access
  // remains available only for their declared third-party dependencies.
  run(directory, 'npm', [
    'install',
    '--no-audit',
    '--no-fund',
    ...dependencies,
  ]);
  run(directory, 'npm', ['ls', '--all']);
  const lock: unknown = JSON.parse(
    readFileSync(join(directory, 'package-lock.json'), 'utf8'),
  );
  assert(
    lock &&
      typeof lock === 'object' &&
      'packages' in lock &&
      lock.packages &&
      typeof lock.packages === 'object',
  );
  for (const [path, metadata] of Object.entries(lock.packages)) {
    if (path.includes('node_modules/@viktar-b/cso-')) {
      assert(
        metadata &&
          typeof metadata === 'object' &&
          'resolved' in metadata &&
          typeof metadata.resolved === 'string',
      );
      assert(
        metadata.resolved.startsWith('file:'),
        'CSO packages must resolve to local archives',
      );
      assert(
        !('link' in metadata && metadata.link),
        'Workspace links cannot establish installation',
      );
    }
  }
  for (const name of ['cso-core', 'cso-react', 'cso-cli']) {
    const directoryPath = join(directory, 'node_modules/@viktar-b', name);
    if (dependencies.some((dependency) => dependency.includes(name)))
      assert(!lstatSync(directoryPath).isSymbolicLink());
  }
  return directory;
}
function uniqueArchive(prefix: string, extension: string): string {
  const matches = readdirSync(archives).filter(
    (name) => name.startsWith(prefix) && name.endsWith(extension),
  );
  assert.equal(matches.length, 1, `One archive expected for ${prefix}`);
  const name = matches[0];
  assert(name);
  return join(archives, name);
}
const fixturePaths = run(repo, 'git', [
  'ls-files',
  'examples',
  'tests/fixtures',
])
  .trim()
  .split('\n')
  .filter(Boolean);
const fixtureHashes = Object.fromEntries(
  fixturePaths.map((path) => [path, hash(join(repo, path))]),
);
process.stdout.write(`Installed acceptance artifacts: ${root}\n`);
try {
  mkdirSync(archives);
  run(repo, 'npm', ['run', 'build:lib']);
  run(join(repo, 'apps/cso-cli'), 'npm', ['run', 'build']);
  for (const directory of [
    'packages/cso-core',
    'packages/cso-react',
    'apps/cso-cli',
  ]) {
    run(join(repo, directory), 'npm', ['pack', '--pack-destination', archives]);
  }
  const core = uniqueArchive('viktar-b-cso-core-', '.tgz');
  const react = uniqueArchive('viktar-b-cso-react-', '.tgz');
  const cli = uniqueArchive('viktar-b-cso-cli-', '.tgz');
  for (const archive of [core, react, cli]) {
    const files = run(root, 'tar', ['-tzf', archive]).trim().split('\n');
    assert(files.includes('package/README.md'));
    assert(files.includes('package/package.json'));
    assert(files.includes('package/LICENSE'));
    assert(files.includes('package/NOTICE'));
    if (archive !== cli)
      assert(files.includes('package/THIRD_PARTY_NOTICES.txt'));
    assert(
      files.every((path) =>
        /^package\/(dist\/|README\.md$|package\.json$|LICENSE(?:\.md)?$|NOTICE$|THIRD_PARTY_NOTICES\.txt$)/.test(
          path,
        ),
      ),
      `Unexpected package content in ${archive}`,
    );
    assert(
      !files.some((path) =>
        /(?:apps\/demo|node_modules|\.cso\.py)/.test(path),
      ),
    );
  }
  const builder = join(root, 'wheel builder');
  run(root, process.env.PYTHON ?? 'python3', ['-m', 'venv', builder]);
  const builderPython = join(builder, 'bin/python');
  run(root, builderPython, [
    '-m',
    'pip',
    'wheel',
    '--no-deps',
    '--wheel-dir',
    archives,
    join(repo, 'packages/cso-python'),
  ]);
  const wheel = uniqueArchive('cso_python-', '.whl');
  const wheelFiles = run(root, builderPython, [
    '-c',
    'import sys,zipfile,json; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))',
    wheel,
  ]);
  const members: unknown = JSON.parse(wheelFiles);
  assert(
    Array.isArray(members) &&
      members.every(
        (path) =>
          typeof path === 'string' &&
          /^(cso_python\/|cso_python-[^/]+\.dist-info\/)/.test(path),
      ),
  );

  const pythonOnly = join(root, 'python only');
  mkdirSync(pythonOnly);
  assert(!existsSync(join(pythonOnly, 'node_modules')));
  const pythonVenv = join(pythonOnly, 'venv');
  run(root, builderPython, ['-m', 'venv', pythonVenv]);
  const python = join(pythonVenv, 'bin/python');
  run(pythonOnly, python, [
    '-m',
    'pip',
    'install',
    '--no-index',
    '--no-deps',
    wheel,
  ]);
  const pythonLocation = run(pythonOnly, python, [
    '-I',
    '-c',
    'import cso_python; print(cso_python.__file__)',
  ]).trim();
  assert(pythonLocation.startsWith(pythonVenv));
  const copiedRepo = join(pythonOnly, 'copied tests');
  mkdirSync(join(copiedRepo, 'packages/cso-python'), { recursive: true });
  cpSync(
    join(repo, 'packages/cso-python/tests'),
    join(copiedRepo, 'packages/cso-python/tests'),
    { recursive: true, filter: (path) => !path.includes('__pycache__') },
  );
  const testOutput = run(pythonOnly, python, [
    join(copiedRepo, 'packages/cso-python/tests/run.py'),
  ]);
  writeFileSync(join(root, 'python-tests.stdout.txt'), testOutput);
  const functionName = 'rectangle';
  const rectangle = join(
    repo,
    'tests/integration/installed/fixtures/geometry.cso.py.txt',
  );
  copyFileSync(rectangle, join(pythonOnly, 'rectangle input.cso.py'));
  for (const width of [2, 4]) {
    const exported = run(pythonOnly, python, [
      '-I',
      '-m',
      'cso_python',
      'export',
      'rectangle input.cso.py',
      '--function',
      functionName,
      '--inputs-json',
      JSON.stringify({ width, height: 3 }),
    ]);
    writeFileSync(join(pythonOnly, `rectangle-${width}.json`), exported);
  }
  const coreOnly = consumer('core only', [core]);
  const reactOnly = consumer('react only', [
    core,
    react,
    'react@18.3.1',
    'react-dom@18.3.1',
  ]);
  const full = consumer('full cli', [core, react, cli]);
  for (const directory of [coreOnly, reactOnly, full]) {
    for (const width of [2, 4])
      copyFileSync(
        join(pythonOnly, `rectangle-${width}.json`),
        join(directory, `rectangle-${width}.json`),
      );
    copyFileSync(
      join(repo, 'tests/integration/installed/consumer.mjs'),
      join(directory, 'consumer.mjs'),
    );
  }
  cpSync(
    join(repo, 'tests/fixtures/contract-cases'),
    join(coreOnly, 'contract-cases'),
    { recursive: true },
  );
  run(coreOnly, process.execPath, ['contract-cases/check.mjs']);
  run(coreOnly, process.execPath, ['consumer.mjs', 'core']);
  run(reactOnly, process.execPath, ['consumer.mjs', 'react']);

  const fullVenv = join(full, 'python environment');
  run(full, builderPython, ['-m', 'venv', fullVenv]);
  environment.PYTHON = join(fullVenv, 'bin/python');
  run(full, environment.PYTHON, [
    '-m',
    'pip',
    'install',
    '--no-index',
    '--no-deps',
    wheel,
  ]);
  copyFileSync(rectangle, join(full, 'rectangle input.cso.py'));
  const entry = join(full, 'node_modules/@viktar-b/cso-cli/dist/cli.js');
  assert(
    run(full, join(full, 'node_modules/.bin/cso'), ['--help']).includes(
      'Usage: cso',
    ),
  );
  // A same-directory Python package must never override the selected wheel.
  mkdirSync(join(full, 'cso_python'));
  writeFileSync(
    join(full, 'cso_python/__init__.py'),
    'raise RuntimeError("cwd package fallback used")\n',
  );
  copyFileSync(
    join(repo, 'tests/integration/installed/fixtures/geometry.cso.py.txt'),
    join(full, 'rectangle input.cso.py'),
  );
  run(full, process.execPath, [
    entry,
    'dev-export',
    '--source',
    'rectangle input.cso.py',
    '--function',
    'rectangle',
    '--input',
    'width=2',
    '--input',
    'height=3',
    '--out',
    'rectangle.json',
  ]);
  // Test-only identifier variant of the approved rectangle input. The checked-in
  // Python-owned fixture remains unchanged; no production calculation is edited.
  const unicodeSource = readFileSync(
    join(full, 'rectangle input.cso.py'),
    'utf8',
  )
    .replace('def rectangle(width:', 'def ορθογώνιο(π:')
    .replace('given(width)', 'given(π)');
  writeFileSync(join(full, 'unicode input.cso.py'), unicodeSource);
  run(full, process.execPath, [
    entry,
    'dev-export',
    '--source',
    'unicode input.cso.py',
    '--function',
    'ορθογώνιο',
    '--input',
    'π=2',
    '--input',
    'height=3',
    '--out',
    'unicode.json',
  ]);
  const compatibilitySource = readFileSync(
    join(full, 'rectangle input.cso.py'),
    'utf8',
  )
    .replace('def rectangle(width:', 'def K(K:')
    .replace('given(width)', 'given(K)');
  writeFileSync(join(full, 'compatibility input.cso.py'), compatibilitySource);
  run(full, process.execPath, [
    entry,
    'dev-export',
    '--source',
    'compatibility input.cso.py',
    '--function',
    'K',
    '--input',
    'K=2',
    '--input',
    'height=3',
    '--out',
    'compatibility.json',
  ]);
  for (const command of ['dev-export', 'dev-render', 'verify', 'pdf']) {
    assert(
      run(full, process.execPath, [entry, command, '--help']).includes(
        command === 'verify' || command === 'pdf'
          ? `Usage: cso ${command}`
          : 'Usage: cso',
      ),
    );
  }
  for (const command of ['verify', 'pdf']) {
    const report = run(
      full,
      process.execPath,
      [entry, command, '--format', 'json'],
      2,
    );
    writeFileSync(join(full, `${command}-unavailable.json`), report);
  }
  writeFileSync(
    join(full, 'unknown-command.json'),
    run(full, process.execPath, [entry, 'verfiy', '--format', 'json'], 2),
  );
  run(full, process.execPath, [
    join(full, 'node_modules/playwright/cli.js'),
    'install',
    'chromium',
  ]);
  const base = [
    '--source',
    'rectangle input.cso.py',
    '--function',
    functionName,
    '--input',
    'height=3',
  ];
  for (const width of [2, 4]) {
    run(full, process.execPath, [
      entry,
      'dev-export',
      ...base,
      '--input',
      `width=${width}`,
      '--out',
      `cli-${width}.json`,
    ]);
    run(full, process.execPath, [
      entry,
      'dev-render',
      ...base,
      '--input',
      `width=${width}`,
      '--out',
      `output/rectangle ${width}.pdf`,
    ]);
  }
  const sentinel = join(full, 'output/preserved.pdf');
  writeFileSync(sentinel, 'sentinel');
  for (const extra of [
    ['--input', 'width=2', '--input', 'width=4'],
    ['--input', 'K=2', '--input', 'K=3'],
    ['--input', 'width=NaN'],
    ['--inputs-json', '{"width":2,"width":4}'],
  ]) {
    run(
      full,
      process.execPath,
      [entry, 'dev-render', ...base, ...extra, '--out', sentinel],
      2,
    );
    assert.equal(readFileSync(sentinel, 'utf8'), 'sentinel');
  }
  run(
    full,
    process.execPath,
    [entry, 'dev-render', ...base, '--input', 'unknown=2', '--out', sentinel],
    1,
  );
  assert.equal(readFileSync(sentinel, 'utf8'), 'sentinel');
  run(full, process.execPath, ['consumer.mjs', 'cli']);
  run(repo, process.execPath, [
    join(repo, 'tests/integration/installed/run-consumers.mjs'),
    full,
    environment.PYTHON,
  ]);
  const binaries = run(full, process.execPath, [
    '-e',
    "console.log(require.resolve('playwright/package.json'))",
  ]).trim();
  assert(binaries.startsWith(full));
  for (const [path, expected] of Object.entries(fixtureHashes))
    assert.equal(hash(join(repo, path)), expected, `Immutable fixture ${path}`);
  const artifacts = [
    core,
    react,
    cli,
    wheel,
    ...[2, 4].map((width) => join(full, `output/rectangle ${width}.pdf`)),
  ].map((path) => ({ path, sha256: hash(path) }));
  write(join(root, 'evidence.json'), {
    ok: true,
    sourceCommit: run(repo, 'git', ['rev-parse', 'HEAD']).trim(),
    root,
    consumers: { pythonOnly, coreOnly, reactOnly, full },
    pythonLocation,
    fullPython: environment.PYTHON,
    versions: {
      node: process.version,
      python: run(full, environment.PYTHON, ['--version']).trim(),
      npm: run(root, 'npm', ['--version']).trim(),
    },
    artifacts,
    fixtureHashes,
    commands,
    sourceConsistency: 'not established by export/render',
    independentReferenceAgreement:
      'not established; rectangle arithmetic is regression evidence',
    documentPreservation:
      'covered separately by prepared-document and installed PDF cases',
    visualInspection:
      'pending; inspect both PDFs and bind findings to artifact hashes',
  });
  process.stdout.write(
    `PASS installed package isolation and synthetic rectangle regression. PDF inspection pending. Evidence: ${join(root, 'evidence.json')}\n`,
  );
} catch (error: unknown) {
  write(join(root, 'failure.json'), {
    ok: false,
    commands,
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
