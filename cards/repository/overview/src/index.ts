import * as z from 'zod';
import { defineCard, appearanceParams } from '@cool-profile/card-kit';
import { repositorySubjectIssue } from '@cool-profile/data/repository-subject';
import {
  profileThemes,
  profileTheme,
  surface,
  entrance,
  formatNumber,
  metricIcon,
  metricNames,
  wrapDescription,
  svgDocument,
} from '@cool-profile/graphics';
export default defineCard({
  params: z.strictObject({
    source: z.enum(['github', 'cnb']).describe('数据源'),
    subject: z.string().min(1).max(300).describe('完整仓库路径'),
    ...appearanceParams,
    'show-owner': z.boolean().optional().describe('标题显示仓库所有者'),
    'description-lines': z.number().int().min(1).max(5).optional().describe('简介最大行数'),
    layout: z.enum(['normal', 'compact']).optional().describe('完整或紧凑仓库卡'),
  }),
  formats: ['svg', 'png'],
  themes: profileThemes,
  locales: ['zh-CN', 'en'],
  defaults: () => ({ 'show-icons': true, 'description-lines': 3 }),
  validate(params) {
    const issue = repositorySubjectIssue(params.subject, params.source);
    return issue ? [{ path: 'subject', message: issue }] : [];
  },
  load: (ctx, params) =>
    ctx.data.read({ kind: 'repository', source: params.source, subject: params.subject }),
  render(ctx, snapshot, params) {
    const data = snapshot.data,
      theme = profileTheme(params.source, ctx.media.theme, params),
      width = params.width ?? 620,
      zh = ctx.media.locale === 'zh-CN';
    const name = params.title ?? (params['show-owner'] ? data.name : data.name.split('/').at(-1)!);
    const lines = wrapDescription(
      data.description,
      ctx.text,
      width - 52,
      params['description-lines'] ?? 3,
    );
    const line = params['line-height'] ?? 22,
      top = params['hide-title'] ? 20 : 62;
    const baseHeight = Math.max(
      params.layout === 'compact' ? 130 : 165,
      top + lines.length * line + 65,
    );
    let cursor =
        26 +
        (data.language
          ? Math.min(132, ctx.text.measure(data.language.name, { size: 12 }) + 35)
          : 0),
      footerRow = 0;
    const metrics = data.metrics.map((metric) => {
      const n = formatNumber(metric.value, ctx.media.locale, params),
        iconWidth = params['show-icons'] !== false ? 23 : 0;
      const numberWidth = ctx.text.measure(n, {
        size: 12,
        weight: params['text-bold'] ? 600 : 400,
      });
      if (cursor + iconWidth + numberWidth > width - 26) {
        cursor = 26;
        footerRow++;
      }
      const item = { metric, n, x: cursor, row: footerRow, iconWidth };
      cursor += iconWidth + numberWidth + 24;
      return item;
    });
    const height = baseHeight + footerRow * 26,
      footerY = baseHeight - 24;
    let body = '';
    if (!params['hide-title'])
      body +=
        (params['show-icons'] !== false ? metricIcon('repository', 26, 24, theme.icon) : '') +
        ctx.text(name, params['show-icons'] !== false ? 53 : 26, 38, {
          size: 18,
          weight: 600,
          fill: theme.accent,
          maxWidth: width - 80,
        });
    lines.forEach((row, i) => {
      body += ctx.text(row, 26, top + i * line, { size: 14, fill: theme.muted });
    });
    if (data.language)
      body +=
        `<circle cx="30" cy="${footerY - 4}" r="5" fill="${data.language.color}"/>` +
        ctx.text(data.language.name, 43, footerY, { size: 12, fill: theme.text, maxWidth: 115 });
    for (const item of metrics) {
      const y = footerY + item.row * 26;
      if (item.iconWidth) body += metricIcon(item.metric.id, item.x, y - 13, theme.icon);
      body += ctx.text(item.n, item.x + item.iconWidth, y, {
        size: 12,
        weight: params['text-bold'] ? 600 : 400,
        fill: theme.text,
      });
    }
    if (data.license && cursor + ctx.text.measure(data.license, { size: 11 }) < width - 26)
      body += ctx.text(data.license, width - 26, height - 24, {
        size: 11,
        fill: theme.muted,
        anchor: 'end',
        maxWidth: width - cursor - 26,
      });
    const title = data.name + ' · ' + (zh ? '仓库' : 'Repository');
    return svgDocument(
      width,
      height,
      surface(width, height, theme, params) +
        entrance(body, params.animate && ctx.media.format === 'svg'),
      {
        title,
        description: [
          data.url,
          data.description,
          ...data.metrics.map(
            (metric) =>
              (metricNames[ctx.media.locale]![metric.id] ?? metric.id) +
              ': ' +
              (metric.value ?? '—'),
          ),
        ].join(' · '),
      },
    );
  },
});
