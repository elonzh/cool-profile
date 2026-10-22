import { readFile } from 'node:fs/promises';
import { it, expect } from 'vitest';
import sharp from 'sharp';
import { activityGrid, createTextRenderer } from '../packages/graphics/src/index.js';
import { encodeGraphic } from '../packages/graphics/src/encode.js';
import { dates } from '../packages/data/src/window.js';
import { targetOrder, planBattle, battleFrame } from '../cards/space-shooter/src/battle.js';
import { drawShooter } from '../cards/space-shooter/src/draw.js';

const activity = {
  from: '2026-01-01',
  to: '2026-01-21',
  timezone: 'Asia/Shanghai',
  metric: 'activity-score' as const,
  days: dates('2026-01-01', '2026-01-21').map((date, index) => ({
    date,
    value: index % 5,
    level: index % 5,
  })),
};
const grid = activityGrid(activity);

it('clears every active day once without shooting through a surviving enemy for each strategy', () => {
  for (const strategy of ['column', 'row', 'random'] as const) {
    const ordered = targetOrder(grid.cells, strategy, 42);
    expect(ordered).toHaveLength(grid.activeDays);
    expect(new Set(ordered.map((cell) => cell.date)).size).toBe(grid.activeDays);
    const remaining = new Set(ordered.map((cell) => cell.date));
    for (const target of ordered) {
      expect(
        grid.cells.some(
          (cell) =>
            remaining.has(cell.date) && cell.column === target.column && cell.row > target.row,
        ),
      ).toBe(false);
      remaining.delete(target.date);
    }
  }
  expect(targetOrder(grid.cells, 'random', 42)).toEqual(targetOrder(grid.cells, 'random', 42));
  expect(targetOrder(grid.cells, 'random', 43)).not.toEqual(targetOrder(grid.cells, 'random', 42));
  expect(targetOrder(grid.cells, 'row', 42)).not.toEqual(targetOrder(grid.cells, 'column', 42));
});

it('aims before firing, counts hits at impact time and returns the ship to its initial column', () => {
  const battle = planBattle(grid.cells, grid.columns, 'random', 42, 8000);
  for (const [index, shot] of battle.shots.entries()) {
    expect(shot.start).toBeLessThan(shot.aim);
    expect(shot.aim).toBeLessThan(shot.hit);
    expect(shot.hit).toBeLessThan(shot.end);
    const flying = battleFrame(battle, (shot.aim + shot.hit) / 2);
    expect(flying.column).toBe(shot.cell.column);
    expect(flying.cleared).toBe(index);
    expect(flying.bullet).toBeCloseTo(0.5);
    const hit = battleFrame(battle, shot.hit);
    expect(hit.cleared).toBe(index + 1);
    expect(hit.bullet).toBeUndefined();
    expect(hit.explosion).toBe(0);
  }
  const end = battleFrame(battle, 8000);
  expect(end.column).toBe(battleFrame(battle, 0).column);
  expect(end.collected).toBe(grid.total);
  expect(end.cleared).toBe(grid.activeDays);
  const empty = planBattle(
    grid.cells.map((cell) => ({ ...cell, value: 0, level: 0 })),
    grid.columns,
    'random',
    0,
    8000,
  );
  expect(battleFrame(empty, 4000)).toMatchObject({
    cleared: 0,
    collected: 0,
    column: empty.center,
  });
});

it('renders localized native, dark and arcade battles with frame-rate independent motion', async () => {
  const text = createTextRenderer(await readFile('apps/coolp/assets/fonts/NotoSansSC.ttf'));
  const context = {
    text,
    media: { format: 'webp' as const, theme: 'default', locale: 'zh-CN', seed: 42 },
  };
  const params = {
    source: 'cnb' as const,
    subject: '测试用户',
    strategy: 'random' as const,
    fps: 5,
    duration: 8,
  };
  const first = drawShooter(context, activity, params);
  expect(first.svg).toContain('太空射击');
  expect(first.svg).toContain('40 活跃分');
  expect(first.svg).toContain('#07b87d');
  expect(first.svg).not.toContain('<text');
  expect(first.animation.frame(8000)).toContain('已清除 16 / 16 · 40 活跃分');
  expect(first.animation.frame(4000)).toEqual(
    drawShooter(context, activity, { ...params, fps: 40 }).animation.frame(4000),
  );
  expect(
    drawShooter({ ...context, media: { ...context.media, locale: 'en' } }, activity, params).svg,
  ).toContain('Space shooter');
  expect(
    drawShooter({ ...context, media: { ...context.media, theme: 'arcade' } }, activity, params).svg,
  ).toContain('#15102b');
  expect(
    drawShooter({ ...context, media: { ...context.media, theme: 'dark' } }, activity, params).svg,
  ).toContain('#db5400');
  const media = await encodeGraphic(first, 'webp');
  const metadata = await sharp(media.bytes, { animated: true }).metadata();
  expect(metadata.pages).toBeGreaterThan(1);
  expect(metadata.pageHeight).toBe(276);
  expect(metadata.delay!.reduce((sum, delay) => sum + delay, 0)).toBe(8000);
  expect(metadata.loop).toBe(0);
});
