import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  ResolvedAssetSchema,
  type ExecutionPayload,
  type ResolvedAsset,
} from '@cs-object/core';
import { DocumentPreparationError } from '@cs-object/react';

export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

export function captureAssets(
  sourcePath: string,
  execution: ExecutionPayload,
): ResolvedAsset[] {
  const root = dirname(realpathSync(sourcePath));
  const captures = new Map<string, Buffer>();
  return execution.assets.map((asset) => {
    try {
      const path = realpathSync(
        resolve(root, dirname(asset.moduleId), asset.path),
      );
      const within = relative(root, path);
      if (within === '..' || within.startsWith('../') || isAbsolute(within))
        throw new Error('Asset resolves outside the entry source directory');
      if (!statSync(path).isFile())
        throw new Error('Asset is not a regular file');
      let bytes = captures.get(path);
      if (!bytes) {
        bytes = readFileSync(path);
        captures.set(path, bytes);
      }
      if (sha256(bytes) !== asset.sha256)
        throw new Error('Asset bytes changed since Python capture');
      const png = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (asset.mediaType === 'image/png' && !png)
        throw new Error('Declared PNG has the wrong media signature');
      if (asset.mediaType === 'image/jpeg' && !jpeg)
        throw new Error('Declared JPEG has the wrong media signature');
      if (asset.mediaType === 'image/svg+xml') {
        const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (
          png ||
          jpeg ||
          /<!DOCTYPE|<!ENTITY/i.test(xml) ||
          !/^\s*(?:<\?xml[^?]*\?>\s*)?<svg[\s>]/i.test(xml)
        )
          throw new Error(
            'SVG requires UTF-8 SVG markup without document types or entities',
          );
      }
      return ResolvedAssetSchema.parse({
        asset,
        dataUrl: `data:${asset.mediaType};base64,${bytes.toString('base64')}`,
      });
    } catch (error) {
      throw new DocumentPreparationError([
        {
          code: 'ASSET_CAPTURE_FAILED',
          stage: 'document',
          message: `${asset.moduleId}:${asset.path}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ]);
    }
  });
}
