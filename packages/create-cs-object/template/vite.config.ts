import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiOrigin = process.env.CSO_API_ORIGIN;
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '127.0.0.1',
    proxy: apiOrigin ? {
      '/api': {
        target: apiOrigin,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (request) => request.setHeader('Origin', apiOrigin));
        },
      },
    } : undefined,
  },
});
