import assert from 'node:assert/strict';
import { ExecutionResponseSchema } from '@cs-object/core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { CommandRunner } from './_initializer-processes.ts';

function checkLinks(path: string) {
  const content = readFileSync(path, 'utf8');
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1];
    assert(target);
    if (/^https?:\/\//.test(target)) continue;
    const [relative, anchor] = target.split('#');
    const linked = relative ? resolve(dirname(path), relative) : path;
    assert(existsSync(linked), `${path}: missing ${target}`);
    if (anchor) {
      const headings = [
        ...readFileSync(linked, 'utf8').matchAll(/^#+ (.+)$/gm),
      ].map((heading) =>
        heading[1]
          ?.toLowerCase()
          .replace(/[^a-z0-9 -]/g, '')
          .replaceAll(' ', '-'),
      );
      assert(headings.includes(anchor), `${path}: missing anchor ${target}`);
    }
  }
}

// Exercise the files and commands shipped to a user, rather than repo examples.
export async function exerciseGuidance(options: {
  readonly project: string;
  readonly installedPython: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly run: CommandRunner;
}) {
  const { project, installedPython, environment, run } = options;
  const version = (
    await run({
      cwd: project,
      command: installedPython,
      args: [
        '-I',
        '-c',
        'from importlib.metadata import version; print(version("cs-object"))',
      ],
    })
  ).trim();
  assert.equal(
    readFileSync(join(project, 'requirements.txt'), 'utf8').trim(),
    `cs-object==${version}`,
  );
  const exported = await run({
    cwd: project,
    command: installedPython,
    args: ['-I', '-X', 'utf8', '-m', 'cso_python', 'authoring'],
  });
  const contract = readFileSync(join(project, 'authoring-contract.md'), 'utf8');
  assert.equal(
    contract,
    exported,
    'Setup must export the exact installed contract',
  );
  assert(contract.includes(`cs-object ${version}`));
  for (const name of [
    'README.md',
    'AGENTS.md',
    'brief.md',
    'authoring.md',
    'authoring-contract.md',
    'references/README.md',
  ])
    checkLinks(join(project, name));

  const trial = join(project, 'guidance-trial');
  mkdirSync(trial, { recursive: true });
  const recipe = contract.split('## Author a composed report\n')[1];
  assert(recipe, 'The installed guide must include the composed report recipe');
  const blocks = [...recipe.matchAll(/```(?:python|svg)\n([\s\S]*?)```/g)];
  const files = [
    'quantities.py',
    'geometry.cso.py',
    'composed.cso.py',
    'assets/pair.svg',
  ];
  assert.equal(blocks.length, files.length);
  // Write geometry first, as the documented intermediate generation step requires.
  for (const [index, relative] of files.entries()) {
    const block = blocks[index]?.[1];
    assert(block);
    const destination = join(trial, 'calculations', relative);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, block);
    if (relative === 'geometry.cso.py')
      await run({
        cwd: trial,
        command: installedPython,
        args: ['-I', '-m', 'cso_python', 'bindings', 'calculations'],
      });
  }
  await run({
    cwd: trial,
    command: installedPython,
    args: ['-I', '-m', 'cso_python', 'bindings', 'calculations'],
  });
  const cli = join(project, 'node_modules/@cs-object/cli/dist/cli.js');
  const reportSchema = z.looseObject({
    ok: z.literal(true),
    checks: z.looseObject({
      sourceToDocumentConsistency: z.looseObject({
        status: z.literal('passed'),
      }),
    }),
  });
  const env = { ...environment, PYTHON: installedPython };
  const common = ['calculations/composed.cso.py', '--function', 'calculate'];
  const capture = ExecutionResponseSchema.parse(
    JSON.parse(
      await run({
        cwd: trial,
        command: installedPython,
        args: ['-I', '-m', 'cso_python', 'execute', ...common],
      }),
    ),
  );
  assert(capture.ok);
  // Independently derived in the recipe, not copied from execution answers.
  assert.deepEqual(
    capture.execution.observations
      .filter((item) => item.kind === 'formula')
      .map((item) => item.value)
      .sort((a, b) => a - b),
    [6, 12],
  );
  const verification = reportSchema.parse(
    JSON.parse(
      await run({
        cwd: trial,
        command: process.execPath,
        args: [cli, 'verify', ...common, '--format', 'json'],
        env,
      }),
    ),
  );
  writeFileSync(
    join(trial, 'guidance-verification.json'),
    `${JSON.stringify(verification, null, 2)}\n`,
  );
  mkdirSync(join(trial, 'output'), { recursive: true });
  await run({
    cwd: trial,
    command: process.execPath,
    args: [
      cli,
      'html',
      ...common,
      '--out',
      'output/composed.html',
      '--check-layout',
      '--format',
      'json',
    ],
    env,
  });
  const html = readFileSync(join(trial, 'output/composed.html'), 'utf8');
  for (const expected of [
    'Combined area',
    'Rectangle area',
    'Rectangle dimensions',
    'data:image/svg+xml',
  ])
    assert(html.includes(expected), `Missing recipe content: ${expected}`);
  return { trial };
}
