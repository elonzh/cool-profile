import * as z from 'zod';
import { defineCard } from '@cool-profile/card-kit';
import { svgDocument } from '@cool-profile/graphics';
import { cardFrame } from '@cool-profile/graphics';

const labels = {
  'zh-CN': {
    title: '语言分布',
    bytes: '代码字节',
    repositories: '仓库数',
    other: '其他语言',
    empty: '暂无语言数据',
    recognized: '已识别语言',
    public: '公开仓库',
    original: '公开原创仓库',
  },
  en: {
    title: 'Languages',
    bytes: 'Code bytes',
    repositories: 'Repositories',
    other: 'Other languages',
    empty: 'No language data',
    recognized: 'Classified',
    public: 'public repos',
    original: 'public non-fork repos',
  },
};

export default defineCard({
  params: z.strictObject({
    source: z.enum(['github', 'cnb']).describe('数据源'),
    subject: z.string().min(1).max(100).describe('账号名'),
    metric: z
      .enum(['bytes', 'repositories'])
      .optional()
      .describe('统计单位；GitHub 默认 bytes，CNB 默认 repositories'),
    'include-forks': z.boolean().describe('包含 Fork 仓库'),
    limit: z.number().int().min(1).max(10).describe('显示的语言数，其余合并'),
  }),
  formats: ['svg', 'png'],
  themes: ['default', 'dark'],
  locales: ['zh-CN', 'en'],
  defaults: () => ({ 'include-forks': false, limit: 6 }),
  validate(params) {
    return params.source === 'cnb' && params.metric === 'bytes'
      ? [{ path: 'metric', message: 'CNB supports repositories, not code bytes' }]
      : [];
  },
  async load(ctx, params) {
    return ctx.data.read({
      kind: 'languages',
      source: params.source,
      subject: params.subject,
      'include-forks': params['include-forks'],
      ...(params.metric ? { metric: params.metric } : {}),
    });
  },
  render(ctx, snapshot, params) {
    const data = snapshot.data;
    const copy = labels[ctx.media.locale as keyof typeof labels];
    const rows = data.languages.slice(0, params.limit).map((row) => ({ ...row }));
    if (data.languages.length > params.limit)
      rows.push({
        name: copy.other,
        value: data.languages.slice(params.limit).reduce((sum, row) => sum + row.value, 0),
        color: '#9198a1',
      });
    const total = data.languages.reduce((sum, row) => sum + row.value, 0);
    const height = Math.max(300, 144 + rows.length * 29);
    const { theme, content } = cardFrame(
      params.source,
      ctx.media.theme,
      height,
      ctx.text,
      copy.title,
      params.subject,
    );
    const text = ctx.text;
    const number = new Intl.NumberFormat(ctx.media.locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    const percent = new Intl.NumberFormat(ctx.media.locale, {
      style: 'percent',
      maximumFractionDigits: 1,
    });
    const cy = Math.round((88 + height - 54) / 2);
    if (total) {
      const circumference = 2 * Math.PI * 65;
      let offset = 0;
      for (const row of rows) {
        const length = (row.value / total) * circumference;
        content.push(
          `<circle cx="132" cy="${cy}" r="65" fill="none" stroke="${row.color}" stroke-width="16" stroke-dasharray="${length} ${circumference}" stroke-dashoffset="${-offset}" transform="rotate(-90 132 ${cy})"/>`,
        );
        offset += length;
      }
      content.push(
        text(number.format(total), 132, cy + 1, {
          size: 27,
          weight: 600,
          fill: theme.text,
          anchor: 'middle',
          maxWidth: 100,
        }),
        text(copy[data.unit], 132, cy + 24, { size: 11, fill: theme.muted, anchor: 'middle' }),
      );
      rows.forEach((row, index) => {
        const y = 111 + index * 29;
        content.push(
          `<circle cx="252" cy="${y - 4}" r="4" fill="${row.color}"/>`,
          text(row.name, 266, y, { size: 13, fill: theme.text, maxWidth: 151 }),
          text(number.format(row.value), 529, y, {
            size: 12,
            fill: theme.muted,
            anchor: 'end',
            maxWidth: 100,
          }),
          text(percent.format(row.value / total), 592, y, {
            size: 12,
            fill: theme.text,
            weight: 600,
            anchor: 'end',
            maxWidth: 55,
          }),
        );
      });
    } else {
      content.push(text(copy.empty, 310, cy, { size: 18, fill: theme.muted, anchor: 'middle' }));
    }
    const footer = `${copy.recognized} ${data.classifiedRepositories}/${data.repositoryCount} · ${params['include-forks'] ? copy.public : copy.original}`;
    content.push(
      `<path d="M28 ${height - 47}H592" stroke="${theme.border}"/>`,
      text(footer, 28, height - 23, { size: 11, fill: theme.muted, maxWidth: 424 }),
      text('COOL PROFILE', 592, height - 23, {
        size: 10,
        weight: 600,
        fill: theme.accent,
        anchor: 'end',
      }),
    );
    return svgDocument(620, height, content.join(''), {
      title: params.subject + ' · ' + copy.title,
      description:
        copy[data.unit] +
        ' · ' +
        data.languages.map((row) => row.name + ': ' + row.value).join(', ') +
        ' · ' +
        footer,
    });
  },
});
