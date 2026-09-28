#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const usage = 'Usage: npm create cs-object <project-name> [--skip-install]\n';
let destination: string | undefined;
try {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(usage);
  } else {
    const [name, ...options] = args;
    if (
      !name ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(name) ||
      name.length > 214 ||
      ['node_modules', 'favicon.ico'].includes(name) ||
      options.length > 1 ||
      options.some((option) => option !== '--skip-install')
    )
      throw new Error(usage.trim());
    if (Number(process.versions.node.split('.')[0]) < 24)
      throw new Error('Node.js 24 or newer is required.');
    const target = resolve(name);
    mkdirSync(target); // Exclusive creation preserves existing destinations.
    destination = target;
    cpSync(fileURLToPath(new URL('../template', import.meta.url)), target, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    renameSync(join(target, 'gitignore'), join(target, '.gitignore'));
    writeFileSync(
      join(target, 'package.json'),
      `${JSON.stringify(
        {
          name,
          version: '0.1.0',
          private: true,
          type: 'module',
          engines: { node: '>=24' },
          scripts: {
            setup: 'npm install && node scripts/setup.ts',
            dev: 'node scripts/dev.ts',
            build: 'tsc -b && vite build',
            typecheck: 'tsc -b --pretty false',
          },
          dependencies: {
            '@cs-object/cli': '0.1.0',
            '@cs-object/core': '0.1.0',
            '@base-ui/react': '^1.8.0',
            '@fontsource-variable/geist-mono': '^5.3.0',
            '@fontsource-variable/raleway': '^5.3.0',
            '@hugeicons/core-free-icons': '^4.3.5',
            '@hugeicons/react': '^1.1.10',
            '@tailwindcss/vite': '^4',
            'class-variance-authority': '^0.7.1',
            cn: '^0.4.0',
            react: '^19.2.8',
            'react-dom': '^19.2.8',
            shadcn: '^4.21.0',
            tailwindcss: '^4',
            'tw-animate-css': '^1.4.0',
            vite: '^8',
            zod: '^4.6.5',
          },
          devDependencies: {
            '@types/node': '^24',
            '@types/react': '^19',
            '@types/react-dom': '^19',
            '@vitejs/plugin-react': '^6',
            typescript: '^5',
          },
        },
        null,
        2,
      )}\n`,
    );
    if (!options.includes('--skip-install')) {
      const npmPath = process.env.npm_execpath;
      const result = spawnSync(
        npmPath ? process.execPath : 'npm',
        [...(npmPath ? [npmPath] : []), 'run', 'setup'],
        {
          cwd: target,
          stdio: 'inherit',
          shell: !npmPath && process.platform === 'win32',
        },
      );
      if (result.error || result.status !== 0)
        throw new Error(result.error?.message ?? 'Project setup failed.');
    }
    process.stdout.write(
      `Created ${name}.\n\ncd ${name}\n${options.includes('--skip-install') ? 'npm run setup\n' : ''}npm run dev\n`,
    );
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  if (destination)
    process.stderr.write(
      `Your project remains at ${destination}.\nRun npm run setup in that directory to retry.\n`,
    );
  process.exitCode = 1;
}
