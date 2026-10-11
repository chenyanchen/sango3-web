import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, assetsDir: 'app' },
});
