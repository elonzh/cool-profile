import * as z from 'zod';
import { defineCard } from '@cool-profile/card-kit';
import { validateCalendarYear } from '@cool-profile/data/calendar';
import { drawCity } from './draw.js';

export const cards = [
  defineCard({
    id: 'contrib-3d',
    params: z.strictObject({
      source: z.enum(['github', 'cnb']).describe('数据源'),
      subject: z.string().min(1).max(100).describe('账号名'),
      year: z.number().int().min(1000).max(9999).optional().describe('日历年份，默认最近 365 天'),
      animate: z.boolean().describe('启用建筑生长动画，仅 SVG 支持'),
    }),
    formats: ['svg', 'png'],
    themes: ['default', 'dark', 'season', 'rainbow', 'blocks'],
    locales: ['zh-CN', 'en'],
    defaults: (media) => ({ animate: media.format === 'svg' }),
    validate: (params, media, ctx) => [
      ...validateCalendarYear(params.year, params.source, ctx.now),
      ...(media.format === 'png' && params.animate
        ? [{ path: 'animate', message: 'PNG requires animate=false' }]
        : []),
    ],
    async load(ctx, params) {
      return ctx.data.read({
        kind: 'activity',
        source: params.source,
        subject: params.subject,
        ...(params.year !== undefined ? { year: params.year } : {}),
      });
    },
    render(ctx, snapshot, params) {
      return drawCity(ctx, snapshot.data, params);
    },
  }),
];
