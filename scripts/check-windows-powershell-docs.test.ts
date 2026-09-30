import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

type SnippetSpec = { id: string; guide: string };
const snippets = [
  { id: 'repository-setup', guide: 'docs/development.md' },
  { id: 'archive-consumer', guide: 'docs/development.md' },
  { id: 'canonical-report', guide: 'packages/cso-cli/README.md' },
  { id: 'project-create', guide: 'packages/create-cs-object/README.md' },
  { id: 'project-setup', guide: 'packages/create-cs-object/README.md' },
  { id: 'project-dev', guide: 'packages/create-cs-object/README.md' },
  { id: 'project-build', guide: 'packages/create-cs-object/template/README.md' },
  { id: 'project-bindings', guide: 'packages/create-cs-object/template/authoring.md' },
  { id: 'project-report', guide: 'packages/create-cs-object/template/authoring.md' },
  { id: 'reference-authoring', guide: 'packages/create-cs-object/template/references/README.md' },
] satisfies SnippetSpec[];

function normalize(lines: string[]): string {
  const content = lines.filter((line) => line.trim().length > 0);
  assert(content.length > 0, 'A marked command block must not be empty');
  const indent = Math.min(...content.map((line) => line.length - line.trimStart().length));
  return lines.map((line) => line.slice(indent)).join('\n');
}

function readBlocks(path: string, format: 'markdown' | 'powershell'): Map<string, string> {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const marker = format === 'markdown'
    ? /^<!-- docs:(.+):(start|end) -->$/
    : /^# docs:(.+):(start|end)$/;
  const blocks = new Map<string, string>();
  let open: { id: string; lines: string[] } | undefined;
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const match = marker.exec(line.trim());
    if (!match) {
      if (open) open.lines.push(line);
      continue;
    }
    const [, id, edge] = match;
    assert(id !== undefined, `Missing snippet id in ${path}`);
    if (edge === 'start') {
      assert.equal(open, undefined, `Nested snippet ${id} in ${path}`);
      assert(!blocks.has(id), `Duplicate snippet ${id} in ${path}`);
      open = { id, lines: [] };
    } else {
      assert(open && open.id === id, `Unpaired snippet end ${id} in ${path}`);
      let lines = open.lines;
      if (format === 'markdown') {
        assert.equal(lines[0]?.trim(), '```powershell', `Missing PowerShell fence for ${id} in ${path}`);
        assert.equal(lines.at(-1)?.trim(), '```', `Unclosed PowerShell fence for ${id} in ${path}`);
        lines = lines.slice(1, -1);
      }
      blocks.set(id, normalize(lines));
      open = undefined;
    }
  }
  assert.equal(open, undefined, `Unclosed snippet in ${path}`);
  return blocks;
}

test('published PowerShell commands match all ten native Windows workflow blocks', () => {
  const workflow = readBlocks('tests/integration/installed/windows-user-workflow.ps1', 'powershell');
  assert.deepEqual([...workflow.keys()].sort(), snippets.map(({ id }) => id).sort());
  const published = new Map<string, string>();
  for (const guide of new Set(snippets.map(({ guide }) => guide))) {
    const blocks = readBlocks(guide, 'markdown');
    assert.deepEqual([...blocks.keys()].sort(), snippets.filter((snippet) => snippet.guide === guide).map(({ id }) => id).sort(), guide);
    for (const [id, commands] of blocks) {
      assert(!published.has(id), `Duplicate published snippet ${id}`);
      published.set(id, commands);
    }
  }
  for (const { id, guide } of snippets) {
    assert.equal(published.get(id), workflow.get(id), `${guide}: ${id} differs from the native workflow`);
  }
});
