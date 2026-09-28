import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const python = join(project, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

async function main() {
  if (!existsSync(python)) throw new Error('Run npm run setup to prepare the project Python environment.');
  const portArg = process.argv.indexOf('--port');
  const spelling = portArg < 0 ? '5173' : process.argv[portArg + 1];
  if (!spelling || !/^\d+$/.test(spelling) || Number(spelling) > 65535)
    throw new Error('--port must be an integer between 0 and 65535');
  const port = Number(spelling);
  const forwarded = process.argv.slice(2);
  if (portArg >= 0) forwarded.splice(portArg - 2, 2);
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve('@cs-object/cli/package.json')), 'dist/cli.js');
  const backend = spawn(process.execPath, [cli, 'dev', 'calculations/report.cso.py', '--function', 'calculate', ...forwarded, '--port', '0'], {
    cwd: project,
    env: { ...process.env, PYTHON: python },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise<string>((resolve, reject) => {
    let stdout = '';
    const finish = (error?: Error, value?: string) => {
      clearTimeout(timeout);
      backend.off('error', onError);
      backend.off('exit', onExit);
      backend.stdout.off('data', onData);
      if (error) reject(error);
      else if (value) resolve(value);
    };
    const onError = (error: Error) => finish(error);
    const onExit = (code: number | null) => finish(new Error(`Calculation server exited (${code})`));
    const onData = (chunk: string) => {
      stdout += chunk;
      const match = /CSO dev (http:\/\/127\.0\.0\.1:\d+)/.exec(stdout);
      if (match?.[1]) finish(undefined, match[1]);
    };
    const timeout = setTimeout(() => finish(new Error('Calculation server did not start')), 30_000);
    backend.once('error', onError);
    backend.once('exit', onExit);
    backend.stdout.setEncoding('utf8');
    backend.stdout.on('data', onData);
  }).catch((error: unknown) => {
    backend.kill('SIGTERM');
    throw error;
  });
  let vite: Awaited<ReturnType<typeof import('vite').createServer>>;
  try {
    process.env.CSO_API_ORIGIN = origin;
    const { createServer } = await import('vite');
    vite = await createServer({ server: { host: '127.0.0.1', port, strictPort: port !== 0 } });
    await vite.listen();
  } catch (error) {
    backend.kill('SIGTERM');
    throw error;
  }
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite has no localhost address');
  process.stdout.write(`CSO dev http://127.0.0.1:${address.port}\n`);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    backend.kill('SIGTERM');
    void vite.close();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  backend.once('exit', (code) => {
    if (!stopping) {
      process.stderr.write(`Calculation server exited (${code}).\n`);
      process.exitCode = code || 1;
      stop();
    }
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
