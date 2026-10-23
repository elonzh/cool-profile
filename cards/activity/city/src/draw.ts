import type { RenderContext } from '@cool-profile/card-kit';
import type { Activity, ProfileStats, LanguageBreakdown } from '@cool-profile/data/types';
import {
  activityGrid,
  activityLabel,
  calendarPalette,
  profileTheme,
  escapeXml,
  svgDocument,
  radarChart,
  ringChart,
  metricNames,
  formatNumber,
} from '@cool-profile/graphics';
import type { CalendarCell } from '@cool-profile/graphics';

type Point = readonly [number, number];
const footprint: readonly Point[] = [
  [0, 0],
  [14, 7],
  [0, 14],
  [-14, 7],
];
const poly = (vertices: readonly Point[], fill: string, extra = '') =>
  `<polygon points="${vertices.map((p) => p.join(',')).join(' ')}" fill="${fill}"${extra}/>`;
export function towerHeight(value: number, maximum: number, blocks: boolean): number {
  if (!value) return 0;
  const ratio = Math.log1p(value) / Math.log1p(maximum);
  return blocks ? 6 + Math.ceil(ratio * 6) * 10 : 5 + ratio * 70;
}
export interface CityDetails {
  stats: ProfileStats;
  languages: LanguageBreakdown;
}
export function drawCity(
  ctx: RenderContext,
  activity: Activity,
  params: {
    source: 'github' | 'cnb';
    subject: string;
    animate: boolean;
    layout?: 'dashboard' | 'calendar' | undefined;
    colors?: string[] | undefined;
  },
  details?: CityDetails,
) {
  const grid = activityGrid(activity),
    dashboard = params.layout !== 'calendar',
    width = 1280,
    height = dashboard ? 850 : 740;
  const night = ['dark', 'rainbow', 'night-view', 'night-green', 'night-rainbow'].includes(
    ctx.media.theme,
  );
  const theme = profileTheme(params.source, night ? 'dark' : 'default');
  if (ctx.media.theme === 'night-view') {
    theme.background = '#00000f';
    theme.accent = '#ffc837';
  }
  const native = params.colors ?? calendarPalette(params.source, night);
  const blocks = ctx.media.theme === 'blocks',
    zh = ctx.media.locale === 'zh-CN',
    title = zh ? '3D 活跃日历' : '3D activity calendar';
  const unit = activityLabel(activity.metric, ctx.media.locale),
    maximum = Math.max(0, ...grid.cells.map((cell) => cell.value));
  const dx = Math.min(19, 1010 / Math.max(1, grid.columns - 1));
  const project = (column: number, row: number) => ({
    x: 150 + column * dx - row * 17,
    y: 155 + column * 9 + row * 9,
  });
  const seasons = [
    ['#eff3f8', '#dae8f2', '#a5c8de', '#7ba6c1', '#4b819e'],
    ['#f1f5ee', '#d3e8ba', '#96cd85', '#56ae70', '#238759'],
    ['#f0f7f2', '#b5e6cc', '#72caa2', '#3ca77c', '#167855'],
    ['#f7f0e4', '#f9db9a', '#eaae60', '#d67d42', '#a64b2a'],
  ];
  const color = (cell: CalendarCell) => {
    if (!cell.level) return native[0]!;
    if (params.colors) return params.colors[cell.level]!;
    if (blocks) return ['#e9edef', '#4baf3a', '#f0cc22', '#3f4ee7', '#ed3840'][cell.level]!;
    if (['rainbow', 'night-rainbow'].includes(ctx.media.theme))
      return `hsl(${Math.round((cell.column / Math.max(1, grid.columns - 1)) * 300)} 75% ${72 - cell.level * 8}%)`;
    if (['season', 'season-north', 'season-south'].includes(ctx.media.theme)) {
      const month = Number(cell.date.slice(5, 7));
      const season =
        (Math.floor((month % 12) / 3) + (ctx.media.theme === 'season-south' ? 2 : 0)) % 4;
      return seasons[season]![cell.level]!;
    }
    if (ctx.media.theme === 'night-view')
      return ['#07182d', '#194478', '#236ba0', '#279cce', '#5cd5f5'][cell.level]!;
    if (ctx.media.theme === 'night-green')
      return ['#10231c', '#1d6339', '#2e9350', '#55c46d', '#a9e58c'][cell.level]!;
    if (ctx.media.theme === 'halloween')
      return ['#eee8db', '#ecbf65', '#e89936', '#df6b26', '#b84420'][cell.level]!;
    return native[cell.level]!;
  };
  const total =
    formatNumber(grid.total, ctx.media.locale, { 'number-format': 'long' }) + ' ' + unit;
  let base = `<rect width="${width}" height="${height}" fill="${theme.background}"/>`;
  base += ctx.text(params.subject, 32, 41, {
    size: 23,
    weight: 600,
    fill: theme.text,
    maxWidth: 700,
  });
  base += ctx.text(title + ' · ' + params.source.toUpperCase(), 32, 66, {
    size: 12,
    fill: theme.muted,
  });
  base += ctx.text(activity.from + ' — ' + activity.to, width - 32, 41, {
    size: 13,
    fill: theme.muted,
    anchor: 'end',
  });
  base += ctx.text(total, 32, height - 43, { size: 25, weight: 600, fill: theme.accent });
  base += ctx.text(
    zh ? grid.activeDays + ' 个活跃日' : grid.activeDays + ' active days',
    32,
    height - 18,
    { size: 12, fill: theme.muted },
  );
  const names = metricNames[ctx.media.locale]!;
  if (dashboard && details) {
    const axes = [
      'commits',
      'issues',
      'pull-requests',
      'reviews',
      'repositories-contributed',
    ].flatMap((id) => {
      const metric = details.stats.metrics.find((metric) => metric.id === id);
      return metric?.value !== null && metric?.value !== undefined
        ? [{ name: names[id]!, value: metric.value }]
        : [];
    });
    base += radarChart(
      axes,
      ctx.text,
      theme,
      1000,
      235,
      108,
      params.animate && ctx.media.format === 'svg',
    );
    const rows = details.languages.languages.slice(0, 5).map((row) => ({ ...row }));
    const rest = details.languages.languages.slice(5).reduce((sum, row) => sum + row.value, 0);
    if (rest)
      rows.push({ name: zh ? '其他语言' : 'Other languages', value: rest, color: '#9198a1' });
    base += ctx.text(zh ? '语言分布' : 'Languages', 72, 518, {
      size: 15,
      weight: 600,
      fill: theme.text,
    });
    base += ringChart(rows, 167, 632, 83, 29);
    const sum = rows.reduce((n, row) => n + row.value, 0);
    base += ctx.text(formatNumber(sum, ctx.media.locale), 167, 638, {
      size: 24,
      weight: 600,
      fill: theme.text,
      anchor: 'middle',
    });
    base += ctx.text(
      details.languages.unit === 'bytes'
        ? zh
          ? '代码字节'
          : 'Code bytes'
        : zh
          ? '仓库数'
          : 'Repositories',
      167,
      660,
      { size: 11, fill: theme.muted, anchor: 'middle' },
    );
    rows.forEach((row, i) => {
      const y = 557 + i * 28;
      base +=
        `<circle cx="285" cy="${y - 4}" r="4" fill="${row.color}"/>` +
        ctx.text(row.name, 299, y, { size: 13, fill: theme.text, maxWidth: 130 }) +
        ctx.text(
          new Intl.NumberFormat(ctx.media.locale, {
            style: 'percent',
            maximumFractionDigits: 1,
          }).format(row.value / Math.max(1, sum)),
          470,
          y,
          { size: 12, fill: theme.muted, anchor: 'end' },
        );
    });
    for (const [i, id] of ['stars', 'forks'].entries()) {
      const metric = details.stats.metrics.find((metric) => metric.id === id);
      const x = 895 + i * 180;
      base += ctx.text(formatNumber(metric?.value ?? null, ctx.media.locale), x, height - 40, {
        size: 25,
        weight: 600,
        fill: theme.text,
      });
      base +=
        metricIconSmall(id, x - 28, height - 58, theme.accent) +
        ctx.text(names[id]!, x, height - 17, { size: 12, fill: theme.muted });
    }
  }
  const ordered = [...grid.cells].sort(
    (a, b) => project(a.column, a.row).y - project(b.column, b.row).y,
  );
  const floors = ordered
    .map((cell) => {
      const p = project(cell.column, cell.row);
      return `<g transform="translate(${p.x} ${p.y})">${poly(footprint, native[0]!)}</g>`;
    })
    .join('');
  const towers = (time: number, css: boolean) =>
    ordered
      .map((cell) => {
        if (!cell.value && !blocks) return '';
        const p = project(cell.column, cell.row),
          h = towerHeight(cell.value, maximum, blocks),
          upper = footprint.map(([x, y]) => [x, y - h] as const),
          fill = color(cell);
        const right = [footprint[1]!, footprint[2]!, upper[2]!, upper[1]!],
          left = [footprint[2]!, footprint[3]!, upper[3]!, upper[2]!];
        let shape =
          poly(right, fill) +
          poly(right, '#000', ' opacity=".25"') +
          poly(left, fill) +
          poly(left, '#000', ' opacity=".10"') +
          poly(upper, fill);
        if (blocks) {
          for (let y = 10; y < h; y += 10)
            shape += `<path d="M-14 ${7 - y}l14 7 14-7" fill="none" stroke="#000" stroke-opacity=".18" stroke-width=".6"/>`;
          for (const [x, y] of [
            [0, 3.6],
            [-6.7, 7],
            [6.7, 7],
            [0, 10.4],
          ])
            shape += `<ellipse cx="${x}" cy="${y! - h + 0.8}" rx="3.1" ry="1.6" fill="#000" opacity=".3"/><ellipse cx="${x}" cy="${y! - h - 0.4}" rx="3.1" ry="1.6" fill="${fill}" stroke="#fff" stroke-opacity=".45" stroke-width=".7"/>`;
        } else if (night) {
          for (let y = 10; y < h - 3; y += 9)
            for (const x of [-9, -4, 4, 9])
              if ((cell.column + cell.row + Math.floor(y / 9) + x) % 3)
                shape += `<path d="M${x} ${8 - y}l2 ${x < 0 ? 1 : -1}v3l-2 ${x < 0 ? -1 : 1}Z" fill="${ctx.media.theme === 'night-view' ? '#ffd66c' : '#e5ffd1'}" opacity=".8"/>`;
        }
        const phase = (time / 8000 + (cell.column / grid.columns) * 0.075) % 1,
          growth =
            phase < 0.2
              ? 0.05 + (phase / 0.2) * 0.95
              : phase < 0.8
                ? 1
                : 1 - ((phase - 0.8) / 0.2) * 0.95;
        const transform = css
          ? ` class="tower-${cell.column}"`
          : ` transform="scale(1 ${params.animate ? growth : 1})"`;
        return `<g transform="translate(${p.x} ${p.y})"><title>${escapeXml(cell.date + ': ' + cell.value + ' ' + unit)}</title><g${transform}>${shape}</g></g>`;
      })
      .join('');
  // Month labels follow the projection, with enough room for both English and Chinese glyphs.
  let last = -Infinity;
  const months = grid.cells
    .filter((cell) => cell.date.endsWith('-01'))
    .map((cell) => {
      const p = project(cell.column, 8),
        label = new Intl.DateTimeFormat(ctx.media.locale, {
          month: 'short',
          timeZone: 'UTC',
        }).format(new Date(cell.date + 'T00:00:00Z'));
      if (p.x - last < 40) return '';
      last = p.x;
      return ctx.text(label, p.x, p.y + 14, { size: 10, fill: theme.muted, anchor: 'middle' });
    })
    .join('');
  const styles =
    '@keyframes grow{0%,100%{transform:scaleY(.05)}20%,80%{transform:scaleY(1)}}' +
    Array.from(
      { length: grid.columns },
      (_, i) =>
        `.tower-${i}{animation:grow 8s linear -${(i / grid.columns) * 0.6}s infinite;transform-origin:0 0}`,
    ).join('') +
    '@media(prefers-reduced-motion:reduce){g[class]{animation:none}}';
  const svg = (time: number, css: boolean) =>
    svgDocument(
      width,
      height,
      (css ? '<style>' + styles + '</style>' : '') + base + floors + towers(time, css) + months,
      {
        title: params.subject + ' · ' + title,
        description: total + ', ' + activity.from + ' ~ ' + activity.to,
      },
    );
  const graphic = svg(0, params.animate);
  return params.animate
    ? {
        ...graphic,
        animation: { durationMs: 8000, fps: 20, frame: (time: number) => svg(time, false).svg },
      }
    : graphic;
}
function metricIconSmall(id: string, x: number, y: number, color: string) {
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.7">${id === 'stars' ? '<path d="m9 0 3 6 6 1-4.5 4.5L15 18l-6-3-6 3 1.5-6.5L0 7l6-1Z"/>' : '<path d="M3 2v5l6 4 6-4V2M9 11v7"/><circle cx="3" cy="2" r="2"/><circle cx="15" cy="2" r="2"/><circle cx="9" cy="18" r="2"/>'}</g>`;
}
