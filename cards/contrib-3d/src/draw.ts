import type { RenderContext } from '@cool-profile/card-kit';
import type { Activity } from '@cool-profile/data/types';
import {
  activityGrid,
  activityLabel,
  calendarPalette,
  cardTheme,
  escapeXml,
  svgDocument,
} from '@cool-profile/graphics';
import type { CalendarCell } from '@cool-profile/graphics';

type Point = readonly [number, number];
const footprint: readonly Point[] = [
  [0, 0],
  [9.6, 2.4],
  [1.6, 8.8],
  [-8, 6.4],
];
const points = (vertices: readonly Point[]) =>
  vertices.map(([x, y]) => x.toFixed(2) + ',' + y.toFixed(2)).join(' ');
const polygon = (vertices: readonly Point[], fill: string, extra = '') =>
  '<polygon points="' + points(vertices) + '" fill="' + fill + '"' + extra + '/>';

export function towerHeight(value: number, maximum: number, blocks: boolean): number {
  if (!value) return 0;
  const ratio = Math.log1p(value) / Math.log1p(maximum);
  return blocks ? 6 + Math.ceil(ratio * 6) * 10 : 5 + ratio * 70;
}

export function drawCity(
  ctx: RenderContext,
  activity: Activity,
  params: {
    source: 'github' | 'cnb';
    subject: string;
    animate: boolean;
  },
) {
  const grid = activityGrid(activity);
  const width = Math.max(620, grid.columns * 12 + 150);
  const height = 155 + grid.columns * 3 + 56 + 44;
  const originX = (width - grid.columns * 12 - 70) / 2 + 70;
  const project = (column: number, row: number) => ({
    x: originX + column * 12 - row * 10,
    y: 150 + column * 3 + row * 8,
  });
  const night = ['dark', 'rainbow'].includes(ctx.media.theme);
  const theme = cardTheme(params.source, night ? 'dark' : 'default');
  const native = calendarPalette(params.source, night);
  const blocks = ctx.media.theme === 'blocks';
  const chinese = ctx.media.locale === 'zh-CN';
  const title = chinese ? '3D 活跃日历' : '3D activity calendar';
  const unit = activityLabel(activity.metric, ctx.media.locale);
  const total =
    new Intl.NumberFormat(ctx.media.locale, { maximumFractionDigits: 1 }).format(grid.total) +
    ' ' +
    unit;
  const maximum = Math.max(0, ...grid.cells.map((cell) => cell.value));
  const color = (cell: CalendarCell): string => {
    if (!cell.level) return native[0]!;
    if (ctx.media.theme === 'blocks')
      return ['#eeeeee', '#2c84d6', '#e2bf25', '#e25744', '#40a876'][cell.level]!;
    if (ctx.media.theme === 'rainbow')
      return (
        'hsl(' +
        Math.round((cell.column / Math.max(1, grid.columns - 1)) * 300) +
        ' 72% ' +
        (78 - cell.level * 9) +
        '%)'
      );
    if (ctx.media.theme === 'season') {
      const month = Number(cell.date.slice(5, 7));
      const season = Math.floor((month % 12) / 3);
      return [
        ['#f0f5fa', '#dae8f2', '#a5c8de', '#7ba6c1', '#4b819e'],
        ['#f1f5ee', '#d3e8ba', '#96cd85', '#56ae70', '#238759'],
        ['#f0f7f2', '#b5e6cc', '#72caa2', '#3ca77c', '#167855'],
        ['#f7f0e4', '#f9db9a', '#eaae60', '#d67d42', '#a64b2a'],
      ][season]![cell.level]!;
    }
    return native[cell.level]!;
  };
  const ordered = [...grid.cells].sort(
    (left, right) => project(left.column, left.row).y - project(right.column, right.row).y,
  );
  const base =
    '<rect width="' +
    width +
    '" height="' +
    height +
    '" rx="18" fill="' +
    theme.background +
    '"/>' +
    ctx.text(params.subject + ' · ' + title, 28, 32, {
      size: 17,
      weight: 600,
      fill: theme.text,
      maxWidth: width - 330,
    }) +
    ctx.text(params.source.toUpperCase() + ' / ' + total, width - 28, 32, {
      size: 12,
      fill: theme.muted,
      maxWidth: 275,
      anchor: 'end',
    }) +
    ctx.text(activity.from + ' ~ ' + activity.to, 28, height - 18, {
      size: 10,
      fill: theme.muted,
    }) +
    ctx.text(
      chinese ? grid.activeDays + ' 个活跃日' : grid.activeDays + ' active days',
      width - 28,
      height - 18,
      { size: 10, fill: theme.muted, anchor: 'end' },
    );
  const floors = ordered
    .map((cell) => {
      const position = project(cell.column, cell.row);
      return (
        '<g transform="translate(' +
        position.x +
        ' ' +
        position.y +
        ')">' +
        polygon(footprint, native[0]!) +
        '</g>'
      );
    })
    .join('');
  const monthCells = grid.cells.filter((cell, index) => index === 0 || cell.date.endsWith('-01'));
  const monthLabel = (cell: CalendarCell) =>
    new Intl.DateTimeFormat(ctx.media.locale, { month: 'short', timeZone: 'UTC' }).format(
      new Date(cell.date + 'T00:00:00Z'),
    );
  if (monthCells.length > 1) {
    const first = monthCells[0]!;
    const next = monthCells[1]!;
    const gap = (next.column - first.column) * 12;
    const minimum =
      (ctx.text.measure(monthLabel(first), { size: 9 }) +
        ctx.text.measure(monthLabel(next), { size: 9 })) /
        2 +
      6;
    if (gap < minimum) monthCells.shift();
  }
  const months = monthCells
    .map((cell) => {
      const position = project(cell.column, 8);
      const label = monthLabel(cell);
      return ctx.text(label, position.x, position.y + 10, {
        size: 9,
        fill: theme.muted,
        anchor: 'middle',
      });
    })
    .join('');
  const growth = (time: number, column: number) => {
    const phase = (time / 8000 + (column / Math.max(1, grid.columns)) * 0.075) % 1;
    return phase < 0.2
      ? 0.05 + (phase / 0.2) * 0.95
      : phase < 0.8
        ? 1
        : 1 - ((phase - 0.8) / 0.2) * 0.95;
  };
  const towers = (time: number, animated: boolean) =>
    ordered
      .filter((cell) => cell.value > 0)
      .map((cell) => {
        const position = project(cell.column, cell.row);
        const h = towerHeight(cell.value, maximum, blocks);
        const upper = footprint.map(([x, y]) => [x, y - h] as const);
        const right = [footprint[1]!, footprint[2]!, upper[2]!, upper[1]!];
        const left = [footprint[2]!, footprint[3]!, upper[3]!, upper[2]!];
        const fill = color(cell);
        const sides =
          polygon(right, fill) +
          polygon(right, '#000000', ' opacity=".28"') +
          polygon(left, fill) +
          polygon(left, '#000000', ' opacity=".12"');
        const roof = polygon(upper, fill);
        let detail = '';
        if (blocks)
          detail = [-2, 3]
            .map(
              (x) =>
                '<ellipse cx="' +
                x +
                '" cy="' +
                (4 - h + x * 0.25) +
                '" rx="2.3" ry="1.2" fill="' +
                fill +
                '" stroke="#ffffff" stroke-opacity=".45" stroke-width=".6"/>',
            )
            .join('');
        else if (night) {
          for (let y = 10; y < h - 2; y += 9)
            detail +=
              '<path d="M-5 ' +
              (6 - y) +
              'l2 .5v2l-2-.5z M4 ' +
              (6 - y) +
              'l2-1.6v2l-2 1.6z" fill="#ffe5a1" opacity=".8"/>';
        }
        const transform = animated
          ? ' class="tower-' + cell.column + '"'
          : ' transform="scale(1 ' + (params.animate ? growth(time, cell.column) : 1) + ')"';
        return (
          '<g transform="translate(' +
          position.x +
          ' ' +
          position.y +
          ')"><title>' +
          escapeXml(cell.date + ': ' + cell.value + ' ' + unit) +
          '</title><g' +
          transform +
          '>' +
          sides +
          roof +
          detail +
          '</g></g>'
        );
      })
      .join('');
  const styles =
    '@keyframes grow{0%,100%{transform:scaleY(.05)}20%,80%{transform:scaleY(1)}}' +
    Array.from(
      { length: grid.columns },
      (_, column) =>
        '.tower-' +
        column +
        '{animation:grow 8s linear -' +
        ((column / Math.max(1, grid.columns)) * 0.6).toFixed(4) +
        's infinite;transform-origin:0 0}',
    ).join('') +
    '@media(prefers-reduced-motion:reduce){g[class]{animation:none}}';
  const description = {
    title: params.subject + ' · ' + title,
    description: total + ', ' + activity.from + ' ~ ' + activity.to,
  };
  const svg = (time: number, animated: boolean) =>
    svgDocument(
      width,
      height,
      (animated ? '<style>' + styles + '</style>' : '') +
        base +
        floors +
        towers(time, animated) +
        months,
      description,
    );
  const graphic = svg(0, params.animate);
  return params.animate
    ? {
        ...graphic,
        animation: { durationMs: 8000, fps: 20, frame: (time: number) => svg(time, false).svg },
      }
    : graphic;
}
