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
import { planSnake } from './route.js';

export function drawSnake(
  ctx: RenderContext,
  activity: Activity,
  params: {
    source: 'github' | 'cnb';
    subject: string;
    fps: number;
    duration: number;
    colors?: string[] | undefined;
    'snake-color'?: string | undefined;
    'background-color'?: string | undefined;
  },
) {
  const grid = activityGrid(activity);
  const unit = 14;
  const width = Math.max(620, (grid.columns + 2) * unit + 32);
  const height = 242;
  const boardWidth = Math.floor((width - 32) / unit);
  const route = planSnake(
    boardWidth,
    grid.cells
      .filter((cell) => cell.value > 0)
      .map((cell) => ({ x: cell.column + 1, y: cell.row + 1 })),
  );
  const lastStep = route.poses.length - 1;
  const durationMs = params.duration * 1000;
  const theme = cardTheme(params.source, ctx.media.theme);
  if (params['snake-color']) theme.accent = params['snake-color'];
  else if (ctx.media.theme === 'ocean') theme.accent = '#0575a3';
  else if (ctx.media.theme === 'grey') theme.accent = '#444444';
  if (params['background-color']) theme.background = params['background-color'];
  const palette =
    params.colors ??
    (ctx.media.theme === 'ocean'
      ? ['#edf7fc', '#b5e7f3', '#76cadd', '#319cbc', '#126883']
      : ctx.media.theme === 'grey'
        ? ['#eeeeee', '#cccccc', '#999999', '#666666', '#333333']
        : calendarPalette(params.source, ctx.media.theme === 'dark'));
  const chinese = ctx.media.locale === 'zh-CN';
  const title = chinese ? '贪吃蛇' : 'Activity snake';
  const number = new Intl.NumberFormat(ctx.media.locale, { maximumFractionDigits: 1 });
  const total = number.format(grid.total) + ' ' + activityLabel(activity.metric, ctx.media.locale);
  const cellKey = (column: number, row: number) => column + 1 + ',' + (row + 1);
  const color = (column: number, level: number) =>
    ctx.media.theme === 'rainbow' && level > 0
      ? 'hsl(' + Math.round((column / Math.max(1, grid.columns - 1)) * 300) + ' 68% 52%)'
      : palette[level]!;
  const percent = (step: number) => Number(((step / lastStep) * 90).toFixed(4));
  const xy = (x: number, y: number) => 16 + x * unit + 'px,' + (55 + y * unit) + 'px';
  const shell = [
    '<rect width="' + width + '" height="' + height + '" rx="16" fill="' + theme.background + '"/>',
    ctx.text(params.subject + ' · ' + title, 25, 31, {
      size: 16,
      weight: 600,
      fill: theme.text,
      maxWidth: width - 320,
    }),
    ctx.text(params.source.toUpperCase() + ' / ' + total, width - 25, 31, {
      size: 12,
      fill: theme.muted,
      anchor: 'end',
      maxWidth: 270,
    }),
    ctx.text(activity.from + ' ~ ' + activity.to, 25, 225, { size: 10, fill: theme.muted }),
    ctx.text(
      chinese ? grid.activeDays + ' 个活跃日' : grid.activeDays + ' active days',
      width - 25,
      225,
      { size: 10, fill: theme.muted, anchor: 'end' },
    ),
  ].join('');
  const backgroundBar =
    '<rect x="25" y="201" width="' +
    (width - 50) +
    '" height="4" rx="2" fill="' +
    palette[0] +
    '"/>';
  const body = (step: number, animated: boolean): string => {
    const index = Math.min(lastStep, Math.floor(step));
    const fraction = step - index;
    const cells = grid.cells
      .map((cell, item) => {
        const eaten = route.eatenAt.get(cellKey(cell.column, cell.row));
        const fill =
          eaten !== undefined && eaten <= index ? palette[0]! : color(cell.column, cell.level);
        return (
          '<rect x="' +
          (16 + (cell.column + 1) * unit) +
          '" y="' +
          (55 + (cell.row + 1) * unit) +
          '" width="11" height="11" rx="2" fill="' +
          fill +
          '"' +
          (animated && eaten !== undefined ? ' class="food-' + item + '"' : '') +
          '/>'
        );
      })
      .join('');
    const segments = [...route.poses[index]!]
      .reverse()
      .map((point, reverseIndex) => {
        const part = 4 - reverseIndex;
        const next = route.poses[Math.min(lastStep, index + 1)]![part]!;
        const x = point.x + (next.x - point.x) * fraction;
        const y = point.y + (next.y - point.y) * fraction;
        const fill = theme.accent;
        return (
          '<g' +
          (animated ? ' class="segment-' + part + '"' : '') +
          ' transform="translate(' +
          (16 + x * unit) +
          ' ' +
          (55 + y * unit) +
          ')"><rect width="11" height="11" rx="4" fill="' +
          fill +
          '" opacity="' +
          (1 - part * 0.12) +
          '"/>' +
          (part === 0
            ? '<circle cx="7.5" cy="3.5" r="1.2" fill="' + theme.background + '"/>'
            : '') +
          '</g>'
        );
      })
      .join('');
    const count = [...route.eatenAt.values()].filter((eaten) => eaten <= index).length;
    const progress = grid.activeDays ? count / grid.activeDays : 0;
    return (
      cells +
      segments +
      backgroundBar +
      '<rect x="25" y="201" width="' +
      progress * (width - 50) +
      '" height="4" rx="2" fill="' +
      theme.accent +
      '"' +
      (animated ? ' class="progress"' : '') +
      '/>'
    );
  };
  const styles: string[] = [];
  for (let part = 0; part < 5; part++) {
    styles.push(
      '@keyframes snake-' +
        part +
        '{' +
        route.poses
          .map(
            (pose, index) =>
              percent(index) + '%{transform:translate(' + xy(pose[part]!.x, pose[part]!.y) + ')}',
          )
          .join('') +
        '100%{transform:translate(' +
        xy(route.poses.at(-1)![part]!.x, route.poses.at(-1)![part]!.y) +
        ')}}',
      '.segment-' +
        part +
        '{animation:snake-' +
        part +
        ' ' +
        params.duration +
        's linear infinite}',
    );
  }
  grid.cells.forEach((cell, index) => {
    const eaten = route.eatenAt.get(cellKey(cell.column, cell.row));
    if (eaten === undefined) return;
    styles.push(
      '@keyframes food-' +
        index +
        '{0%{fill:' +
        color(cell.column, cell.level) +
        '}' +
        percent(eaten) +
        '%,100%{fill:' +
        palette[0] +
        '}}',
      '.food-' +
        index +
        '{animation:food-' +
        index +
        ' ' +
        params.duration +
        's steps(1,end) infinite}',
    );
  });
  let consumed = 0;
  const progress = [...route.eatenAt.values()]
    .sort((a, b) => a - b)
    .map(
      (step) => percent(step) + '%{width:' + (++consumed / grid.activeDays) * (width - 50) + 'px}',
    )
    .join('');
  styles.push(
    '@keyframes progress{0%{width:0}' +
      progress +
      '100%{width:' +
      (grid.activeDays ? width - 50 : 0) +
      'px}}',
    '.progress{animation:progress ' + params.duration + 's steps(1,end) infinite}',
    '@media(prefers-reduced-motion:reduce){g[class],rect[class]{animation:none}}',
  );
  const description = {
    title: params.subject + ' · ' + title,
    description: total + ', ' + activity.from + ' ~ ' + activity.to,
  };
  const graphic = svgDocument(
    width,
    height,
    '<style>' + escapeXml(styles.join('')) + '</style>' + shell + body(0, true),
    description,
  );
  return {
    ...graphic,
    animation: {
      durationMs,
      fps: params.fps,
      frame(timeMs: number) {
        const step = Math.min(1, Math.max(0, timeMs / (durationMs * 0.9))) * lastStep;
        return svgDocument(width, height, shell + body(step, false), description).svg;
      },
    },
  };
}
