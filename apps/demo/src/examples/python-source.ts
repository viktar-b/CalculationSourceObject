import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  ExecutionBindingSchema,
  HashSchema,
  ModuleIdSchema,
  SourceManifestSchema,
  executionBindingKey,
  sourceClosureHash,
  type PreparedDocument,
} from '@viktar-b/cso-core';
import { z } from 'zod';

export const PythonSourceBundleSchema = z
  .strictObject({
    version: z.literal('1'),
    binding: ExecutionBindingSchema,
    files: z
      .array(
        z.strictObject({
          moduleId: ModuleIdSchema,
          sha256: HashSchema,
          code: z.string(),
        }),
      )
      .min(1),
  })
  .superRefine(({ binding, files }, context) => {
    const manifest = SourceManifestSchema.safeParse(
      files.map(({ moduleId, sha256 }) => ({ moduleId, sha256 })),
    );
    if (!manifest.success) {
      context.addIssue({
        code: 'custom',
        path: ['files'],
        message: 'Source files must have unique module paths.',
      });
      return;
    }
    if (sourceClosureHash(manifest.data) !== binding.sourceClosureHash) {
      context.addIssue({
        code: 'custom',
        path: ['binding'],
        message: 'Python files do not match the execution source closure.',
      });
    }
    const entry = files.find(
      ({ moduleId }) => moduleId === binding.entryModuleId,
    );
    if (!entry || entry.sha256 !== binding.entrySourceHash) {
      context.addIssue({
        code: 'custom',
        path: ['binding'],
        message: 'Python entry file does not match the execution.',
      });
    }
    for (const [index, { code, sha256 }] of files.entries()) {
      if (createHash('sha256').update(code, 'utf8').digest('hex') !== sha256) {
        context.addIssue({
          code: 'custom',
          path: ['files', index, 'code'],
          message: 'Python source bytes do not match their recorded hash.',
        });
      }
    }
  });

export type PythonSourceFile = Pick<
  z.infer<typeof PythonSourceBundleSchema>['files'][number],
  'moduleId' | 'code'
>;

export function loadPythonSource({
  path,
  document,
}: {
  readonly path: string;
  readonly document: PreparedDocument;
}): PythonSourceFile[] {
  if (!existsSync(path)) {
    return [];
  }
  const bundle = PythonSourceBundleSchema.parse(
    JSON.parse(readFileSync(path, 'utf8')),
  );
  if (
    document.source.kind !== 'execution' ||
    executionBindingKey(document.source) !== executionBindingKey(bundle.binding)
  ) {
    throw new Error(
      `Python source does not match the prepared document: ${path}`,
    );
  }
  return [...bundle.files]
    .sort((left, right) => {
      const entry =
        Number(right.moduleId === bundle.binding.entryModuleId) -
        Number(left.moduleId === bundle.binding.entryModuleId);
      const generated =
        Number(left.moduleId.startsWith('_cso_bindings/')) -
        Number(right.moduleId.startsWith('_cso_bindings/'));
      return entry || generated || left.moduleId.localeCompare(right.moduleId);
    })
    .map(({ moduleId, code }) => ({ moduleId, code }));
}
