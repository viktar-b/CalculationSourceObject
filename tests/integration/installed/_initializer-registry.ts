import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { request as requestHttps } from 'node:https';
import { join, sep } from 'node:path';
import { z } from 'zod';
import type { CommandRunner } from './_initializer-processes.ts';

const PackResultSchema = z
  .array(z.looseObject({ filename: z.string().min(1) }))
  .length(1);
const PackageManifestSchema = z.looseObject({
  name: z.string().min(1),
  version: z.string().min(1),
});
type PackageManifest = z.infer<typeof PackageManifestSchema>;
export type RegistryPackage = {
  readonly archive: string;
  readonly filename: string;
  readonly manifest: PackageManifest;
  readonly integrity: string;
  readonly shasum: string;
};

export async function pack(options: {
  readonly workspace: string;
  readonly repository: string;
  readonly archives: string;
  readonly run: CommandRunner;
}): Promise<string> {
  const result = PackResultSchema.parse(
    JSON.parse(
      await options.run({
        cwd: options.repository,
        command: 'npm',
        args: [
          'pack',
          '--workspace',
          options.workspace,
          '--ignore-scripts',
          '--pack-destination',
          options.archives,
          '--json',
        ],
      }),
    ),
  );
  const item = result[0];
  if (!item)
    throw new Error(`npm pack returned no archive for ${options.workspace}`);
  return join(options.archives, item.filename);
}

export async function registryPackage(options: {
  readonly archive: string;
  readonly root: string;
  readonly run: CommandRunner;
}): Promise<RegistryPackage> {
  const manifest = PackageManifestSchema.parse(
    JSON.parse(
      await options.run({
        cwd: options.root,
        command: 'tar',
        args: ['-xOf', options.archive, 'package/package.json'],
      }),
    ),
  );
  const bytes = readFileSync(options.archive);
  return {
    archive: options.archive,
    filename: options.archive.slice(options.archive.lastIndexOf(sep) + 1),
    manifest,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    shasum: createHash('sha1').update(bytes).digest('hex'),
  };
}

function listen(server: Server): Promise<string> {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      const address = server.address();
      if (!address || typeof address === 'string')
        return rejectListen(new Error('Registry has no loopback address'));
      resolveListen(`http://127.0.0.1:${address.port}`);
    });
  });
}

export function closeRegistry(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

export async function startRegistry(
  packageList: readonly RegistryPackage[],
): Promise<{ readonly origin: string; readonly server: Server }> {
  let origin = '';
  const packages = new Map(
    packageList.map((item) => [item.manifest.name, item]),
  );
  const tarballs = new Map(packageList.map((item) => [item.filename, item]));
  const server = createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    const requested = new URL(request.url ?? '/', 'http://registry.invalid');
    if (requested.pathname.startsWith('/tarballs/')) {
      const item = tarballs.get(
        decodeURIComponent(requested.pathname.slice('/tarballs/'.length)),
      );
      if (!item) {
        response.writeHead(404).end();
        return;
      }
      const bytes = readFileSync(item.archive);
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': bytes.length,
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
      return;
    }
    const key = decodeURIComponent(requested.pathname.slice(1));
    const item = packages.get(key);
    if (item) {
      const version = item.manifest.version;
      const body = Buffer.from(
        JSON.stringify({
          _id: item.manifest.name,
          name: item.manifest.name,
          'dist-tags': { latest: version },
          versions: {
            [version]: {
              ...item.manifest,
              dist: {
                integrity: item.integrity,
                shasum: item.shasum,
                tarball: `${origin}/tarballs/${encodeURIComponent(item.filename)}`,
              },
            },
          },
        }),
      );
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': body.length,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }
    const headers = { ...request.headers, host: 'registry.npmjs.org' };
    Reflect.deleteProperty(headers, 'authorization');
    const upstream = requestHttps(
      {
        hostname: 'registry.npmjs.org',
        method: request.method,
        path: request.url,
        headers,
      },
      (upstreamResponse) => {
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.headers,
        );
        upstreamResponse.pipe(response);
      },
    );
    upstream.once('error', (error) => {
      if (!response.headersSent) response.writeHead(502);
      response.end(error.message);
    });
    upstream.setTimeout(30_000, () =>
      upstream.destroy(new Error('Official npm registry request timed out')),
    );
    upstream.end();
  });
  origin = await listen(server);
  return { origin, server };
}
