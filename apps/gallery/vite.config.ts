import { defineConfig } from 'vite';

export default defineConfig({
  logLevel: 'warn',
  base: './',
  build: { outDir: '../coolp/assets/gallery', emptyOutDir: true },
  server: { proxy: { '/v1': 'http://127.0.0.1:3000' } },
});
