import { spawnSync } from 'node:child_process';

export const bindingsHelp = `Usage: cso bindings <directory> [--check]

Generate importable _cso_bindings modules and typed signatures from .cso.py files.
--check reports stale or missing files without writing. Calculations are not executed.
Python-only equivalent: python -m cso_python bindings <directory> [--check]
Set PYTHON to the interpreter with cso-python installed.
Exit codes: 0 current/generated, 1 stale/source/write failure, 2 invalid usage.
`;

export function bindingsCommand(args: string[]): number {
  const environment = { ...process.env };
  for (const key of ['PYTHONPATH', 'PYTHONHOME', 'NODE_PATH']) {
    Reflect.deleteProperty(environment, key);
  }
  const result = spawnSync(
    process.env.PYTHON ?? 'python3',
    ['-I', '-m', 'cso_python', 'bindings', ...args],
    { env: environment, maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.signal) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        diagnostics: [
          {
            code: 'PYTHON_PROCESS_FAILED',
            message:
              result.error?.message ?? `Python terminated by ${result.signal}`,
          },
        ],
      })}\n`,
    );
    return 1;
  }
  process.stdout.write(result.stdout);
  return result.status ?? 1;
}
