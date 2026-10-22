import * as z from 'zod';
import { defineCard } from '@cool-profile/card-kit';
import { drawSnake } from './draw.js';

export const cards = [
  defineCard({
    id: 'snake',
    params: z.strictObject({
      source: z.enum(['github', 'cnb']).describe('数据源'),
      subject: z.string().min(1).max(100).describe('账号名'),
      year: z.number().int().min(1000).max(9999).optional().describe('日历年份，默认最近 365 天'),
      fps: z.number().int().min(5).max(40).describe('GIF 帧率'),
      duration: z.number().min(4).max(30).describe('每轮动画秒数'),
    }),
    formats: ['svg', 'gif'],
    themes: ['default', 'dark', 'rainbow'],
    locales: ['zh-CN', 'en'],
    defaults: () => ({ fps: 20, duration: 12 }),
    async load(ctx, params) {
      return ctx.data.read({
        kind: 'activity',
        source: params.source,
        subject: params.subject,
        ...(params.year !== undefined ? { year: params.year } : {}),
      });
    },
    render(ctx, snapshot, params) {
      return drawSnake(ctx, snapshot.data, params);
    },
  }),
];
