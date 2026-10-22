import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const image = process.argv[2];
const platform = process.argv[3];
if (!image) throw new Error('Usage: node scripts/verify-image.mjs <image> [platform]');
const repository = JSON.parse(
  readFileSync(new URL('../test/fixtures/repositories.json', import.meta.url), 'utf8'),
).github;

async function verifyRuntime(fixture) {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { spawn, execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { createRequire } = await import('node:module');
  const { setTimeout: delay } = await import('node:timers/promises');
  const assert = (await import('node:assert/strict')).default;
  const require = createRequire('/opt/cool-profile/package.json');
  const { Resvg } = require('@resvg/resvg-js');
  const sharp = require('sharp');
  const exec = promisify(execFile);
  const upstream = createServer((request, response) => {
    assert.equal(request.headers.authorization, 'Bearer fixture-token');
    assert.equal(request.url, '/repos/author/project');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(fixture));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const env = {
    ...process.env,
    GITHUB_TOKEN: 'fixture-token',
    COOLP__RUNTIME__PROVIDERS__GITHUB__BASE_URL: 'http://127.0.0.1:' + upstream.address().port,
  };
  const coolp = '/opt/cool-profile/dist/coolp.mjs';
  const options = { env, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 };
  let server;
  try {
    const params = { source: 'github', subject: 'author/project' };
    const args = [
      'render',
      'repository/overview',
      '--params',
      JSON.stringify(params),
      '--format',
      'png',
      '--locale',
      'en',
      '--theme',
      'dark',
      '--output',
      '-',
    ];
    const expected = (await exec(process.execPath, [coolp, ...args], options)).stdout;
    assert.equal((await sharp(expected).metadata()).width, 620);
    const action = (
      await exec(process.execPath, ['/opt/cool-profile/action.mjs'], {
        ...options,
        env: {
          ...env,
          GITHUB_TOKEN: '',
          INPUT_GITHUB_TOKEN: 'fixture-token',
          INPUT_CARD: 'repository/overview',
          INPUT_PARAMS: JSON.stringify(params),
          INPUT_FORMAT: 'png',
          INPUT_LOCALE: 'en',
          INPUT_THEME: 'dark',
          INPUT_OUTPUT: '-',
        },
      })
    ).stdout;
    assert.deepEqual(action, expected);
    const plugin = (
      await exec(process.execPath, [coolp, 'render'], {
        ...options,
        env: {
          ...env,
          GITHUB_TOKEN: '',
          PLUGIN_TOKENS: '{"github":"fixture-token"}',
          PLUGIN_CARD: 'repository/overview',
          PLUGIN_PARAMS: JSON.stringify(params),
          PLUGIN_FORMAT: 'png',
          PLUGIN_LOCALE: 'en',
          PLUGIN_THEME: 'dark',
          PLUGIN_OUTPUT: '-',
        },
      })
    ).stdout;
    assert.deepEqual(plugin, expected);
    server = spawn(process.execPath, [coolp, 'serve', '--host', '127.0.0.1', '--port', '33000'], {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let logs = '';
    server.stderr.on('data', (chunk) => {
      logs += chunk;
    });
    const url =
      'http://127.0.0.1:33000/v1/cards/repository/overview.png?source=github&subject=author%2Fproject&locale=en&theme=dark';
    let response;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        response = await fetch(url);
        break;
      } catch {
        await delay(250);
      }
    }
    assert.ok(response, 'Server did not start: ' + logs);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    const gallery = await fetch('http://127.0.0.1:33000/');
    assert.equal(gallery.status, 200);
    const html = await gallery.text();
    assert.match(html, /Cool Profile/);
    const script = html.match(/<script[^>]+src="([^"]+)"/);
    assert.ok(script, 'Gallery module is missing');
    const module = await fetch(new URL(script[1], gallery.url));
    assert.equal(module.status, 200);
    assert.match(module.headers.get('content-type'), /javascript/);
    assert.equal(
      (await fetch(url, { headers: { 'If-None-Match': response.headers.get('etag') } })).status,
      304,
    );
    const frames = ['red', 'blue'].map((color) =>
      new Resvg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="' +
          color +
          '"/></svg>',
      )
        .render()
        .asPng(),
    );
    for (const format of ['gif', 'webp']) {
      const media = await sharp(frames, { join: { animated: true } })
        [format]({ delay: [100, 100], loop: 0 })
        .toBuffer();
      const metadata = await sharp(media, { animated: true }).metadata();
      assert.equal(metadata.format, format);
      assert.equal(metadata.pages, 2);
    }
    console.log(
      'Image verified: CLI / plugin / Action / HTTP PNG parity, gallery, ETag, fonts, GIF and WebP',
    );
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await once(server, 'exit');
    }
    await new Promise((resolve) => {
      upstream.close(resolve);
      upstream.closeAllConnections();
    });
  }
}

execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--interactive',
    ...(platform ? ['--platform', platform] : []),
    '--entrypoint',
    'node',
    image,
    '--input-type=module',
  ],
  {
    input: '(' + verifyRuntime.toString() + ')(' + JSON.stringify(repository) + ');',
    stdio: ['pipe', 'inherit', 'inherit'],
    timeout: 60_000,
  },
);
