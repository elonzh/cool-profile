#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const args = ['render', process.env.INPUT_CARD ?? ''];
for (const name of [
  'params',
  'format',
  'theme',
  'locale',
  'seed',
  'config',
  'output',
  'output-dir',
]) {
  const value = process.env['INPUT_' + name.toUpperCase().replaceAll('-', '_')];
  if (value) args.push('--' + name, value);
}
const env = { ...process.env };
if (process.env.INPUT_GITHUB_TOKEN) env.GITHUB_TOKEN = process.env.INPUT_GITHUB_TOKEN;
if (process.env.INPUT_CNB_TOKEN) env.CNB_TOKEN = process.env.INPUT_CNB_TOKEN;
const child = spawn(
  process.execPath,
  [fileURLToPath(new URL('./dist/coolp.mjs', import.meta.url)), ...args],
  { env, stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
try {
  const [code, signal] = await once(child, 'exit');
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143);
} catch {
  process.stderr.write('Failed to start coolp\n');
  process.exitCode = 1;
}
