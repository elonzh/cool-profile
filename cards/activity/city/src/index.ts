import * as z from 'zod';
import { defineCard, paint } from '@cool-profile/card-kit';
import { validateCalendarYear } from '@cool-profile/data/calendar';
import { drawCity } from './draw.js';

export default defineCard({
  params: z.strictObject({
    source: z.enum(['github', 'cnb']).describe('数据源'),
    subject: z.string().min(1).max(100).describe('账号名'),
    year: z.number().int().min(1000).max(9999).optional().describe('日历年份，默认最近 365 天'),
    layout: z.enum(['dashboard', 'calendar']).optional().describe('组合卡或独立 3D 日历'),
    colors: z.array(paint).length(5).optional().describe('从空白到最高等级的五级配色'),
    animate: z.boolean().describe('启用建筑生长动画，仅 SVG 支持'),
  }),
  formats: ['svg', 'png'],
  themes: [
    'default',
    'dark',
    'season',
    'rainbow',
    'blocks',
    'season-north',
    'season-south',
    'night-view',
    'night-green',
    'night-rainbow',
    'halloween',
  ],
  locales: ['zh-CN', 'en'],
  defaults: (media) => ({
    animate:
      media.format === 'svg' &&
      ['default', 'season', 'season-north', 'season-south'].includes(media.theme),
  }),
  validate: (params, media, ctx) => [
    ...validateCalendarYear(params.year, params.source, ctx.now),
    ...(media.format === 'png' && params.animate
      ? [{ path: 'animate', message: 'PNG requires animate=false' }]
      : []),
  ],
  async load(ctx, params) {
    const activity = await ctx.data.read({
      kind: 'activity',
      source: params.source,
      subject: params.subject,
      ...(params.year !== undefined ? { year: params.year } : {}),
    });
    if (params.layout === 'calendar') return { activity };
    const [stats, languages] = await Promise.all([
      ctx.data.read({
        kind: 'profile-stats',
        source: params.source,
        subject: params.subject,
        ...(params.year ? { year: params.year } : {}),
      }),
      ctx.data.read({ kind: 'languages', source: params.source, subject: params.subject }),
    ]);
    return { activity, details: { stats: stats.data, languages: languages.data } };
  },
  render(ctx, snapshot, params) {
    return drawCity(ctx, snapshot.activity.data, params, snapshot.details);
  },
});
