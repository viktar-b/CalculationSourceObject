import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const python = join(
  project,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);

function awaitOrigin(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    const finish = (error?: Error, origin?: string) => {
      clearTimeout(timeout);
      child.off('error', onError);
      child.off('exit', onExit);
      child.stdout?.off('data', onData);
      if (error) reject(error);
      else if (origin) resolve(origin);
    };
    const onError = (error: Error) => finish(error);
    const onExit = (code: number | null) =>
      finish(new Error(`Calculation server exited (${code})`));
    const onData = (chunk: string) => {
      stdout += chunk;
      const match = /CSO dev (http:\/\/127\.0\.0\.1:\d+)/.exec(stdout);
      if (match?.[1]) finish(undefined, match[1]);
    };
    const timeout = setTimeout(
      () => finish(new Error('Calculation server did not start')),
      30_000,
    );
    child.once('error', onError);
    child.once('exit', onExit);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', onData);
  });
}

async function main() {
  if (!existsSync(python))
    throw new Error(
      'Run npm run setup to prepare the project Python environment.',
    );
  const { loadReports } = await import('./reports.ts');
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--port'))
    throw new Error('Usage: npm run dev -- [--port 0-65535]');
  const spelling = args[1] ?? '5173';
  if (!/^\d+$/.test(spelling) || Number(spelling) > 65535)
    throw new Error('--port must be an integer between 0 and 65535');
  const port = Number(spelling);
  const reports = loadReports(project);
  const require = createRequire(import.meta.url);
  const cli = join(
    dirname(require.resolve('@cs-object/cli/package.json')),
    'dist/cli.js',
  );
  const children: ChildProcess[] = [];
  let vite: Awaited<ReturnType<typeof import('vite').createServer>> | undefined;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill('SIGTERM');
    if (vite) void vite.close();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    const backends = [];
    for (const report of reports) {
      const child = spawn(
        process.execPath,
        [
          cli,
          'dev',
          report.source,
          '--function',
          report.function,
          ...(report.reference ? ['--reference', report.reference] : []),
          '--port',
          '0',
        ],
        {
          cwd: project,
          env: { ...process.env, PYTHON: python },
          stdio: ['ignore', 'pipe', 'inherit'],
        },
      );
      children.push(child);
      const origin = await awaitOrigin(child);
      child.once('exit', (code) => {
        if (stopping) return;
        process.stderr.write(
          `Calculation server for ${report.id} exited (${code}).\n`,
        );
        process.exitCode = code || 1;
        stop();
      });
      backends.push({ id: report.id, title: report.title, origin });
    }
    process.env.CSO_REPORT_BACKENDS = JSON.stringify(backends);
    const { createServer } = await import('vite');
    vite = await createServer({
      server: { host: '127.0.0.1', port, strictPort: port !== 0 },
    });
    await vite.listen();
    const address = vite.httpServer?.address();
    if (!address || typeof address === 'string')
      throw new Error('Vite has no localhost address');
    process.stdout.write(`CSO dev http://127.0.0.1:${address.port}\n`);
  } catch (error) {
    stop();
    throw error;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
