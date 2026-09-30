import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const launcher = join(root, 'scripts/demo.ts');
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'cso npm café '));
  directories.push(directory);
  const npmEntry = join(directory, 'npm entry.mjs');
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      [
        'path',
        'npm_execpath',
        'cso_examples_directory',
        'cso_gallery_directory',
      ].includes(key.toLowerCase())
    ) {
      Reflect.deleteProperty(env, key);
    }
  }
  env.PATH = '';
  env.npm_execpath = npmEntry;
  env.PYTHON = join(directory, 'missing-python');
  return { directory, npmEntry, env };
}

test.each([
  ['dev', 'CSO_EXAMPLES_DIRECTORY'],
  ['build', 'CSO_GALLERY_DIRECTORY'],
])(
  'launches %s through the supplied npm entry with %s',
  (mode, dataVariable) => {
    const { directory, npmEntry, env } = fixture();
    env[dataVariable] = directory;
    writeFileSync(
      npmEntry,
      'process.stdout.write(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), examples: process.env.CSO_EXAMPLES_DIRECTORY, gallery: process.env.CSO_GALLERY_DIRECTORY }));',
    );
    const forwarded = [
      '--port',
      '4123',
      'a path with spaces',
      '"quoted" & $HOME; %PATH%',
      '',
    ];
    const result = spawnSync(process.execPath, [launcher, mode, ...forwarded], {
      cwd: directory,
      env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      args: ['run', mode, '--workspace', '@cs-object/demo', '--', ...forwarded],
      cwd: root.replace(/[\\/]$/, ''),
      ...(dataVariable === 'CSO_EXAMPLES_DIRECTORY'
        ? { examples: directory }
        : { gallery: directory }),
    });
  },
);

test('preserves child stderr and nonzero exit status', () => {
  const { directory, npmEntry, env } = fixture();
  env.CSO_EXAMPLES_DIRECTORY = directory;
  writeFileSync(
    npmEntry,
    'process.stderr.write("npm child failed\\n"); process.exitCode = 23;',
  );
  const result = spawnSync(process.execPath, [launcher, 'build'], {
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
  expect(result.status).toBe(23);
  expect(result.stderr).toBe('npm child failed\n');
});

test.skipIf(process.platform === 'win32')(
  'reports a child terminated by a signal',
  () => {
    const { directory, npmEntry, env } = fixture();
    env.CSO_EXAMPLES_DIRECTORY = directory;
    writeFileSync(npmEntry, 'process.kill(process.pid, "SIGTERM");');
    const result = spawnSync(process.execPath, [launcher, 'dev'], {
      env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Demo npm process terminated by SIGTERM');
  },
);

test.each(['missing', 'empty', 'absent-file', 'directory', 'relative'])(
  'explains how to launch when the npm entry is %s before preparing examples',
  (kind) => {
    const { directory, npmEntry, env } = fixture();
    if (kind === 'missing') Reflect.deleteProperty(env, 'npm_execpath');
    if (kind === 'empty') env.npm_execpath = '';
    if (kind === 'directory') env.npm_execpath = directory;
    if (kind === 'relative') env.npm_execpath = 'npm entry.mjs';
    if (kind !== 'absent-file')
      writeFileSync(npmEntry, 'process.exitCode = 0;');
    const result = spawnSync(process.execPath, [launcher], {
      cwd: directory,
      env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('npm run dev');
    expect(result.stderr).toContain('npm run build:demo');
    expect(result.stdout).toBe('');
  },
);
