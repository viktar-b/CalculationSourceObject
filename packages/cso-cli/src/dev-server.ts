import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { resolve } from 'node:path';
import {
  PythonIdentifierSchema,
  type CalculationDefinition,
} from '@cs-object/core';
import { UsageError } from './arguments.ts';
import { HttpError } from './dev-errors.ts';
import {
  createDevRuntime,
  type DevLimits,
  type DevTarget,
} from './dev-runtime.ts';
import { jsonBytes } from './evidence.ts';
import { parseStrictJson } from './strict-json.ts';
import { devPage } from './dev-ui.ts';

type DevOptions = DevTarget & { port: number };
export const devHelp = `Usage: cso dev <file.cso.py> --function <name> [--port <0-65535>] [--reference <file.json>]

Serve a verified calculation on 127.0.0.1. Port 0 chooses an available port.
PYTHON selects the installed cso-python interpreter. Source path and function are fixed at startup.
`;
export function parseDevArgs(args: string[]): DevOptions {
  const [source, ...rest] = args;
  if (!source || source.startsWith('-')) throw new UsageError(devHelp);
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (
      !['--function', '--port', '--reference'].includes(key) ||
      values.has(key) ||
      !value ||
      value.startsWith('--')
    )
      throw new UsageError(devHelp);
    values.set(key, value);
  }
  const functionName = values.get('--function');
  if (!functionName || !PythonIdentifierSchema.safeParse(functionName).success)
    throw new UsageError('--function requires a Python identifier');
  const normalizedFunction = functionName.normalize('NFKC');
  if (!PythonIdentifierSchema.safeParse(normalizedFunction).success)
    throw new UsageError(
      '--function does not normalize to a valid Python identifier',
    );
  const spelling = values.get('--port') ?? '3000';
  const port = Number(spelling);
  if (!/^\d+$/.test(spelling) || !Number.isInteger(port) || port > 65535)
    throw new UsageError('--port must be an integer between 0 and 65535');
  const reference = values.get('--reference');
  return {
    sourcePath: resolve(source),
    functionName: normalizedFunction,
    port,
    ...(reference ? { referencePath: resolve(reference) } : {}),
  };
}
export function parseDevInputs(
  text: string,
  definition: Pick<CalculationDefinition, 'inputs'>,
): Record<string, number> {
  let body: unknown;
  try {
    body = parseStrictJson(text);
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : 'Invalid JSON',
    );
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !('inputs' in body)
  )
    throw new HttpError(400, 'Request must contain only an inputs object');
  const values = body.inputs;
  if (!values || typeof values !== 'object' || Array.isArray(values))
    throw new HttpError(400, 'inputs must be an object');
  const parameters = new Map(
    definition.inputs.map((input) => [input.name, input]),
  );
  const entries: [string, number][] = [];
  for (const [name, value] of Object.entries(values)) {
    const input = parameters.get(name);
    if (!input) throw new HttpError(400, `Unknown input ${name}`);
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (input.numericType === 'int' && !Number.isSafeInteger(value))
    )
      throw new HttpError(
        400,
        `${name} requires a finite ${input.numericType === 'int' ? 'safe integer' : 'number'}`,
      );
    entries.push([
      name,
      input.numericType === 'int' && Object.is(value, -0) ? 0 : value,
    ]);
  }
  // JSON.parse rounds large integer tokens before numeric types can inspect them.
  for (const match of text.matchAll(
    /("(?:[^"\\]|\\.)*")\s*:\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
  )) {
    const name: unknown = JSON.parse(match[1]);
    const token = match[2];
    if (
      typeof name === 'string' &&
      parameters.get(name)?.numericType === 'int' &&
      /[.eE]/.test(token)
    )
      throw new HttpError(
        400,
        `${name} requires an integer token without a decimal or exponent`,
      );
    if (!/[.eE]/.test(token) && !Number.isSafeInteger(Number(token)))
      throw new HttpError(
        400,
        'Integer tokens must be within the safe integer range; use a decimal or exponent for floats',
      );
  }
  for (const input of definition.inputs) {
    if (!Object.hasOwn(values, input.name) && input.default === undefined)
      throw new HttpError(400, `Missing input ${input.name}`);
  }
  return Object.fromEntries(entries);
}
function withLinks(
  summary: ReturnType<ReturnType<typeof createDevRuntime>['summary']>,
) {
  const base = `/api/runs/${summary.id}`;
  return {
    ...summary,
    html: `${base}/report.html`,
    pdf: `${base}/report.pdf`,
    evidence: `${base}/evidence.json`,
  };
}
function send(
  response: ServerResponse,
  status: number,
  data: Buffer,
  type: string,
) {
  response.writeHead(status, {
    'Content-Type': type,
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(data);
}
async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 64 * 1024) {
      request.resume();
      throw new HttpError(413, 'Request body exceeds 64 KiB');
    }
    chunks.push(bytes);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    throw new HttpError(400, 'Request must be UTF-8 JSON');
  }
}

export async function startDevServer(options: DevOptions, limits?: DevLimits) {
  const runtime = createDevRuntime(options, limits);
  let origin = '';
  let stopping = false;
  const server = createServer(async (request, response) => {
    try {
      if (stopping) throw new HttpError(503, 'Server is shutting down');
      if (
        request.headers.host !== new URL(origin).host ||
        (request.headers.origin !== undefined &&
          request.headers.origin !== origin)
      )
        throw new HttpError(
          403,
          'Only same-origin localhost requests are accepted',
        );
      const url = new URL(request.url ?? '/', origin);
      if (url.origin !== origin)
        throw new HttpError(403, 'Invalid request origin');
      if (request.method === 'GET' && url.pathname === '/') {
        response.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; object-src 'none'; base-uri 'none'",
        );
        return send(
          response,
          200,
          Buffer.from(devPage.html),
          'text/html; charset=utf-8',
        );
      }
      if (request.method === 'GET' && url.pathname === '/app.js')
        return send(
          response,
          200,
          Buffer.from(devPage.script),
          'text/javascript; charset=utf-8',
        );
      if (request.method === 'GET' && url.pathname === '/api/definition')
        return send(
          response,
          200,
          jsonBytes(runtime.definition()),
          'application/json',
        );
      if (
        request.method === 'POST' &&
        ['/api/calculate', '/api/runs'].includes(url.pathname)
      ) {
        if (
          !/^application\/json(?:\s*;.*)?$/i.test(
            request.headers['content-type'] ?? '',
          )
        )
          throw new HttpError(415, 'Content-Type must be application/json');
        const body = await readBody(request);
        const definition = runtime.definition();
        const invocation = {
          definition,
          inputs: parseDevInputs(body, definition),
        };
        if (url.pathname === '/api/calculate')
          return send(
            response,
            200,
            jsonBytes(runtime.calculate(invocation)),
            'application/json',
          );
        return send(
          response,
          201,
          jsonBytes(withLinks(runtime.createRun(invocation))),
          'application/json',
        );
      }
      const match =
        /^\/api\/runs\/([\da-f-]{36})(?:\/(report\.html|report\.pdf|evidence\.json))?$/.exec(
          url.pathname,
        );
      if (request.method === 'GET' && match) {
        const id = match[1];
        if (match[2] === 'report.html')
          return send(
            response,
            200,
            runtime.html(id),
            'text/html; charset=utf-8',
          );
        if (match[2] === 'report.pdf') {
          const artifact = await runtime.pdf(id);
          response.setHeader(
            'Content-Disposition',
            'attachment; filename="calculation.pdf"',
          );
          response.setHeader('X-CSO-PDF-SHA256', artifact.sha256);
          return send(response, 200, artifact.bytes, 'application/pdf');
        }
        if (match[2] === 'evidence.json') {
          response.setHeader(
            'Content-Disposition',
            'attachment; filename="calculation-evidence.json"',
          );
          return send(response, 200, runtime.evidence(id), 'application/json');
        }
        return send(
          response,
          200,
          jsonBytes(withLinks(runtime.summary(id))),
          'application/json',
        );
      }
      throw new HttpError(404, 'Not found');
    } catch (error) {
      if (response.destroyed || response.headersSent) return;
      const failure =
        error instanceof HttpError
          ? error
          : new HttpError(
              500,
              error instanceof Error ? error.message : 'Request failed',
            );
      if (failure.status === 413) response.setHeader('Connection', 'close');
      send(
        response,
        failure.status,
        jsonBytes({ error: failure.message, diagnostics: failure.diagnostics }),
        'application/json',
      );
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 16;
  server.keepAliveTimeout = 5_000;
  try {
    await new Promise<void>((success, failure) => {
      server.once('error', failure);
      server.listen(options.port, '127.0.0.1', () => {
        server.off('error', failure);
        success();
      });
    });
  } catch (error) {
    await runtime.close();
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing localhost address');
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    close: async () => {
      stopping = true;
      const closed = new Promise<void>((done) => server.close(() => done()));
      server.closeAllConnections();
      await Promise.allSettled([closed, runtime.close()]);
    },
  };
}
export async function devCommand(args: string[]) {
  const server = await startDevServer(parseDevArgs(args));
  process.stdout.write(`CSO dev ${server.origin}\n`);
  const stop = () => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    void server.close();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
