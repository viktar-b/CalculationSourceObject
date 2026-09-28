import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backends: { id: string; title: string; origin: string }[] = JSON.parse(
  process.env.CSO_REPORT_BACKENDS ?? '[]',
);
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'cso-report-catalog',
      configureServer(server) {
        server.middlewares.use('/api/reports', (request, response, next) => {
          if (request.url !== '/' || request.method !== 'GET') return next();
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(
            JSON.stringify(backends.map(({ id, title }) => ({ id, title }))),
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
