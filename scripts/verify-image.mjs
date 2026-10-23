import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const image = process.argv[2];
const platform = process.argv[3];
if (!image) throw new Error('Usage: node scripts/verify-image.mjs <image> [platform]');
const repositories = JSON.parse(
  readFileSync(new URL('../test/fixtures/repositories.json', import.meta.url), 'utf8'),
);

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
  const upstream = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer fixture-token');
    const url = new URL(request.url, 'http://fixture');
    const cnb = url.pathname.startsWith('/cnb/');
    const path = url.pathname.replace(/^\/(github|cnb)/, '');
    let result;
    if (path === '/repos/author/project' || path === '/author/project')
      result = cnb ? fixture.cnb : fixture.github;
    else if (path === '/users/author')
      result = cnb
        ? { username: 'author', nickname: '测试用户', public_repo_count: 1, follower_count: 2 }
        : {
            login: 'author',
            name: '测试用户',
            html_url: 'https://github.com/author',
            public_repos: 1,
            followers: 2,
          };
    else if (path === '/users/author/repos')
      result =
        url.searchParams.get('page') === '1'
          ? [
              cnb
                ? {
                    path: 'author/project',
                    visibility_level: 'Public',
                    star_count: 23,
                    fork_count: 4,
                    languages: { language: 'TypeScript', color: '#3178c6' },
                  }
                : {
                    full_name: 'author/project',
                    private: false,
                    stargazers_count: 23,
                    forks_count: 4,
                    fork: false,
                    language: 'TypeScript',
                  },
            ]
          : [];
    else if (path.endsWith('/languages')) result = { TypeScript: 200, CSS: 100 };
    else if (path === '/users/author/calendar') result = {};
    else if (path === '/graphql') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const { variables } = JSON.parse(Buffer.concat(chunks).toString());
      const days = [];
      for (
        let timestamp = Date.parse(variables.from);
        timestamp <= Date.parse(variables.to);
        timestamp += 86400000
      )
        days.push({
          date: new Date(timestamp).toISOString().slice(0, 10),
          contributionCount: 0,
          contributionLevel: 'NONE',
        });
      result = {
        data: {
          user: {
            contributionsCollection: {
              totalCommitContributions: 9,
              totalIssueContributions: 3,
              totalPullRequestContributions: 4,
              totalPullRequestReviewContributions: 2,
              totalRepositoryContributions: 1,
              contributionCalendar: { colors: [], weeks: [{ contributionDays: days }] },
            },
          },
        },
      };
    } else throw new Error('Unexpected fixture route: ' + path);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(result));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const env = {
    ...process.env,
    GITHUB_TOKEN: 'fixture-token',
    CNB_TOKEN: 'fixture-token',
    COOLP__RUNTIME__PROVIDERS__GITHUB__BASE_URL:
      'http://127.0.0.1:' + upstream.address().port + '/github',
    COOLP__RUNTIME__PROVIDERS__CNB__BASE_URL:
      'http://127.0.0.1:' + upstream.address().port + '/cnb',
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
    const cases = [
      {
        card: 'profile/stats',
        params: {
          source: 'github',
          subject: 'author',
          layout: 'compact',
          show: ['reviews'],
          hide: ['followers'],
          width: 480,
        },
        theme: 'radical',
      },
      ...['normal', 'compact', 'donut', 'donut-vertical', 'pie'].map((layout) => ({
        card: 'profile/languages',
        params: { source: 'github', subject: 'author', layout, width: 420 },
        theme: 'tokyonight',
      })),
      { card: 'profile/radar', params: { source: 'cnb', subject: 'author' }, theme: 'dark' },
      {
        card: 'activity/city',
        params: { source: 'cnb', subject: 'author', animate: false },
        theme: 'blocks',
      },
    ];
    for (const item of cases) {
      const parameters = JSON.stringify(item.params);
      const cli = (
        await exec(
          process.execPath,
          [
            coolp,
            'render',
            item.card,
            '--params',
            parameters,
            '--theme',
            item.theme,
            '--format',
            'png',
            '--output',
            '-',
          ],
          options,
        )
      ).stdout;
      const plugin = (
        await exec(process.execPath, [coolp, 'render'], {
          ...options,
          env: {
            ...env,
            PLUGIN_CARD: item.card,
            PLUGIN_PARAMS: parameters,
            PLUGIN_THEME: item.theme,
            PLUGIN_FORMAT: 'png',
            PLUGIN_OUTPUT: '-',
          },
        })
      ).stdout;
      const action = (
        await exec(process.execPath, ['/opt/cool-profile/action.mjs'], {
          ...options,
          env: {
            ...env,
            INPUT_CARD: item.card,
            INPUT_PARAMS: parameters,
            INPUT_THEME: item.theme,
            INPUT_FORMAT: 'png',
            INPUT_OUTPUT: '-',
          },
        })
      ).stdout;
      const response = await fetch(
        'http://127.0.0.1:33000/v1/cards/' +
          item.card +
          '.png?' +
          new URLSearchParams({ params: parameters, theme: item.theme }),
      );
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), cli, item.card + ' HTTP');
      assert.deepEqual(plugin, cli, item.card + ' plugin');
      assert.deepEqual(action, cli, item.card + ' Action');
    }
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
    input: '(' + verifyRuntime.toString() + ')(' + JSON.stringify(repositories) + ');',
    stdio: ['pipe', 'inherit', 'inherit'],
    timeout: 60_000,
  },
);
