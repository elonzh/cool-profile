import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createCardRegistry } from '../packages/card-kit/src/index.js';
import { createDataClient } from '../packages/data/src/index.js';
import { languageColor } from '../packages/data/src/language-colors.js';
import { createTextRenderer } from '../packages/graphics/src/index.js';
import { encodeGraphic } from '../packages/graphics/src/encode.js';
import { loadConfiguration, resolveCardRequest } from '../apps/coolp/src/config/index.js';
import { cards } from '../generated/cards.js';
import { wrapDescription } from '../packages/graphics/src/card-frame.js';
import {
  fixtureApi,
  fixtureEnvironment,
  fixtureFetch,
  fixtureProviders,
  fixedNow,
} from './fixtures/upstream.js';

const client = (fetcher = fixtureFetch()) =>
  createDataClient({
    providers: fixtureProviders,
    environment: fixtureEnvironment,
    fetch: fetcher,
    now: () => fixedNow,
  });
const registry = createCardRegistry(cards);
const text = createTextRenderer(await readFile('apps/coolp/assets/fonts/NotoSansSC.ttf'));

it.each(['github', 'cnb'])(
  'counts primary languages of %s public non-fork repositories across all pages',
  async (source) => {
    const fetcher = vi.fn(fixtureFetch());
    const data = client(fetcher);
    const stats = await data.read({ kind: 'profile-stats', source, subject: 'author' });
    const result = await data.read({
      kind: 'languages',
      source,
      subject: 'author',
      metric: 'repositories',
    });
    expect(result.data).toMatchObject({
      unit: 'repositories',
      repositoryCount: 1,
      classifiedRepositories: 1,
      languages: [{ name: 'TypeScript', value: 1, color: '#3178c6' }],
    });
    expect(stats.data.metrics.find((metric) => metric.id === 'stars')?.value).toBe(7);
    // The second capability reuses profile and paginated raw responses.
    expect(fetcher).toHaveBeenCalledTimes(5);
    const withForks = await data.read({
      kind: 'languages',
      source,
      subject: 'author',
      metric: 'repositories',
      'include-forks': true,
    });
    expect(withForks.data.repositoryCount).toBe(2);
    expect(withForks.data.languages.map((row) => row.name)).toEqual(['Python', 'TypeScript']);
  },
);

it('sums GitHub byte maps, preserves units, filters private repositories and counts classified repos', async () => {
  const fetcher = vi.fn(fixtureFetch());
  const result = await client(fetcher).read({
    kind: 'languages',
    source: 'github',
    subject: 'author',
    'include-forks': true,
  });
  expect(result.data).toMatchObject({
    unit: 'bytes',
    repositoryCount: 2,
    classifiedRepositories: 2,
    languages: [
      { name: 'TypeScript', value: 300 },
      { name: 'CSS', value: 200 },
      { name: 'Python', value: 100 },
    ],
  });
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('repo-1-1/languages'))).toBe(
    false,
  );
  const cnb = await client().read({ kind: 'languages', source: 'cnb', subject: 'author' });
  expect(cnb.data.unit).toBe('repositories');
});

it('reports unsupported units, missing users and malformed language responses instead of empty stats', async () => {
  const never = vi.fn(fixtureFetch());
  await expect(
    client(never).read({ kind: 'languages', source: 'cnb', subject: 'author', metric: 'bytes' }),
  ).rejects.toMatchObject({ kind: 'input' });
  expect(never).not.toHaveBeenCalled();
  await expect(
    client(async () => new Response('', { status: 404 })).read({
      kind: 'languages',
      source: 'github',
      subject: 'missing',
    }),
  ).rejects.toMatchObject({ kind: 'not-found' });
  const invalid: typeof fetch = async (input, init) =>
    String(input).endsWith('/languages')
      ? Response.json({ TypeScript: -1 })
      : fixtureFetch()(input, init);
  await expect(
    client(invalid).read({ kind: 'languages', source: 'github', subject: 'author' }),
  ).rejects.toThrow('invalid data');
});

it.each(['github', 'cnb'])(
  'handles genuinely unclassified %s repositories without inventing a language',
  async (source) => {
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/languages')) return Response.json({});
      const body = fixtureApi(url, typeof init?.body === 'string' ? init.body : undefined);
      if (Array.isArray(body))
        return Response.json(
          body.map((row) => ({ ...row, language: null, languages: { language: '', color: '' } })),
        );
      return Response.json(body);
    };
    const result = await client(fetcher).read({ kind: 'languages', source, subject: 'author' });
    expect(result.data).toMatchObject({
      repositoryCount: 1,
      classifiedRepositories: 0,
      languages: [],
    });
    const draw = await registry
      .get('profile/languages')!
      .prepare(
        { data: client(fetcher), now: fixedNow, signal: new AbortController().signal },
        { source, subject: 'author', 'include-forks': false, limit: 10 },
      );
    const graphic = await draw({
      text,
      media: { format: 'svg', theme: 'default', locale: 'zh-CN', seed: 0 },
    });
    expect(graphic.svg).toContain('暂无语言数据');
    expect(graphic.svg).toContain('已识别语言 0/1');
    expect(graphic.svg).not.toMatch(/NaN|Infinity|stroke-dasharray/);
  },
);

it.each(['github', 'cnb'])(
  'normalizes %s repository metadata and combines open issues and PRs consistently',
  async (source) => {
    const subject = source === 'github' ? 'author/project' : 'author/group/project';
    const result = await client().read({ kind: 'repository', source, subject });
    expect(result.data).toMatchObject({
      name: subject,
      license: 'MIT',
      language: { name: 'TypeScript', color: '#3178c6' },
      metrics: [
        { id: 'stars', value: 23 },
        { id: 'forks', value: 4 },
        { id: 'open-items', value: 5, scope: 'issues-and-pull-requests' },
      ],
    });
    const privateFetch: typeof fetch = async (input) =>
      Response.json({
        ...(fixtureApi(new URL(String(input))) as object),
        private: true,
        visibility_level: 'Private',
      });
    await expect(
      client(privateFetch).read({ kind: 'repository', source, subject }),
    ).rejects.toMatchObject({ kind: 'not-found' });
  },
);

it('validates full repository paths and CNB metric compatibility before fetching, including dry-run', async () => {
  const configuration = await loadConfiguration(registry, { environment: {} });
  const request = (id: string, params: Record<string, unknown>) =>
    resolveCardRequest(configuration, registry, id, { inputs: [{ source: 'test', params }] });
  for (const source of ['github', 'cnb']) {
    for (const subject of [
      'owner/../repo',
      '/owner/repo',
      'owner/repo?ref=x',
      'owner//repo',
      'owner/%2e%2e',
    ]) {
      expect(() => request('repository/overview', { source, subject })).toThrow('subject');
      await expect(client().read({ kind: 'repository', source, subject })).rejects.toMatchObject({
        kind: 'input',
      });
    }
  }
  expect(() => request('repository/overview', { source: 'github', subject: 'a/b/c' })).toThrow(
    'owner/repository',
  );
  expect(request('repository/overview', { source: 'cnb', subject: 'a/b/c' }).params.subject).toBe(
    'a/b/c',
  );
  expect(() =>
    request('profile/languages', { source: 'cnb', subject: 'author', metric: 'bytes' }),
  ).toThrow('metric');
  expect(() =>
    request('profile/languages', { source: 'github', subject: 'author', limit: 21 }),
  ).toThrow();
});

it('limits all provider HTTP requests, reuses cached requests and releases failed slots', async () => {
  let active = 0;
  let maximum = 0;
  let fail = true;
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    active++;
    maximum = Math.max(maximum, active);
    try {
      await delay(5);
      if (url.pathname.endsWith('/languages')) {
        if (fail && url.pathname.includes('/r0/')) {
          fail = false;
          return new Response('', { status: 503 });
        }
        return Response.json({ TypeScript: 10 });
      }
      if (url.pathname.endsWith('/repos'))
        return Response.json(
          url.searchParams.get('page') === '1'
            ? Array.from({ length: 9 }, (_, index) => ({
                full_name: 'author/r' + index,
                private: false,
                fork: false,
                language: 'TypeScript',
                stargazers_count: 0,
              }))
            : [],
        );
      return Response.json({ login: 'author' });
    } finally {
      active--;
    }
  };
  const data = createDataClient({
    providers: { github: { ...fixtureProviders.github, concurrency: 2 } },
    environment: {},
    fetch: fetcher,
  });
  const query = { kind: 'languages' as const, source: 'github', subject: 'author' };
  await expect(data.read(query)).rejects.toMatchObject({ status: 503 });
  expect((await data.read(query)).data.languages[0]?.value).toBe(90);
  expect(maximum).toBe(2);
  expect(active).toBe(0);
});

it('groups overflowing language rows while preserving totals and renders every language and theme', async () => {
  const configuration = await loadConfiguration(registry, { environment: {} });
  const data = client();
  for (const id of ['profile/languages', 'repository/overview']) {
    const card = registry.get(id)!;
    for (const source of ['github', 'cnb']) {
      const subject =
        id === 'repository/overview'
          ? source === 'github'
            ? 'author/project'
            : 'author/group/project'
          : 'author';
      const request = resolveCardRequest(configuration, registry, id, {
        inputs: [
          {
            source: 'test',
            params: {
              source,
              subject,
              ...(id === 'profile/languages' ? { limit: 1, 'include-forks': true } : {}),
            },
          },
        ],
      });
      const draw = await card.prepare(
        { data, now: fixedNow, signal: new AbortController().signal },
        request.params,
      );
      for (const locale of ['zh-CN', 'en'])
        for (const theme of ['default', 'dark']) {
          const graphic = await draw({ text, media: { ...request.media, theme, locale } });
          expect(graphic.svg).not.toMatch(/NaN|Infinity|<text/);
          expect(graphic.svg).toContain(
            locale === 'zh-CN'
              ? id === 'repository/overview'
                ? '仓库'
                : '语言分布'
              : id === 'repository/overview'
                ? 'Repository'
                : 'Languages',
          );
          if (id === 'profile/languages') {
            expect(graphic.svg).toContain(locale === 'zh-CN' ? '其他语言' : 'Other languages');
            expect(graphic.svg).toContain('TypeScript: ' + (source === 'github' ? 300 : 1));
          }
          const png = await encodeGraphic(graphic, 'png');
          const metadata = await sharp(png.bytes).metadata();
          expect(metadata.width).toBe(620);
          expect(metadata.height).toBe(graphic.height);
          const pixel = await sharp(png.bytes)
            .extract({ left: 10, top: 100, width: 1, height: 1 })
            .removeAlpha()
            .raw()
            .toBuffer();
          expect(pixel[0]).toBe(theme === 'default' ? 255 : source === 'github' ? 13 : 32);
        }
    }
  }
});

it('wraps long descriptions into measured grapheme-safe lines and handles unknown language colors', () => {
  const long = 'This description has words 与中文和 👩‍💻 symbols. '.repeat(10);
  const lines = wrapDescription(long, text, 300, 3);
  expect(lines).toHaveLength(3);
  expect(lines[2]).toMatch(/…$/);
  expect(lines.every((line) => text.measure(line, { size: 14 }) <= 300)).toBe(true);
  expect(lines.join('')).not.toContain('\uFFFD');
  expect(wrapDescription('', text, 300, 3)).toEqual([]);
  expect(languageColor('TypeScript')).toBe('#3178c6');
  expect(languageColor('custom', '" onload="alert(1)')).toMatch(/^hsl\(\d+,55%,55%\)$/);
  expect(languageColor('__proto__')).toMatch(/^hsl\(/);
});
