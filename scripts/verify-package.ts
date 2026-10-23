import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { execute } from './release-lib.js';
import repository from '../test/fixtures/repositories.json' with { type: 'json' };
const release = JSON.parse(await readFile('dist/release/release.json', 'utf8'));
const root = await mkdtemp(join(tmpdir(), 'coolp-package-'));
const upstream = createServer((_request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(repository.github));
});
let server: ReturnType<typeof spawn> | undefined;
try {
  await writeFile(join(root, 'package.json'), '{"private":true}');
  await execute(
    'npm',
    ['install', '--no-audit', '--no-fund', resolve('dist/release', release.tarball)],
    { cwd: root, maxBuffer: 2 * 1024 * 1024 },
  );
  const directory = join(root, 'node_modules', release.name),
    entry = join(directory, 'dist/coolp.mjs');
  const run = async (args: string[], env = process.env) =>
    (
      await execute(process.execPath, [entry, ...args], {
        cwd: root,
        env,
        encoding: 'buffer',
        maxBuffer: 8 * 1024 * 1024,
      })
    ).stdout;
  assert.equal((await run(['--version'])).toString().trim(), release.version);
  for (const name of [
    'LICENSE',
    'THEMES-LICENSE',
    'LINGUIST-LICENSE',
    'assets/fonts/OFL.txt',
    'assets/fonts/NotoEmoji-OFL.txt',
  ])
    assert.ok((await readFile(join(directory, name))).length);
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address !== 'string');
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.startsWith('COOLP_') && !key.startsWith('PLUGIN_'),
      ),
    ),
    GITHUB_TOKEN: '',
    CNB_TOKEN: '',
    COOLP__RUNTIME__PROVIDERS__GITHUB__BASE_URL: 'http://127.0.0.1:' + address.port,
  };
  const args = [
    'render',
    'repository/overview',
    '--source',
    'github',
    '--subject',
    'author/project',
    '--format',
    'png',
    '--output',
    '-',
  ];
  const image = await run(args, env);
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const endpoint = probe.address();
  assert.ok(endpoint && typeof endpoint !== 'string');
  await new Promise<void>((done) => probe.close(() => done()));
  server = spawn(process.execPath, [entry, 'serve', '--port', String(endpoint.port)], {
    cwd: root,
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let started = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:' + endpoint.port + '/');
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Cool Profile/);
      started = true;
      break;
    } catch {
      if (server.exitCode !== null) throw new Error('Packaged server exited');
      await delay(100);
    }
  }
  assert.ok(started, 'Packaged server did not start');
  const response = await fetch(
    'http://127.0.0.1:' +
      endpoint.port +
      '/v1/cards/repository/overview.png?source=github&subject=author%2Fproject',
  );
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  console.log(
    'npm tarball verified outside the workspace: install, coolp version, licenses, native PNG, gallery and server parity',
  );
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
  await new Promise<void>((done) => {
    upstream.close(() => done());
    upstream.closeAllConnections();
  });
  await rm(root, { recursive: true, force: true });
}
