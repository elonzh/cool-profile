import * as z from 'zod';
import { defineCard, appearanceParams, paint } from '@cool-profile/card-kit';
import {
  profileThemes,
  profileTheme,
  surface,
  heading,
  entrance,
  metricIcon,
  metricNames,
  formatNumber,
  svgDocument,
} from '@cool-profile/graphics';
import { validateCalendarYear } from '@cool-profile/data/calendar';

const defaultMetrics = [
  'stars',
  'commits',
  'pull-requests',
  'issues',
  'followers',
  'public-repositories',
];
const metricIds = [...defaultMetrics, 'reviews', 'repositories-contributed', 'forks'] as const;

// The displayed grade is calculated locally from public counters, never a platform rank.
export function estimatedGrade(metrics: readonly { id: string; value: number | null }[]) {
  const weights: [string, number, number, boolean][] = [
    ['commits', 250, 2, false],
    ['pull-requests', 50, 3, false],
    ['issues', 25, 1, false],
    ['reviews', 2, 1, false],
    ['stars', 50, 4, true],
    ['followers', 10, 1, true],
  ];
  let score = 0,
    weight = 0;
  for (const [id, median, w, log] of weights) {
    const value = metrics.find((metric) => metric.id === id)?.value;
    if (value === null || value === undefined) continue;
    const normalized = value / median;
    score += w * (log ? normalized / (1 + normalized) : 1 - 2 ** -normalized);
    weight += w;
  }
  const percentile = weight ? 100 * (1 - score / weight) : 100;
  const grades: [number, string][] = [
    [1, 'S'],
    [12.5, 'A+'],
    [25, 'A'],
    [37.5, 'A-'],
    [50, 'B+'],
    [62.5, 'B'],
    [75, 'B-'],
    [87.5, 'C+'],
    [100, 'C'],
  ];
  return { grade: grades.find(([bound]) => percentile <= bound)![1], percentile };
}
export default defineCard({
  params: z.strictObject({
    source: z.enum(['github', 'cnb']).describe('数据源'),
    subject: z.string().min(1).max(100).describe('账号名'),
    ...appearanceParams,
    year: z.number().int().min(1000).max(9999).optional().describe('统计年份，默认近 365 天'),
    layout: z.enum(['normal', 'compact']).optional().describe('指标列表或双列紧凑布局'),
    hide: z.array(z.enum(metricIds)).max(9).optional().describe('隐藏的指标'),
    show: z.array(z.enum(metricIds)).max(9).optional().describe('额外显示的指标'),
    'hide-rank': z.boolean().optional().describe('隐藏计算等级环'),
    'rank-icon': z.enum(['grade', 'percentile']).optional().describe('等级环显示字母或估算百分位'),
    'ring-color': paint.optional().describe('等级环颜色'),
  }),
  formats: ['svg', 'png'],
  themes: profileThemes,
  locales: ['zh-CN', 'en'],
  defaults: () => ({ layout: 'normal' as const, 'show-icons': true }),
  validate: (params, _media, ctx) => validateCalendarYear(params.year, params.source, ctx.now),
  load: (ctx, params) =>
    ctx.data.read({
      kind: 'profile-stats',
      source: params.source,
      subject: params.subject,
      ...(params.year ? { year: params.year } : {}),
    }),
  render(ctx, snapshot, params) {
    const data = snapshot.data,
      theme = profileTheme(params.source, ctx.media.theme, params),
      zh = ctx.media.locale === 'zh-CN';
    const names = metricNames[ctx.media.locale]!;
    const ids = [...new Set([...defaultMetrics, ...(params.show ?? [])])].filter(
      (id) => !params.hide?.includes(id as (typeof metricIds)[number]),
    );
    const metrics = ids
      .map((id) => data.metrics.find((metric) => metric.id === id))
      .filter((metric) => metric !== undefined);
    const width = params.width ?? 620,
      line = params['line-height'] ?? 31,
      compact = params.layout === 'compact';
    const rank = !params['hide-rank'],
      rankBelow = width < 440 || (compact && width < 560);
    const available = width - 52 - (rank && !rankBelow ? 145 : 0),
      columns = compact && available >= 360 ? 2 : 1,
      rows = Math.ceil(metrics.length / columns);
    const top = params['hide-title'] ? 30 : 69;
    const height = Math.max(
      rank ? 225 : 130,
      top + rows * line + 35 + (rank && rankBelow ? 160 : 0),
    );
    const colWidth = available / columns;
    let body = '';
    metrics.forEach((metric, i) => {
      const column = i % columns,
        row = Math.floor(i / columns);
      const x = 26 + column * colWidth,
        y = top + row * line;
      const icons = params['show-icons'] !== false;
      if (icons) body += metricIcon(metric.id, x, y - 13, theme.icon);
      body += ctx.text(names[metric.id] ?? metric.id, x + (icons ? 27 : 0), y, {
        size: 13,
        weight: params['text-bold'] ? 600 : 400,
        fill: theme.text,
        maxWidth: colWidth * 0.68 - (icons ? 27 : 0),
      });
      body += ctx.text(formatNumber(metric.value, ctx.media.locale, params), x + colWidth - 16, y, {
        size: 14,
        weight: 600,
        fill: theme.text,
        anchor: 'end',
        maxWidth: colWidth * 0.3,
      });
    });
    if (rank) {
      const { grade, percentile } = estimatedGrade(data.metrics),
        cx = rankBelow ? width / 2 : width - 94,
        cy = rankBelow ? height - 109 : (top + height - 36) / 2,
        r = 43,
        c = 2 * Math.PI * r;
      const color = params['ring-color'] ?? theme.accent;
      body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-opacity=".16" stroke-width="6"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c * (1 - percentile / 100)} ${c}" transform="rotate(-90 ${cx} ${cy})"/>`;
      body += ctx.text(
        params['rank-icon'] === 'percentile' ? percentile.toFixed(1) + '%' : grade,
        cx,
        cy + 10,
        { size: 29, weight: 600, fill: theme.text, anchor: 'middle' },
      );
      body += ctx.text(zh ? '计算等级' : 'Calculated grade', cx, cy + 69, {
        size: 10,
        fill: theme.muted,
        anchor: 'middle',
      });
    }
    body += ctx.text(
      params.year ? String(params.year) : zh ? '近 365 天' : 'Last 365 days',
      26,
      height - 17,
      { size: 10, fill: theme.muted },
    );
    const title = zh ? `${data.name} 的个人统计` : `${data.name}'s stats`;
    return svgDocument(
      width,
      height,
      surface(width, height, theme, params) +
        heading(ctx.text, title, theme, width, params) +
        entrance(body, params.animate && ctx.media.format === 'svg'),
      {
        title,
        description: metrics
          .map((metric) => (names[metric.id] ?? metric.id) + ': ' + (metric.value ?? '—'))
          .join(', '),
      },
    );
  },
});
