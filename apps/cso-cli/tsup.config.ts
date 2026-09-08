import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/development.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  // Keep the development renderer in its own lazy chunk so verify needs only core.
  splitting: true,
  external: [
    '@viktar-b/cso-core',
    '@viktar-b/cso-react',
    'react',
    'react-dom/server',
    'playwright',
  ],
});
