import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { z } from 'zod';

const backends = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z][a-z0-9-]*$/),
      title: z.string(),
      origin: z.url(),
    }),
  )
  .parse(JSON.parse(process.env.CSO_REPORT_BACKENDS ?? '[]'));
const LinkedRunSchema = z.looseObject({
  html: z.string().startsWith('/api/runs/'),
  pdf: z.string().startsWith('/api/runs/'),
  evidence: z.string().startsWith('/api/runs/'),
});

async function forwardRun(
  request: IncomingMessage,
  response: ServerResponse,
  origin: string,
  reportId: string,
  runId?: string,
) {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    if (request.method === 'POST') {
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > 64 * 1024) {
          request.resume();
          response.statusCode = 413;
          response.end(
            JSON.stringify({ error: 'Request body exceeds 64 KiB' }),
          );
          return;
        }
        chunks.push(bytes);
      }
    }
    const upstream = await fetch(
      new URL(`/api/runs${runId ? `/${runId}` : ''}`, origin),
      {
        method: request.method,
        headers: {
          Origin: origin,
          ...(request.method === 'POST'
            ? { 'Content-Type': request.headers['content-type'] ?? '' }
            : {}),
        },
        ...(request.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      },
    );
    const bodyText = await upstream.text();
    const body: unknown = JSON.parse(bodyText);
    const linked = upstream.ok ? LinkedRunSchema.safeParse(body) : undefined;
    if (upstream.ok && !linked?.success)
      throw new Error('Invalid calculation run links');
    let result = bodyText;
    if (linked?.success) {
      for (const key of ['html', 'pdf', 'evidence'] as const) {
        const before = `${JSON.stringify(key)}:${JSON.stringify(linked.data[key])}`;
        const after = `${JSON.stringify(key)}:${JSON.stringify(`/api/reports/${reportId}${linked.data[key].slice(4)}`)}`;
        if (!result.includes(before))
          throw new Error('Missing calculation run link');
        result = result.replace(before, after);
      }
    }
    response.statusCode = upstream.status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(result);
  } catch {
    response.statusCode = 502;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'Calculation server unavailable' }));
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'cso-report-catalog',
      configureServer(server) {
        server.middlewares.use('/api/reports', (request, response, next) => {
          if (request.url === '/' && request.method === 'GET') {
            response.setHeader(
              'Content-Type',
              'application/json; charset=utf-8',
            );
            response.end(
              JSON.stringify(backends.map(({ id, title }) => ({ id, title }))),
            );
            return;
          }
          const match = /^\/([a-z][a-z0-9-]*)\/runs(?:\/([\da-f-]{36}))?$/.exec(
            request.url ?? '',
          );
          const report = backends.find(({ id }) => id === match?.[1]);
          if (
            !report ||
            !match ||
            (match[2] ? request.method !== 'GET' : request.method !== 'POST')
          )
            return next();
          void forwardRun(
            request,
            response,
            report.origin,
            report.id,
            match[2],
          );
        });
      },
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '127.0.0.1',
    proxy: Object.fromEntries(
      backends.map(({ id, origin }) => [
        `^/api/reports/${id}/`,
        {
          target: origin,
          changeOrigin: true,
          rewrite: (url: string) => url.replace(`/api/reports/${id}/`, '/api/'),
          configure(proxy) {
            proxy.on('proxyReq', (request) =>
              request.setHeader('Origin', origin),
            );
          },
        },
      ]),
    ),
  },
});
