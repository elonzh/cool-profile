import { readFile } from 'node:fs/promises';
import { it, expect } from 'vitest';
import sharp from 'sharp';
import { createCardRegistry } from '../packages/card-kit/src/index.js';
import { createTextRenderer } from '../packages/graphics/src/index.js';
import { encodeGraphic } from '../packages/graphics/src/encode.js';
import { cards } from '../generated/cards.js';
import { drawCity, towerHeight } from '../cards/activity/city/src/draw.js';
import { loadConfiguration, resolveCardRequest } from '../apps/coolp/src/config/index.js';
import { dates } from '../packages/data/src/window.js';

it('uses format-specific animation defaults and rejects animated PNG before fetching', async () => {
  const registry = createCardRegistry(cards);
  const configuration = await loadConfiguration(registry, { environment: {} });
  const request = (format: 'svg' | 'png', params: Record<string, unknown> = {}) =>
    resolveCardRequest(configuration, registry, 'activity/city', {
      inputs: [
        {
          source: 'test',
          render: { format },
          params: { source: 'cnb', subject: 'author', ...params },
        },
      ],
    });
  expect(request('svg').params.animate).toBe(true);
  expect(request('png').params.animate).toBe(false);
  expect(() => request('png', { animate: true })).toThrow('PNG requires animate=false');
  expect(request('svg', { animate: false }).params.animate).toBe(false);
  const now = new Date('2026-12-31T16:30:00Z');
  const nextYear = (source: string) =>
    resolveCardRequest(configuration, registry, 'activity/city', {
      now,
      inputs: [{ source: 'test', params: { source, subject: 'author', year: 2027 } }],
    });
  expect(nextYear('cnb').params.year).toBe(2027);
  expect(() => nextYear('github')).toThrow('year must be a calendar year no later than today');
});

it('preserves zero days, chronological cell values and native colours across city themes', async () => {
  const text = createTextRenderer(await readFile('apps/coolp/assets/fonts/NotoSansSC.ttf'));
  const activity = {
    from: '2026-01-01',
    to: '2026-12-31',
    timezone: 'UTC',
    metric: 'contributions' as const,
    days: dates('2026-01-01', '2026-12-31').map((date, index) => ({
      date,
      value: index % 5,
      level: index % 5,
    })),
  };
  const fingerprints = new Set<string>();
  for (const theme of ['default', 'dark', 'season', 'rainbow', 'blocks']) {
    const graphic = drawCity(
      { text, media: { format: 'png', theme, locale: 'zh-CN', seed: 0 } },
      activity,
      { source: 'cnb', subject: '测试用户', animate: false },
    );
    expect(graphic.svg).toContain('3D 活跃日历');
    expect(graphic.svg).toContain('730 贡献');
    expect(graphic.svg).toContain('2026-01-02: 1 贡献');
    expect(graphic.svg).not.toMatch(/NaN|Infinity|<text/);
    expect(graphic.animation).toBeUndefined();
    fingerprints.add(graphic.svg);
    const png = await encodeGraphic(graphic, 'png');
    const metadata = await sharp(png.bytes).metadata();
    expect(metadata.width).toBe(graphic.width);
    expect(metadata.height).toBe(graphic.height);
    if (theme === 'default') expect(graphic.svg).toContain('#ff6200');
    if (theme === 'blocks') expect(graphic.svg).toContain('<ellipse');
    if (theme === 'rainbow') {
      const pixels = await sharp(png.bytes).removeAlpha().raw().toBuffer();
      let red = false;
      let blue = false;
      for (let index = 0; index < pixels.length; index += 3) {
        const r = pixels[index]!;
        const g = pixels[index + 1]!;
        const b = pixels[index + 2]!;
        if (r > 80 && r > g * 1.5 && r > b * 1.5) red = true;
        if (b > 80 && b > r * 1.5 && b > g * 1.5) blue = true;
      }
      expect({ red, blue }).toEqual({ red: true, blue: true });
    }
  }
  expect(fingerprints.size).toBe(5);
  const english = drawCity(
    { text, media: { format: 'svg', theme: 'default', locale: 'en', seed: 0 } },
    activity,
    { source: 'github', subject: 'author', animate: true },
  );
  expect(english.svg).toContain('contributions');
  expect(english.svg).toContain('3D activity calendar');
  expect(english.animation!.frame(0)).not.toEqual(english.animation!.frame(4000));
  expect(towerHeight(0, 4, false)).toBe(0);
  expect(towerHeight(1, 100, false)).toBeLessThan(towerHeight(10, 100, false));
  expect(towerHeight(100, 100, false)).toBe(75);
  const empty = drawCity(
    { text, media: { format: 'png', theme: 'default', locale: 'zh-CN', seed: 0 } },
    { ...activity, days: activity.days.map((day) => ({ ...day, value: 0, level: 0 })) },
    { source: 'github', subject: 'author', animate: false },
  );
  expect(empty.svg).not.toMatch(/NaN|Infinity/);
});

it('keeps partial-month labels from colliding with the next month in both languages', async () => {
  const renderer = createTextRenderer(await readFile('apps/coolp/assets/fonts/NotoSansSC.ttf'));
  for (const locale of ['zh-CN', 'en']) {
    const labels: { x: number; width: number }[] = [];
    const text: typeof renderer = Object.assign(
      (value: string, x: number, y: number, style: Parameters<typeof renderer>[3]) => {
        if (/^(?:\d{1,2}月|[A-Z][a-z]{2})$/.test(value))
          labels.push({ x, width: renderer.measure(value, style) });
        return renderer(value, x, y, style);
      },
      { measure: renderer.measure },
    );
    drawCity(
      { text, media: { format: 'png', theme: 'default', locale, seed: 0 } },
      {
        from: '2025-10-24',
        to: '2026-10-23',
        timezone: 'UTC',
        metric: 'contributions',
        days: dates('2025-10-24', '2026-10-23').map((date) => ({ date, value: 0, level: 0 })),
      },
      { source: 'github', subject: 'author', animate: false },
    );
    for (let index = 1; index < labels.length; index++) {
      const previous = labels[index - 1]!;
      const current = labels[index]!;
      expect(current.x - previous.x).toBeGreaterThanOrEqual(
        (current.width + previous.width) / 2 + 6,
      );
    }
  }
});
