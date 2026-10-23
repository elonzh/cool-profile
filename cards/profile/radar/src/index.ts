import * as z from 'zod';
import { defineCard, surfaceParams, appearanceParams } from '@cool-profile/card-kit';
import { validateCalendarYear } from '@cool-profile/data/calendar';
import {
  profileThemes,
  profileTheme,
  surface,
  heading,
  radarChart,
  metricNames,
  svgDocument,
} from '@cool-profile/graphics';
export default defineCard({
  params: z.strictObject({
    source: z.enum(['github', 'cnb']).describe('数据源'),
    subject: z.string().min(1).max(100).describe('账号名'),
    ...surfaceParams,
    animate: appearanceParams.animate,
    year: z.number().int().min(1000).max(9999).optional().describe('统计年份，默认近 365 天'),
  }),
  formats: ['svg', 'png'],
  themes: profileThemes,
  locales: ['zh-CN', 'en'],
  validate: (params, _media, ctx) => validateCalendarYear(params.year, params.source, ctx.now),
  load: (ctx, params) =>
    ctx.data.read({
      kind: 'profile-stats',
      source: params.source,
      subject: params.subject,
      ...(params.year ? { year: params.year } : {}),
    }),
  render(ctx, snapshot, params) {
    const theme = profileTheme(params.source, ctx.media.theme, params),
      width = params.width ?? 520,
      height = 430,
      zh = ctx.media.locale === 'zh-CN';
    const names = metricNames[ctx.media.locale]!;
    const axes = [
      'commits',
      'issues',
      'pull-requests',
      'reviews',
      'repositories-contributed',
    ].flatMap((id) => {
      const metric = snapshot.data.metrics.find((metric) => metric.id === id);
      return metric?.value !== undefined && metric?.value !== null
        ? [{ name: names[id]!, value: metric.value }]
        : [];
    });
    const title = zh ? '贡献雷达' : 'Contribution radar';
    return svgDocument(
      width,
      height,
      surface(width, height, theme, params) +
        heading(ctx.text, title, theme, width, params) +
        radarChart(
          axes,
          ctx.text,
          theme,
          width / 2,
          227,
          Math.min(125, (width - 170) / 2),
          params.animate && ctx.media.format === 'svg',
        ) +
        ctx.text(
          params.year ? String(params.year) : zh ? '近 365 天' : 'Last 365 days',
          26,
          height - 18,
          { size: 10, fill: theme.muted },
        ),
      {
        title: params.subject + ' · ' + title,
        description: axes.map((axis) => axis.name + ': ' + axis.value).join(', '),
      },
    );
  },
});
