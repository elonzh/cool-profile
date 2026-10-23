import type { TextRenderer } from './types.js';
import type { ProfileTheme } from './appearance.js';

export interface ChartRow {
  name: string;
  value: number;
  color: string;
}
export function ringChart(
  rows: readonly ChartRow[],
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
  pie = false,
) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!total) return '';
  let angle = -Math.PI / 2;
  return rows
    .map((row) => {
      const fraction = row.value / total;
      const end = angle + fraction * Math.PI * 2;
      const x1 = cx + radius * Math.cos(angle),
        y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(end),
        y2 = cy + radius * Math.sin(end);
      let shape: string;
      if (fraction >= 1 - 1e-10)
        shape = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${pie ? row.color : 'none'}" stroke="${row.color}" stroke-width="${pie ? 0 : thickness}"/>`;
      else
        shape = pie
          ? `<path d="M${cx} ${cy}L${x1} ${y1}A${radius} ${radius} 0 ${fraction > 0.5 ? 1 : 0} 1 ${x2} ${y2}Z" fill="${row.color}"/>`
          : `<path d="M${x1} ${y1}A${radius} ${radius} 0 ${fraction > 0.5 ? 1 : 0} 1 ${x2} ${y2}" fill="none" stroke="${row.color}" stroke-width="${thickness}"/>`;
      angle = end;
      return shape;
    })
    .join('');
}
export interface RadarAxis {
  name: string;
  value: number;
}
export function radarChart(
  axes: readonly RadarAxis[],
  text: TextRenderer,
  theme: ProfileTheme,
  cx: number,
  cy: number,
  radius: number,
  animate = false,
) {
  if (axes.length < 3) return '';
  const maximum = Math.max(10, ...axes.map((axis) => axis.value));
  const decades = Math.max(1, Math.ceil(Math.log10(maximum)));
  const point = (i: number, r: number) => [
    cx + Math.sin((i * 2 * Math.PI) / axes.length) * r,
    cy - Math.cos((i * 2 * Math.PI) / axes.length) * r,
  ];
  const points = (r: number) => axes.map((_, i) => point(i, r).join(',')).join(' ');
  let svg = '';
  for (let ring = 1; ring <= decades; ring++) {
    const r = (radius * ring) / decades;
    svg += `<polygon points="${points(r)}" fill="none" stroke="${theme.muted}" stroke-opacity=".35" stroke-dasharray="3 4"/>`;
    svg += text(
      new Intl.NumberFormat('en', { notation: 'compact' }).format(10 ** ring),
      cx + 5,
      cy - r + 12,
      { size: 9, fill: theme.muted },
    );
  }
  axes.forEach((axis, i) => {
    const p = point(i, radius),
      label = point(i, radius + 24);
    svg += `<path d="M${cx} ${cy}L${p.join(' ')}" stroke="${theme.muted}" stroke-opacity=".3"/>`;
    svg += text(axis.name, label[0]!, label[1]! + 4, {
      size: 12,
      fill: theme.text,
      anchor: 'middle',
      maxWidth: 106,
    });
    svg += text(
      new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
        axis.value,
      ),
      label[0]!,
      label[1]! + 20,
      { size: 10, fill: theme.muted, anchor: 'middle' },
    );
  });
  const dataPoints = axes
    .map((axis, i) =>
      point(i, (Math.log10(1 + axis.value) / Math.log10(1 + 10 ** decades)) * radius).join(','),
    )
    .join(' ');
  const shape = `<polygon points="${dataPoints}" fill="${theme.accent}" fill-opacity=".22" stroke="${theme.accent}" stroke-width="2"/>`;
  svg += animate
    ? `<g><animateTransform attributeName="transform" type="translate" values="${cx} ${cy};0 0" dur=".8s" fill="freeze"/><animateTransform attributeName="transform" type="scale" values="0;1" dur=".8s" additive="sum" fill="freeze"/>${shape}</g>`
    : shape;
  return svg;
}
export const metricNames: Record<string, Record<string, string>> = {
  'zh-CN': {
    stars: '获得星标',
    commits: '提交',
    'pull-requests': '合并请求',
    issues: '议题',
    followers: '关注者',
    'public-repositories': '公开仓库',
    reviews: '代码评审',
    'repositories-contributed': '贡献仓库',
    forks: '被 Fork',
    contributions: '贡献',
    'activity-score': '活跃分数',
    'open-items': '未关闭议题与合并请求',
  },
  en: {
    stars: 'Stars earned',
    commits: 'Commits',
    'pull-requests': 'Pull requests',
    issues: 'Issues',
    followers: 'Followers',
    'public-repositories': 'Public repos',
    reviews: 'Reviews',
    'repositories-contributed': 'Repos contributed',
    forks: 'Forks',
    contributions: 'Contributions',
    'activity-score': 'Activity score',
    'open-items': 'Open issues & PRs',
  },
};
