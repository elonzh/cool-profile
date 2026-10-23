import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  logLevel: 'warn',
  base: './',
  build: { outDir: mode === 'pages' ? 'dist' : '../coolp/assets/gallery', emptyOutDir: true },
  server: { proxy: { '/v1': 'http://127.0.0.1:3000' } },
}));
