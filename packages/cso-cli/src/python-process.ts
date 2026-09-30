import { spawnSync } from 'node:child_process';

type PythonProcessRequest = {
  command: 'execute' | 'describe' | 'bindings' | 'export';
  args: string[];
  maxBuffer: number;
  timeout?: number;
  killSignal?: NodeJS.Signals;
};

export function isolatedEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of ['PYTHONPATH', 'PYTHONHOME', 'NODE_PATH'])
    Reflect.deleteProperty(environment, key);
  return environment;
}

export function runPythonProcess({
  command,
  args,
  ...limits
}: PythonProcessRequest) {
  return spawnSync(
    process.env.PYTHON ?? 'python3',
    ['-I', '-X', 'utf8', '-m', 'cso_python', command, ...args],
    { env: isolatedEnvironment(), ...limits },
  );
}
