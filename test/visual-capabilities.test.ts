import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createCardRegistry } from '../packages/card-kit/src/index.js';
import {
  profileThemes,
  createTextRenderer,
  ringChart,
  radarChart,
  profileTheme,
  cardTheme,
} from '../packages/graphics/src/index.js';
import { createDataClient } from '../packages/data/src/index.js';
import { loadConfiguration, resolveCardRequest } from '../apps/coolp/src/config/index.js';
import { cards } from '../generated/cards.js';
import {
  fixtureProviders,
  fixtureEnvironment,
  fixtureFetch,
  fixedNow,
} from './fixtures/upstream.js';
import { estimatedGrade } from '../cards/profile/stats/src/index.js';
const text = createTextRenderer(await readFile('apps/coolp/assets/fonts/NotoSansSC.ttf'));
const registry = createCardRegistry(cards);
const data = createDataClient({
  providers: fixtureProviders,
  environment: fixtureEnvironment,
  fetch: fixtureFetch(),
  now: () => fixedNow,
});
const configuration = await loadConfiguration(registry, { environment: {} });
it('covers all five language layouts, both source units, small cards and every imported theme', async () => {
  for (const source of ['github', 'cnb'])
    for (const layout of ['normal', 'compact', 'donut', 'donut-vertical', 'pie']) {
      const card = registry.get('profile/languages')!;
      const request = resolveCardRequest(configuration, registry, card.id, {
        inputs: [{ source: 'test', params: { source, subject: 'author', layout, width: 300 } }],
      });
      const draw = await card.prepare(
        { data, now: fixedNow, signal: new AbortController().signal },
        request.params,
      );
      for (const theme of profileThemes) {
        const graphic = await draw({ text, media: { ...request.media, theme } });
        expect(graphic.svg).not.toMatch(/NaN|Infinity|undefined|width="-/);
        expect(graphic.width).toBe(300);
        expect(graphic.svg).toContain(source === 'cnb' ? '仓库数' : '代码字节');
      }
    }
});
it('preserves missing radar dimensions, selected-year scope and does not invent CNB reviews', async () => {
  const cnb = await data.read({
    kind: 'profile-stats',
    source: 'cnb',
    subject: 'author',
    year: 2026,
  });
  const github = await data.read({
    kind: 'profile-stats',
    source: 'github',
    subject: 'author',
    year: 2026,
  });
  expect(cnb.data.metrics.find((metric) => metric.id === 'reviews')?.value).toBeNull();
  expect(github.data.metrics.find((metric) => metric.id === 'reviews')?.value).toBe(7);
  expect(github.data.metrics.find((metric) => metric.id === 'commits')?.scope).toBe(
    'selected-period',
  );
  const card = registry.get('profile/radar')!;
  const draw = await card.prepare(
    { data, now: fixedNow, signal: new AbortController().signal },
    { source: 'cnb', subject: 'author' },
  );
  const graphic = await draw({
    text,
    media: { format: 'svg', locale: 'zh-CN', theme: 'default', seed: 0 },
  });
  expect(graphic.svg).toContain('贡献雷达');
  expect(graphic.svg).not.toContain('代码评审');
});
it('excludes repositories before aggregation and rejects unsafe SVG paints before loading', async () => {
  const result = await data.read({
    kind: 'languages',
    source: 'github',
    subject: 'author',
    'exclude-repo': ['author/repo-1-0'],
  });
  expect(result.data.repositoryCount).toBe(0);
  expect(result.data.languages).toEqual([]);
  for (const color of ['url(https://example.com)', '" onload="alert(1)', '#12345'])
    expect(() =>
      resolveCardRequest(configuration, registry, 'profile/stats', {
        inputs: [
          { source: 'test', params: { source: 'cnb', subject: 'author', 'text-color': color } },
        ],
      }),
    ).toThrow('text-color');
});
it('handles a single language, zero charts and missing grade dimensions without invalid geometry', () => {
  expect(
    ringChart([{ name: 'TS', value: 10, color: '#3178c6' }], 100, 100, 50, 10, true),
  ).toContain('<circle');
  expect(ringChart([], 100, 100, 50, 10)).toBe('');
  expect(
    radarChart(
      [
        { name: 'a', value: 0 },
        { name: 'b', value: 0 },
        { name: 'c', value: 0 },
      ],
      text,
      profileTheme('cnb', 'default'),
      100,
      100,
      50,
    ),
  ).not.toMatch(/NaN|Infinity/);
  expect(estimatedGrade([{ id: 'reviews', value: null }])).toEqual({ grade: 'C', percentile: 100 });
});

it('keeps all six compact statistics on separate baselines when a narrow card becomes one column', async () => {
  const card = registry.get('profile/stats')!;
  const request = resolveCardRequest(configuration, registry, card.id, {
    inputs: [
      {
        source: 'test',
        params: { source: 'cnb', subject: 'author', width: 300, layout: 'compact' },
      },
    ],
  });
  const draw = await card.prepare(
    { data, now: fixedNow, signal: new AbortController().signal },
    request.params,
  );
  const positions: number[] = [];
  const labels = new Set(['获得星标', '提交', '合并请求', '议题', '关注者', '公开仓库']);
  const recording: typeof text = Object.assign(
    (value: string, x: number, y: number, style: Parameters<typeof text>[3]) => {
      if (labels.has(value)) {
        positions.push(y);
        expect(x).toBeLessThan(100);
      }
      return text(value, x, y, style);
    },
    { measure: text.measure },
  );
  await draw({ text: recording, media: request.media });
  expect(positions).toHaveLength(6);
  expect(new Set(positions).size).toBe(6);
});

it('keeps CNB badge artwork green while giving light-card text enough contrast', () => {
  const ink = profileTheme('cnb', 'default').accent;
  const linear = (value: number) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const rgb = [1, 3, 5].map((index) => linear(parseInt(ink.slice(index, index + 2), 16)));
  const luminance = rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
  expect(cardTheme('cnb', 'default').accent).toBe('#07b87d');
});
