import * as z from 'zod';
import { defineCard } from '@cool-profile/card-kit';
import { svgDocument } from '@cool-profile/graphics';
import { repositorySubjectIssue } from '@cool-profile/data/repository-subject';
import { frame, wrapDescription } from './layout.js';

const labels = {
  'zh-CN': {
    title: '仓库',
    empty: '暂无简介',
    stars: '星标',
    forks: 'Fork',
    'open-items': '未关闭议题与合并请求',
    language: '未识别语言',
    license: '未声明许可证',
  },
  en: {
    title: 'Repository',
    empty: 'No description',
    stars: 'Stars',
    forks: 'Forks',
    'open-items': 'Open issues & pull requests',
    language: 'No language data',
    license: 'No license declared',
  },
};

export const repo = defineCard({
  id: 'repo',
  params: z.strictObject({
    source: z.enum(['github', 'cnb']).describe('数据源'),
    subject: z.string().min(1).max(300).describe('完整仓库路径'),
  }),
  formats: ['svg', 'png'],
  themes: ['default', 'dark'],
  locales: ['zh-CN', 'en'],
  validate(params) {
    const message = repositorySubjectIssue(params.subject, params.source);
    return message ? [{ path: 'subject', message }] : [];
  },
  async load(ctx, params) {
    return ctx.data.read({ kind: 'repository', source: params.source, subject: params.subject });
  },
  render(ctx, snapshot, params) {
    const data = snapshot.data;
    const copy = labels[ctx.media.locale as keyof typeof labels];
    const { theme, content } = frame(
      params.source,
      ctx.media.theme,
      300,
      ctx.text,
      copy.title,
      data.name,
    );
    const text = ctx.text;
    wrapDescription(data.description || copy.empty, text, 564, 3).forEach((line, index) => {
      content.push(text(line, 28, 99 + index * 21, { size: 14, fill: theme.muted }));
    });
    const formatter = new Intl.NumberFormat(ctx.media.locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    data.metrics.forEach((metric, index) => {
      const x = 28 + index * 193;
      content.push(
        `<rect x="${x}" y="164" width="178" height="79" rx="10" fill="${theme.panel}"/>`,
        text(copy[metric.id as keyof typeof copy] ?? metric.id, x + 14, 188, {
          size: 10,
          fill: theme.muted,
          maxWidth: 150,
        }),
        text(metric.value === null ? '—' : formatter.format(metric.value), x + 14, 221, {
          size: 27,
          weight: 600,
          fill: theme.text,
          maxWidth: 150,
        }),
      );
    });
    content.push(`<path d="M28 256H592" stroke="${theme.border}"/>`);
    if (data.language)
      content.push(`<circle cx="33" cy="278" r="5" fill="${data.language.color}"/>`);
    content.push(
      text(data.language?.name ?? copy.language, data.language ? 46 : 28, 282, {
        size: 11,
        fill: theme.muted,
        maxWidth: 200,
      }),
      text(data.license ?? copy.license, 285, 282, { size: 11, fill: theme.muted, maxWidth: 175 }),
      text('COOL PROFILE', 592, 282, { size: 10, weight: 600, fill: theme.accent, anchor: 'end' }),
    );
    return svgDocument(620, 300, content.join(''), {
      title: data.name + ' · ' + copy.title,
      description: [
        data.url,
        data.description || copy.empty,
        ...data.metrics.map(
          (metric) => (copy[metric.id as keyof typeof copy] ?? metric.id) + ': ' + metric.value,
        ),
        data.language?.name ?? copy.language,
        data.license ?? copy.license,
      ].join(' · '),
    });
  },
});
