import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { it, expect } from 'vitest';
import { planSnake } from '../cards/snake/src/route.js';
import { drawSnake } from '../cards/snake/src/draw.js';
import { createTextRenderer, svgDocument } from '../packages/graphics/src/index.js';
import { encodeGraphic } from '../packages/graphics/src/encode.js';
import type { Graphic } from '../packages/graphics/src/types.js';
import { createCardRegistry } from '../packages/card-kit/src/index.js';
import { cards } from '../cards/snake/src/index.js';
import { loadConfiguration, resolveCardRequest } from '../apps/coolp/src/config/index.js';

it('eats every selected cell without collisions and closes the complete body pose', () => {
  for (const width of [8, 16, 55]) {
    for (const pattern of [0, 1, 2, 3]) {
      const food = Array.from({ length: width * 7 }, (_, index) => ({
        x: (index % (width - 2)) + 1,
        y: (Math.floor(index / (width - 2)) % 7) + 1,
      })).filter((point) =>
        pattern === 0 ? false : pattern === 1 || (point.x * 7 + point.y) % pattern === 0,
      );
      const route = planSnake(width, food);
      expect(route.eatenAt.size).toBe(new Set(food.map((point) => point.x + ',' + point.y)).size);
      expect(route.poses.at(-1)).toEqual(route.poses[0]);
      expect(route.poses.length).toBeLessThanOrEqual(width * 10 * 2 + 5);
      for (const [index, pose] of route.poses.entries()) {
        expect(new Set(pose.map((point) => point.x + ',' + point.y)).size).toBe(pose.length);
        for (const point of pose) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThan(width);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThan(10);
        }
        if (!index) continue;
        const before = route.poses[index - 1]!;
        expect(Math.abs(pose[0]!.x - before[0]!.x) + Math.abs(pose[0]!.y - before[0]!.y)).toBe(1);
        expect(pose.slice(1)).toEqual(before.slice(0, -1));
      }
      for (const [point, step] of route.eatenAt) {
        const head = route.poses[step]![0]!;
        expect(head.x + ',' + head.y).toBe(point);
      }
    }
  }
});

it('draws native CNB colours and localized animated frames without changing activity semantics', async () => {
  const text = createTextRenderer(await readFile('apps/coolp/assets/fonts/NotoSansSC.ttf'));
  const activity = {
    from: '2026-01-01',
    to: '2026-01-03',
    timezone: 'Asia/Shanghai',
    metric: 'activity-score' as const,
    days: [1, 2, 3].map((value) => ({ date: '2026-01-0' + value, value, level: value })),
  };
  const ctx = {
    text,
    media: { format: 'svg' as const, theme: 'default', locale: 'zh-CN', seed: 0 },
  };
  const options = { source: 'cnb' as const, subject: '测试用户', fps: 10, duration: 4 };
  const graphic = drawSnake(ctx, activity, options);
  expect(graphic.svg).toContain('贪吃蛇');
  expect(graphic.svg).toContain('6 活跃分');
  expect(graphic.svg).toContain('#07b87d');
  expect(graphic.svg).toContain('#ff8742');
  expect(graphic.svg).not.toContain('<text');
  const first = graphic.animation.frame(0);
  const last = graphic.animation.frame(4000);
  expect(first).not.toEqual(last);
  expect(first).toContain('#ff8742');
  expect(last).not.toContain('#ff8742');
  expect(
    drawSnake({ ...ctx, media: { ...ctx.media, locale: 'en' } }, activity, options).svg,
  ).toContain('activity points');
  expect(
    drawSnake({ ...ctx, media: { ...ctx.media, theme: 'dark' } }, activity, options).svg,
  ).toContain('#a84105');
  const registry = createCardRegistry(cards);
  const configuration = await loadConfiguration(registry, { environment: {} });
  const request = resolveCardRequest(configuration, registry, 'snake', {
    inputs: [{ source: 'test', params: { source: 'cnb', subject: 'author' } }],
  });
  expect(request.params).toMatchObject({ fps: 20, duration: 12 });
});

it('encodes moving GIF/WebP with exact duration, dimensions, looping and deterministic frames', async () => {
  const frame = (time: number) =>
    svgDocument(
      48,
      24,
      '<rect width="48" height="24" fill="white"/><rect x="' +
        Math.floor(time / 20) +
        '" y="4" width="8" height="8" fill="red"/>',
    ).svg;
  const graphic: Graphic = {
    ...svgDocument(48, 24, ''),
    animation: { durationMs: 300, fps: 40, frame },
  };
  for (const format of ['gif', 'webp'] as const) {
    const media = await encodeGraphic(graphic, format);
    const metadata = await sharp(media.bytes, { animated: true }).metadata();
    expect(metadata.width).toBe(48);
    expect(metadata.pageHeight).toBe(24);
    expect(metadata.pages).toBe(12);
    expect(metadata.loop).toBe(0);
    expect(metadata.delay!.reduce((sum, value) => sum + value, 0)).toBe(300);
    if (format === 'webp') expect(metadata.delay!.every((delay) => delay === 25)).toBe(true);
    const first = await sharp(media.bytes, { page: 0 }).png().toBuffer();
    const last = await sharp(media.bytes, { page: 11 }).png().toBuffer();
    expect(first).not.toEqual(last);
    expect(media.animated).toBe(true);
    const repeat = await encodeGraphic(graphic, format);
    expect(createHash('sha256').update(repeat.bytes).digest('hex')).toBe(
      createHash('sha256').update(media.bytes).digest('hex'),
    );
  }
});
