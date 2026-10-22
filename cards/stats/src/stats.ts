import * as z from 'zod';
import { defineCard } from '@cool-profile/card-kit';
import { cardTheme, svgDocument } from '@cool-profile/graphics';

const labels = {
  'zh-CN': {
    title: '个人统计',
    recent: '近 365 天',
    current: '当前',
    stars: '获赞',
    commits: '提交',
    'pull-requests': '合并请求',
    issues: '议题',
    followers: '关注者',
    'public-repositories': '公开仓库',
  },
  en: {
    title: 'Profile stats',
    recent: 'Last 365 days',
    current: 'Current',
    stars: 'Stars earned',
    commits: 'Commits',
    'pull-requests': 'Pull requests',
    issues: 'Issues',
    followers: 'Followers',
    'public-repositories': 'Public repos',
  },
};
const metricIds = [
  'stars',
  'commits',
  'pull-requests',
  'issues',
  'followers',
  'public-repositories',
];

export const stats = defineCard({
  id: 'stats',
  params: z.strictObject({
    source: z.enum(['github', 'cnb']).describe('数据源'),
    subject: z.string().min(1).max(100).describe('账号名'),
  }),
  formats: ['svg', 'png'],
  themes: ['default', 'dark'],
  locales: ['zh-CN', 'en'],
  async load(ctx, params) {
    return ctx.data.read({
      kind: 'profile-stats',
      source: params.source,
      subject: params.subject,
    });
  },
  render(ctx, snapshot, params) {
    const theme = cardTheme(params.source, ctx.media.theme);
    const copy = labels[ctx.media.locale as keyof typeof labels];
    const text = ctx.text;
    const metrics = snapshot.data.metrics.filter((metric) => metricIds.includes(metric.id));
    const content = [
      '<rect x=".5" y=".5" width="619" height="329" rx="20" fill="' +
        theme.background +
        '" stroke="' +
        theme.border +
        '"/>',
      '<rect x="28" y="29" width="4" height="36" rx="2" fill="' + theme.accent + '"/>',
      text(params.source.toUpperCase() + ' / ' + copy.title, 44, 37, {
        size: 12,
        weight: 600,
        fill: theme.muted,
      }),
      text(snapshot.data.name, 44, 66, {
        size: 25,
        weight: 600,
        fill: theme.text,
        maxWidth: 535,
      }),
    ];
    const formatter = new Intl.NumberFormat(ctx.media.locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    metrics.forEach((metric, index) => {
      const x = 28 + (index % 3) * 193;
      const y = 91 + Math.floor(index / 3) * 93;
      const label = copy[metric.id as keyof typeof copy] ?? metric.id;
      content.push(
        '<rect x="' +
          x +
          '" y="' +
          y +
          '" width="178" height="79" rx="10" fill="' +
          theme.panel +
          '"/>',
        text(label, x + 14, y + 22, { size: 12, fill: theme.muted, maxWidth: 150 }),
        text(metric.value === null ? '—' : formatter.format(metric.value), x + 14, y + 55, {
          size: 27,
          weight: 600,
          fill: theme.text,
          maxWidth: 120,
        }),
        text(metric.scope === 'last-365-days' ? copy.recent : copy.current, x + 164, y + 66, {
          size: 9,
          fill: theme.muted,
          anchor: 'end',
        }),
      );
    });
    content.push(
      '<path d="M28 286H592" stroke="' + theme.border + '"/>',
      text(snapshot.data.url.replace(/^https?:\/\//, ''), 28, 311, {
        size: 11,
        fill: theme.muted,
        maxWidth: 400,
      }),
      text('COOL PROFILE', 592, 311, {
        size: 10,
        weight: 600,
        fill: theme.accent,
        anchor: 'end',
      }),
    );
    return svgDocument(620, 330, content.join(''), {
      title: snapshot.data.name + ' · ' + copy.title,
      description: metrics
        .map((metric) => (copy[metric.id as keyof typeof copy] ?? metric.id) + ': ' + metric.value)
        .join(', '),
    });
  },
});
