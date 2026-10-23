import type { RenderContext } from '@cool-profile/card-kit';
import type { Activity } from '@cool-profile/data/types';
import {
  activityGrid,
  activityLabel,
  calendarPalette,
  cardTheme,
  svgDocument,
} from '@cool-profile/graphics';
import { planBattle, battleFrame, randomGenerator } from './battle.js';
import type { Strategy } from './battle.js';

export function drawShooter(
  ctx: RenderContext,
  activity: Activity,
  params: {
    source: 'github' | 'cnb';
    subject: string;
    strategy: Strategy;
    fps: number;
    duration: number;
  },
) {
  const grid = activityGrid(activity);
  const unit = 15;
  const width = Math.max(620, grid.columns * unit + 50);
  const height = 276;
  const originX = (width - grid.columns * unit) / 2;
  const shipY = 216;
  const durationMs = params.duration * 1000;
  const battle = planBattle(grid.cells, grid.columns, params.strategy, ctx.media.seed, durationMs);
  const targets = new Map(
    grid.cells.map((cell) => [
      cell.date,
      battle.shots.filter((shot) => shot.cell.date === cell.date),
    ]),
  );
  const arcade = ctx.media.theme === 'arcade';
  const night = ctx.media.theme !== 'default';
  const nativeTheme = cardTheme(params.source, night ? 'dark' : 'default');
  const theme = arcade
    ? { ...nativeTheme, background: '#15102b', accent: '#49e0bd', muted: '#b6a6cd' }
    : nativeTheme;
  const palette = arcade
    ? ['#26203d', '#648cff', '#cd6af5', '#f7bb59', '#49e0bd']
    : calendarPalette(params.source, night);
  const chinese = ctx.media.locale === 'zh-CN';
  const title = chinese ? '太空射击' : 'Space shooter';
  const label = activityLabel(activity.metric, ctx.media.locale);
  const number = new Intl.NumberFormat(ctx.media.locale, { maximumFractionDigits: 1 });
  const staticParts =
    '<rect width="' +
    width +
    '" height="' +
    height +
    '" rx="16" fill="' +
    theme.background +
    '"/>' +
    ctx.text(params.subject + ' · ' + title, 25, 31, {
      size: 17,
      weight: 600,
      fill: theme.text,
      maxWidth: width - 320,
    }) +
    ctx.text(
      params.source.toUpperCase() + ' / ' + number.format(grid.total) + ' ' + label,
      width - 25,
      31,
      { size: 12, fill: theme.muted, anchor: 'end', maxWidth: 270 },
    ) +
    ctx.text(activity.from + ' ~ ' + activity.to, 25, 261, { size: 10, fill: theme.muted }) +
    grid.cells
      .map(
        (cell) =>
          '<rect x="' +
          (originX + cell.column * unit) +
          '" y="' +
          (65 + cell.row * unit) +
          '" width="11" height="11" rx="2" fill="' +
          palette[0] +
          '" opacity=".65"/>',
      )
      .join('');
  const random = randomGenerator(ctx.media.seed ^ 0x9e3779b9);
  const stars = Array.from({ length: 40 }, () => ({
    x: 20 + random() * (width - 40),
    y: 48 + random() * 180,
    r: random() < 0.8 ? 0.6 : 1.1,
    phase: random() * Math.PI * 2,
  }));
  const description = {
    title: params.subject + ' · ' + title,
    description:
      number.format(grid.total) + ' ' + label + ', ' + activity.from + ' ~ ' + activity.to,
  };
  const counters = new Map<number, string>();
  const frame = (time: number) => {
    const state = battleFrame(battle, time);
    const sky = night
      ? stars
          .map(
            (star) =>
              '<circle cx="' +
              star.x +
              '" cy="' +
              star.y +
              '" r="' +
              star.r +
              '" fill="' +
              theme.text +
              '" opacity="' +
              (0.14 + 0.1 * Math.sin((time / durationMs) * Math.PI * 8 + star.phase)) +
              '"/>',
          )
          .join('')
      : '';
    const enemies = grid.cells
      .filter((cell) => cell.value > 0 && targets.get(cell.date)!.at(-1)!.hit > time)
      .map((cell) => {
        const x = originX + cell.column * unit;
        const y = 65 + cell.row * unit;
        const damage = targets.get(cell.date)!.filter((shot) => shot.hit <= time).length;
        const fill = palette[Math.max(1, cell.level - damage)]!;
        const silhouette = arcade
          ? '<path d="M2 0h2v2h3V0h2v2h2v6H9V6H2v2H0V2h2z" fill="' + fill + '"/>'
          : '<rect width="11" height="10" rx="3" fill="' + fill + '"/>';
        return (
          '<g transform="translate(' +
          x +
          ' ' +
          y +
          ')">' +
          silhouette +
          '<path d="M3 4h1v2H3z M7 4h1v2H7z" fill="' +
          (night ? '#ffffff' : '#253347') +
          '"/></g>'
        );
      })
      .join('');
    let effects = '';
    if (state.shot && state.bullet !== undefined) {
      const x = originX + state.shot.cell.column * unit + 5.5;
      const y = shipY - 12 + (65 + state.shot.cell.row * unit + 5 - shipY + 12) * state.bullet;
      effects +=
        '<rect x="' +
        (x - 1) +
        '" y="' +
        (y - 4) +
        '" width="2" height="9" rx="1" fill="' +
        theme.accent +
        '"/>';
    }
    if (state.shot && state.explosion !== undefined) {
      const cx = originX + state.shot.cell.column * unit + 5.5;
      const cy = 70 + state.shot.cell.row * unit;
      const progress = state.explosion;
      for (let part = 0; part < (state.shot.remainingHealth === 0 ? 12 : 4); part++) {
        const angle = (part * Math.PI * 2) / (state.shot.remainingHealth === 0 ? 12 : 4);
        const radius = 3 + progress * (state.shot.remainingHealth === 0 ? 16 : 5);
        effects +=
          '<circle cx="' +
          (cx + Math.cos(angle) * radius) +
          '" cy="' +
          (cy + Math.sin(angle) * radius) +
          '" r="' +
          (2 - progress * 1.5) +
          '" opacity="' +
          (1 - progress) +
          '" fill="' +
          palette[state.shot.cell.level] +
          '"/>';
      }
    }
    const center = originX + state.column * unit + 5.5;
    const flame = 6 + 2 * Math.sin((time / durationMs) * Math.PI * 32);
    const ship =
      '<g transform="translate(' +
      center +
      ' ' +
      shipY +
      ')"><path d="M-3 7L0 ' +
      (7 + flame) +
      'l3-' +
      flame +
      'z" fill="#ff9e42"/><path d="M-2-14h4v10l4 5v-5h3v8l5 6v3H5L0 9l-5 4h-9v-3l5-6v-8h3v5l4-5z" fill="' +
      theme.accent +
      '"/><path d="M0-5l-2 7h4z" fill="' +
      theme.background +
      '"/></g>';
    let counter = counters.get(state.cleared);
    if (!counter) {
      const message = chinese
        ? '已清除 ' +
          state.cleared +
          ' / ' +
          grid.activeDays +
          ' · ' +
          number.format(state.collected) +
          ' ' +
          label
        : state.cleared +
          ' / ' +
          grid.activeDays +
          ' cleared · ' +
          number.format(state.collected) +
          ' ' +
          label;
      counter = ctx.text(message, width - 25, 261, {
        size: 10,
        fill: theme.muted,
        anchor: 'end',
        maxWidth: width - 260,
      });
      counters.set(state.cleared, counter);
    }
    const progress = grid.activeDays ? state.cleared / grid.activeDays : 0;
    const bar =
      '<rect x="25" y="240" width="' +
      (width - 50) +
      '" height="3" rx="1.5" fill="' +
      palette[0] +
      '"/><rect x="25" y="240" width="' +
      (width - 50) * progress +
      '" height="3" rx="1.5" fill="' +
      theme.accent +
      '"/>';
    return svgDocument(
      width,
      height,
      staticParts + sky + enemies + effects + ship + bar + counter,
      description,
    ).svg;
  };
  return { width, height, svg: frame(0), animation: { durationMs, fps: params.fps, frame } };
}
