import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: { port: 5173, strictPort: true },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
  },
});
