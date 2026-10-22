import * as z from 'zod';
import { defineCard } from '@cool-profile/card-kit';
import { validateCalendarYear } from '@cool-profile/data/calendar';
import { drawShooter } from './draw.js';

export const cards = [
  defineCard({
    id: 'space-shooter',
    params: z.strictObject({
      source: z.enum(['github', 'cnb']).describe('数据源'),
      subject: z.string().min(1).max(100).describe('账号名'),
      year: z.number().int().min(1000).max(9999).optional().describe('日历年份，默认最近 365 天'),
      strategy: z.enum(['column', 'row', 'random']).describe('清除顺序'),
      fps: z.number().int().min(5).max(40).describe('动画帧率'),
      duration: z.number().min(8).max(24).describe('每轮动画秒数'),
    }),
    formats: ['gif', 'webp'],
    themes: ['default', 'dark', 'arcade'],
    locales: ['zh-CN', 'en'],
    defaults: () => ({ strategy: 'random' as const, fps: 40, duration: 20 }),
    validate: (params, _media, ctx) => validateCalendarYear(params.year, params.source, ctx.now),
    async load(ctx, params) {
      return ctx.data.read({
        kind: 'activity',
        source: params.source,
        subject: params.subject,
        ...(params.year !== undefined ? { year: params.year } : {}),
      });
    },
    render(ctx, snapshot, params) {
      return drawShooter(ctx, snapshot.data, params);
    },
  }),
];
