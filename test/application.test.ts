import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createCardRegistry, defineCard } from '../packages/card-kit/src/index.js';
import * as z from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { svgDocument } from '../packages/graphics/src/index.js';
import { cards } from '../cards/stats/src/index.js';
import { loadConfiguration, resolveCardRequest } from '../apps/coolp/src/config/index.js';
import { createRenderer } from '../apps/coolp/src/render.js';
import { createImageServer } from '../apps/coolp/src/server.js';
import {
  fixedNow,
  fixtureApi,
  fixtureEnvironment,
  fixtureProviders,
  fixtureFetch,
} from './fixtures/upstream.js';

const registry = createCardRegistry(cards);
const servers: Server[] = [];
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((done) => {
          server.close(() => done());
          server.closeAllConnections();
        }),
    ),
  );
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function listen(server: Server): Promise<number> {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  return address.port;
}
async function folder() {
  const path = await mkdtemp(resolve(tmpdir(), 'coolp-application-'));
  folders.push(path);
  return path;
}

it('delivers the same outlined Chinese SVG as file generation with HEAD and conditional HTTP requests', async () => {
  const configuration = await loadConfiguration(registry, {
    cwd: await folder(),
    environment: { COOLP__RUNTIME__PROVIDERS: JSON.stringify(fixtureProviders) },
  });
  const renderer = await createRenderer({
    registry,
    configuration,
    environment: fixtureEnvironment,
    fetch: fixtureFetch(),
    now: () => fixedNow,
  });
  const request = resolveCardRequest(configuration, registry, 'stats', {
    inputs: [{ source: 'CLI', params: { source: 'cnb', subject: 'author' } }],
  });
  const file = await renderer.render(request);
  expect(file.bytes.toString()).toContain('个人统计');
  expect(file.bytes.toString()).toContain('测试用户');
  expect(file.bytes.toString()).not.toContain('<text');
  const port = await listen(createImageServer({ registry, configuration, renderer }));
  const url = 'http://127.0.0.1:' + port + '/v1/cards/stats.svg?source=cnb&subject=author';
  const image = await fetch(url);
  expect(Buffer.from(await image.arrayBuffer())).toEqual(file.bytes);
  expect(image.headers.get('etag')).toBe(file.etag);
  const head = await fetch(url, { method: 'HEAD' });
  expect(head.headers.get('content-length')).toBe(String(file.bytes.length));
  expect(await head.text()).toBe('');
  expect((await fetch(url, { headers: { 'If-None-Match': 'W/' + file.etag } })).status).toBe(304);
  expect((await fetch(url + '&port=9999')).status).toBe(400);
  expect((await fetch('http://127.0.0.1:' + port + '/v1/cards/missing.svg')).status).toBe(404);
  expect((await fetch(url, { method: 'POST' })).status).toBe(405);
  const png = await fetch(url.replace('stats.svg', 'stats.png') + '&locale=en&theme=dark');
  expect(png.headers.get('content-type')).toBe('image/png');
  expect(Buffer.from(await png.arrayBuffer()).subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
});

it('changes the ETag when live data changes and reports upstream failures as JSON', async () => {
  let revision = 1;
  const configuration = await loadConfiguration(registry, {
    cwd: await folder(),
    environment: { COOLP__RUNTIME__CACHE__TTL: '0' },
  });
  const renderer = await createRenderer({
    registry,
    configuration,
    environment: fixtureEnvironment,
    fetch: fixtureFetch(() => revision),
    now: () => fixedNow,
  });
  const request = resolveCardRequest(configuration, registry, 'stats', {
    inputs: [{ source: 'test', params: { source: 'github', subject: 'author' } }],
  });
  const first = await renderer.render(request);
  revision++;
  const second = await renderer.render(request);
  expect(first.etag).not.toBe(second.etag);
  const failed = await createRenderer({
    registry,
    configuration,
    environment: fixtureEnvironment,
    fetch: async () => new Response('private upstream content', { status: 503 }),
  });
  const port = await listen(createImageServer({ registry, configuration, renderer: failed }));
  const response = await fetch(
    'http://127.0.0.1:' + port + '/v1/cards/stats?source=github&subject=author',
  );
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('private upstream content');
});

async function cli(
  args: string[],
  environment: NodeJS.ProcessEnv,
  entry = resolve('apps/coolp/dist/coolp.mjs'),
) {
  const child = spawn(process.execPath, [entry, ...args], {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const [code] = await once(child, 'exit');
  return { code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString() };
}

it('runs the built CLI for file, stdout, plugin, batch and offline dry-run modes', async () => {
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    try {
      const body = fixtureApi(
        new URL(request.url!, 'http://fixture'),
        Buffer.concat(chunks).toString(),
      );
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  const port = await listen(upstream);
  const cwd = await folder();
  const config = resolve(cwd, 'coolp.json');
  await writeFile(
    config,
    JSON.stringify({
      runtime: {
        providers: {
          github: { 'base-url': 'http://127.0.0.1:' + port + '/github' },
          cnb: { 'base-url': 'http://127.0.0.1:' + port + '/cnb' },
        },
      },
      jobs: [{ card: 'stats', params: { source: 'cnb', subject: 'author' }, output: 'batch.svg' }],
    }),
  );
  const environment = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.startsWith('PLUGIN_') && !key.startsWith('COOLP_'),
      ),
    ),
    ...fixtureEnvironment,
  };
  const target = resolve(cwd, 'file.svg');
  const alias = resolve(cwd, 'coolp');
  await symlink(resolve('apps/coolp/dist/coolp.mjs'), alias);
  const version = await cli(['--version'], environment, alias);
  expect(version.code, version.stderr).toBe(0);
  expect(version.stdout.toString()).toMatch(/^\d+\.\d+\.\d+/);
  const render = await cli(
    ['render', 'stats', '--config', config, '--source', 'cnb', '--subject', 'author', '-o', target],
    environment,
  );
  expect(render.code, render.stderr).toBe(0);
  expect(await readFile(target, 'utf8')).toContain('个人统计');
  const stdout = await cli(
    [
      'render',
      'stats',
      '--config',
      config,
      '--source',
      'github',
      '--subject',
      'author',
      '--format',
      'png',
      '-o',
      '-',
    ],
    environment,
  );
  expect(stdout.code, stdout.stderr).toBe(0);
  expect(stdout.stdout.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const plugin = await cli(['render'], {
    ...environment,
    PLUGIN_CARD: 'stats',
    PLUGIN_SOURCE: 'cnb',
    PLUGIN_SUBJECT: 'author',
    PLUGIN_CONFIG: config,
    PLUGIN_OUTPUT: resolve(cwd, 'plugin.svg'),
  });
  expect(plugin.code, plugin.stderr).toBe(0);
  const batch = await cli(['batch', '--config', config, '--output-dir', cwd], environment);
  expect(batch.code, batch.stderr).toBe(0);
  expect(await readFile(resolve(cwd, 'batch.svg'), 'utf8')).toContain('测试用户');
  const preview = await cli(
    ['render', 'stats', '--config', config, '--source', 'cnb', '--subject', 'author', '--dry-run'],
    { ...environment, CNB_TOKEN: '' },
  );
  expect(preview.code, preview.stderr).toBe(0);
  expect(JSON.parse(preview.stdout.toString()).jobs[0].params).toEqual({
    source: 'cnb',
    subject: 'author',
  });
  expect(preview.stdout.toString()).not.toContain('fixture-github-token');
  const invalid = await cli(['render', 'stats', '--subject', 'author'], environment);
  expect(invalid.code).toBe(2);
}, 15000);

it('limits concurrent drawing and encoding and releases a failed job for the next request', async () => {
  for (const concurrency of [1, 2]) {
    let active = 0;
    let maximum = 0;
    let fail = true;
    const entry = defineCard({
      id: 'queue-test',
      params: z.strictObject({ index: z.number().int() }),
      formats: ['svg'],
      themes: ['default'],
      locales: ['zh-CN', 'en'],
      async load() {
        return undefined;
      },
      async render(_ctx, _data, params) {
        active++;
        maximum = Math.max(maximum, active);
        try {
          await delay(5);
          if (fail && params.index === 0) throw new Error('Drawing failed');
          return svgDocument(10, 10, '<rect width="10" height="10"/>');
        } finally {
          active--;
        }
      },
    });
    const entries = createCardRegistry([entry]);
    const configuration = await loadConfiguration(entries, {
      cwd: await folder(),
      environment: { COOLP__RUNTIME__RENDER_CONCURRENCY: String(concurrency) },
    });
    const renderer = await createRenderer({ registry: entries, configuration, environment: {} });
    const requests = [0, 1, 2].map((index) =>
      resolveCardRequest(configuration, entries, 'queue-test', {
        inputs: [{ source: 'test', params: { index } }],
      }),
    );
    const results = await Promise.allSettled(requests.map((request) => renderer.render(request)));
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
    expect(maximum).toBe(concurrency);
    fail = false;
    expect((await renderer.render(requests[0]!)).mime).toBe('image/svg+xml');
  }
});
