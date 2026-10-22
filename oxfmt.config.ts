import { defineConfig } from 'oxfmt';

export default defineConfig({
  printWidth: 100,
  singleQuote: true,
  ignorePatterns: ['pnpm-lock.yaml', '**/dist/**', '**/coverage/**', '**/generated/**'],
});
