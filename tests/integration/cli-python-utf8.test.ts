import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';
import { createDevRuntime } from '../../packages/cso-cli/src/dev-runtime.ts';
import { runPythonExporter } from '../../packages/cso-cli/src/development.ts';
import { executeAndVerify } from '../../packages/cso-cli/src/verification.ts';

const directories: string[] = [];
const cli = fileURLToPath(
  new URL('../../packages/cso-cli/dist/cli.js', import.meta.url),
);

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'cso café 梁 ')));
  directories.push(directory);
  const sourcePath = join(directory, 'quantity.cso.py');
  writeFileSync(
    sourcePath,
    `from typing import Annotated
from cso_python import calculation, section, symbol
@calculation(id="unicode", title="Épaisseur 梁", metadata={"author": "Zoë 李"})
@section(id="main", title="Mesure 梁", root=True)
def calculate(width: Annotated[float, symbol(glyph="w_{test}", description="Largeur café 梁", unit="mm")] = 2):
    doubled: Annotated[float, symbol(glyph="d_{test}", description="Épaisseur doublée 梁", unit="mm")] = width * 2
    return {"doublée 梁": doubled}
`,
  );
  return { directory, sourcePath, functionName: 'calculate' };
}

test('verified execution retains Unicode author fields and original UTF-8 bytes', () => {
  const result = executeAndVerify({
    ...fixture(),
    command: 'verify',
    inputs: {},
  });
  expect(result.kind).toBe('verified');
  if (result.kind !== 'verified')
    throw new Error('Expected verified execution');
  expect(result.capture.execution.cso.title).toBe('Épaisseur 梁');
  expect(result.capture.execution.cso.source.metadata?.author).toBe('Zoë 李');
  expect(result.capture.execution.authoring?.outputs).toMatchObject([
    { name: 'doublée 梁', value: 4 },
  ]);
  expect(result.capture.executionBytes.includes(Buffer.from('Zoë 李'))).toBe(
    true,
  );
});

test('the dev definition preserves Unicode descriptions and public output names', async () => {
  const runtime = createDevRuntime(fixture());
  try {
    const definition = runtime.definition();
    expect(definition.inputs).toMatchObject([
      { name: 'width', description: 'Largeur café 梁', default: 2 },
    ]);
    expect(definition.outputs).toMatchObject([
      { name: 'doublée 梁', description: 'Épaisseur doublée 梁' },
    ]);
    expect(runtime.calculate({ definition, inputs: { width: 3 } })).toEqual({
      'doublée 梁': 6,
    });
  } finally {
    await runtime.close();
  }
});

test('bindings forward UTF-8 JSON and generate handles in a Unicode directory', () => {
  const { directory } = fixture();
  for (const extra of [[], ['--check']]) {
    const result = spawnSync(process.execPath, [
      cli,
      'bindings',
      directory,
      ...extra,
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr.toString('utf8')).toBe(0);
    const stdout = new TextDecoder('utf-8', { fatal: true }).decode(
      result.stdout,
    );
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, directory });
    expect(stdout).toContain('café 梁');
  }
  expect(
    readFileSync(join(directory, '_cso_bindings', 'quantity.pyi'), 'utf8'),
  ).toContain('doublée 梁');
});

test('the legacy exporter preserves Unicode JSON and decoded failure messages', () => {
  const options = { ...fixture(), inputs: {} };
  const document = runPythonExporter(options);
  expect(document.title).toBe('Épaisseur 梁');
  expect(document.source.metadata?.author).toBe('Zoë 李');
  expect(() =>
    runPythonExporter({ ...options, functionName: 'absent_é梁' }),
  ).toThrow('absent_é梁');
});
