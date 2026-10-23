import * as z from 'zod';
import { defineCard, appearanceParams, surfaceParams, paint } from '@cool-profile/card-kit';
import {
  profileThemes,
  profileTheme,
  surface,
  heading,
  entrance,
  formatNumber,
  ringChart,
  svgDocument,
} from '@cool-profile/graphics';

export default defineCard({
  params: z.strictObject({
    source: z.enum(['github', 'cnb']).describe('数据源'),
    subject: z.string().min(1).max(100).describe('账号名'),
    ...surfaceParams,
    'line-height': appearanceParams['line-height'],
    'number-format': appearanceParams['number-format'],
    'number-precision': appearanceParams['number-precision'],
    animate: appearanceParams.animate,
    metric: z
      .enum(['bytes', 'repositories'])
      .optional()
      .describe('统计单位；GitHub 默认字节，CNB 默认仓库'),
    'include-forks': z.boolean().describe('包含 Fork 仓库'),
    limit: z.number().int().min(1).max(20).describe('显示语言数量，其余合并'),
    layout: z
      .enum(['normal', 'compact', 'donut', 'donut-vertical', 'pie'])
      .optional()
      .describe('语言图布局'),
    hide: z.array(z.string().min(1).max(100)).max(100).optional().describe('隐藏语言'),
    'exclude-repo': z
      .array(z.string().min(1).max(300))
      .max(100)
      .optional()
      .describe('排除完整仓库路径'),
    'stats-format': z.enum(['percentages', 'values']).optional().describe('显示百分比或原始统计值'),
    'hide-progress': z.boolean().optional().describe('隐藏语言进度条'),
    'hide-values': z.boolean().optional().describe('隐藏数值'),
    'bar-background': paint.optional().describe('进度条底色'),
  }),
  formats: ['svg', 'png'],
  themes: profileThemes,
  locales: ['zh-CN', 'en'],
  defaults: () => ({ 'include-forks': false, limit: 6, layout: 'donut' as const }),
  validate: (params) =>
    params.source === 'cnb' && params.metric === 'bytes'
      ? [{ path: 'metric', message: 'CNB supports repositories, not code bytes' }]
      : [],
  load: (ctx, params) =>
    ctx.data.read({
      kind: 'languages',
      source: params.source,
      subject: params.subject,
      'include-forks': params['include-forks'],
      ...(params.metric ? { metric: params.metric } : {}),
      ...(params['exclude-repo'] ? { 'exclude-repo': params['exclude-repo'] } : {}),
    }),
  render(ctx, snapshot, params) {
    const data = snapshot.data,
      zh = ctx.media.locale === 'zh-CN',
      theme = profileTheme(params.source, ctx.media.theme, params);
    const filtered = data.languages.filter(
      (row) => !params.hide?.some((name) => name.toLowerCase() === row.name.toLowerCase()),
    );
    const rows = filtered.slice(0, params.limit).map((row) => ({ ...row }));
    if (filtered.length > params.limit)
      rows.push({
        name: zh ? '其他语言' : 'Other languages',
        color: '#9198a1',
        value: filtered.slice(params.limit).reduce((sum, row) => sum + row.value, 0),
      });
    const total = filtered.reduce((sum, row) => sum + row.value, 0),
      width = params.width ?? 620,
      layout = params.layout ?? 'donut',
      top = params['hide-title'] ? 24 : 65;
    const line = params['line-height'] ?? 30;
    const vertical =
        layout === 'donut-vertical' || layout === 'pie' || (layout === 'donut' && width < 480),
      normal = layout === 'normal',
      compact = layout === 'compact';
    const legendColumns = width < 440 ? 1 : 2;
    const height = Math.max(
      160,
      top +
        (normal
          ? rows.length * (params['hide-progress'] ? line : line + 14)
          : compact
            ? 34 + Math.ceil(rows.length / legendColumns) * line
            : vertical
              ? 210 + Math.ceil(rows.length / legendColumns) * line
              : Math.max(185, rows.length * line)) +
        47,
    );
    let body = '';
    const value = (n: number) =>
      params['stats-format'] === 'values'
        ? formatNumber(n, ctx.media.locale, params) +
          (data.unit === 'bytes' ? ' B' : zh ? ' 仓库' : ' repos')
        : new Intl.NumberFormat(ctx.media.locale, {
            style: 'percent',
            maximumFractionDigits: 1,
          }).format(total ? n / total : 0);
    const legend = (x: number, y: number, colWidth: number, row: (typeof rows)[number]) =>
      `<circle cx="${x + 4}" cy="${y - 4}" r="4" fill="${row.color}"/>` +
      ctx.text(row.name, x + 17, y, {
        size: 13,
        fill: theme.text,
        maxWidth: colWidth - (params['hide-values'] ? 22 : 92),
      }) +
      (params['hide-values']
        ? ''
        : ctx.text(value(row.value), x + colWidth - 8, y, {
            size: 12,
            fill: theme.muted,
            anchor: 'end',
            maxWidth: 80,
          }));
    if (!total)
      body = ctx.text(zh ? '暂无语言数据' : 'No language data', width / 2, top + 65, {
        size: 16,
        fill: theme.muted,
        anchor: 'middle',
      });
    else if (normal) {
      rows.forEach((row, i) => {
        const y = top + 18 + i * (params['hide-progress'] ? line : line + 14);
        body += legend(26, y, width - 52, row);
        if (!params['hide-progress'])
          body += `<rect x="26" y="${y + 9}" width="${width - 52}" height="8" rx="4" fill="${params['bar-background'] ?? theme.border}" fill-opacity=".45"/><rect x="26" y="${y + 9}" width="${((width - 52) * row.value) / total}" height="8" rx="4" fill="${row.color}"/>`;
      });
    } else if (compact) {
      let cursor = 26;
      if (!params['hide-progress'])
        body +=
          `<defs><clipPath id="language-bar"><rect x="26" y="${top}" width="${width - 52}" height="10" rx="5"/></clipPath></defs><g clip-path="url(#language-bar)">` +
          rows
            .map((row) => {
              const w = ((width - 52) * row.value) / total;
              const rect = `<rect x="${cursor}" y="${top}" width="${w + 0.1}" height="10" fill="${row.color}"/>`;
              cursor += w;
              return rect;
            })
            .join('') +
          '</g>';
      rows.forEach((row, i) => {
        body += legend(
          26 + ((i % legendColumns) * (width - 52)) / legendColumns,
          top + 43 + Math.floor(i / legendColumns) * line,
          (width - 52) / legendColumns,
          row,
        );
      });
    } else {
      const cx = vertical ? width / 2 : 130,
        cy = top + (vertical ? 91 : Math.max(85, (rows.length * line) / 2)),
        radius = 76;
      body += ringChart(rows, cx, cy, radius, 19, layout === 'pie');
      if (layout !== 'pie')
        body +=
          ctx.text(formatNumber(total, ctx.media.locale, params), cx, cy + 3, {
            size: 25,
            weight: 600,
            fill: theme.text,
            anchor: 'middle',
            maxWidth: 105,
          }) +
          ctx.text(
            data.unit === 'bytes'
              ? zh
                ? '代码字节'
                : 'Code bytes'
              : zh
                ? '仓库数'
                : 'Repositories',
            cx,
            cy + 25,
            { size: 10, fill: theme.muted, anchor: 'middle' },
          );
      rows.forEach((row, i) => {
        body += vertical
          ? legend(
              26 + ((i % legendColumns) * (width - 52)) / legendColumns,
              top + 215 + Math.floor(i / legendColumns) * line,
              (width - 52) / legendColumns,
              row,
            )
          : legend(245, top + 18 + i * line, width - 271, row);
      });
    }
    const footer =
      (zh ? '已识别语言 ' : 'Classified ') +
      data.classifiedRepositories +
      '/' +
      data.repositoryCount +
      ' · ' +
      (data.unit === 'bytes' ? (zh ? '代码字节' : 'Code bytes') : zh ? '仓库数' : 'Repositories');
    body += ctx.text(footer, 26, height - 17, {
      size: 10,
      fill: theme.muted,
      maxWidth: width - 52,
    });
    const title = zh ? '语言分布' : 'Languages';
    return svgDocument(
      width,
      height,
      surface(width, height, theme, params) +
        heading(ctx.text, title, theme, width, params) +
        entrance(body, params.animate && ctx.media.format === 'svg'),
      {
        title: params.subject + ' · ' + title,
        description:
          data.languages.map((row) => row.name + ': ' + row.value).join(', ') + ' · ' + footer,
      },
    );
  },
});
