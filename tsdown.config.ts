import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { coolp: 'apps/coolp/src/cli.ts' },
  outDir: 'apps/coolp/dist',
  format: 'esm',
  platform: 'node',
  target: 'node24',
  dts: false,
  shims: true,
  deps: { alwaysBundle: [/.*/], neverBundle: ['@resvg/resvg-js'] },
  outputOptions: { entryFileNames: '[name].mjs' },
});
