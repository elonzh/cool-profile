import palettes from '../assets/themes.json' with { type: 'json' };
import { cardTheme } from './theme.js';
import type { TextRenderer } from './types.js';

export const profileThemes = [
  'default',
  'dark',
  ...Object.keys(palettes).filter((key) => key !== 'default' && key !== 'dark'),
];
export interface Appearance {
  title?: string | undefined;
  width?: number | undefined;
  'hide-title'?: boolean | undefined;
  'hide-border'?: boolean | undefined;
  'border-radius'?: number | undefined;
  'title-color'?: string | undefined;
  'text-color'?: string | undefined;
  'icon-color'?: string | undefined;
  'background-color'?: string | undefined;
  'border-color'?: string | undefined;
  'number-format'?: 'short' | 'long' | undefined;
  'number-precision'?: number | undefined;
  'line-height'?: number | undefined;
  'show-icons'?: boolean | undefined;
  'text-bold'?: boolean | undefined;
  animate?: boolean | undefined;
}
export function profileTheme(source: 'github' | 'cnb', name: string, options: Appearance = {}) {
  const base = cardTheme(source, name);
  // Keep the badge green for artwork; text and functional icons need a readable light-mode ink.
  if (source === 'cnb' && name === 'default') base.accent = '#007a52';
  const palette =
    Object.hasOwn(palettes, name) && !['default', 'dark'].includes(name)
      ? palettes[name as keyof typeof palettes]
      : undefined;
  const background =
    options['background-color'] ??
    (palette ? palette.bg_color.split(',').at(-1)!.replace(/^#?/, '#') : base.background);
  return {
    ...base,
    background,
    text: options['text-color'] ?? (palette ? '#' + palette.text_color : base.text),
    muted: options['text-color'] ?? (palette ? '#' + palette.text_color : base.muted),
    accent: options['title-color'] ?? (palette ? '#' + palette.title_color : base.accent),
    icon: options['icon-color'] ?? (palette ? '#' + palette.icon_color : base.accent),
    border:
      options['border-color'] ??
      (palette && 'border_color' in palette ? '#' + palette.border_color : base.border),
    gradient:
      !options['background-color'] && palette?.bg_color.includes(',')
        ? palette.bg_color
        : undefined,
  };
}
export type ProfileTheme = ReturnType<typeof profileTheme>;
export function surface(width: number, height: number, theme: ProfileTheme, options: Appearance) {
  let definitions = '';
  let fill = theme.background;
  if (theme.gradient) {
    const [angle, ...stops] = theme.gradient.split(',');
    const radians = (Number(angle) * Math.PI) / 180;
    const dx = Math.cos(radians) * 50,
      dy = Math.sin(radians) * 50;
    definitions = `<defs><linearGradient id="surface" x1="${50 - dx}%" y1="${50 - dy}%" x2="${50 + dx}%" y2="${50 + dy}%">${stops.map((color, i) => `<stop offset="${i / Math.max(1, stops.length - 1)}" stop-color="#${color}"/>`).join('')}</linearGradient></defs>`;
    fill = 'url(#surface)';
  }
  return (
    definitions +
    `<rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="${options['border-radius'] ?? 6}" fill="${fill}" stroke="${options['hide-border'] ? 'none' : theme.border}"/>`
  );
}
export function formatNumber(value: number | null, locale: string, options: Appearance = {}) {
  return value === null
    ? '—'
    : new Intl.NumberFormat(locale, {
        notation: options['number-format'] === 'long' ? 'standard' : 'compact',
        maximumFractionDigits: options['number-precision'] ?? 1,
      }).format(value);
}
const icons: Record<string, string> = {
  stars: 'm8 1.5 2 4.2 4.6.6-3.3 3.2.8 4.6L8 12l-4.1 2.1.8-4.6L1.4 6.3l4.6-.6Z',
  commits: 'M5 8H1m14 0h-4M11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  'pull-requests':
    'M4 4v8m8 0V7a3 3 0 0 0-3-3H8m2-2L8 4l2 2M6 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm0 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  issues: 'M8 4v4m0 3v.1M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z',
  followers:
    'M2 15v-2a4 4 0 0 1 8 0v2m1-12a3 3 0 0 1 0 6m4 6v-2a4 4 0 0 0-3-3M9 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  forks:
    'M4 4v2a4 4 0 0 0 4 4m4-6v2a4 4 0 0 1-4 4v3M6 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM10 14a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  repository: 'M3 1h10v14H3a2 2 0 0 1 0-4h10M3 1a2 2 0 0 0-2 2v10m4-9h5',
  reviews: 'M2 1h12v10H7l-5 4Zm3 5 2 2 4-4',
};
export function metricIcon(id: string, x: number, y: number, color: string) {
  const path = icons[id] ?? icons[id === 'open-items' ? 'issues' : 'repository'];
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></g>`;
}
export function entrance(content: string, animate?: boolean) {
  return animate
    ? `<style>@keyframes enter{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}.card-body{animation:enter .65s ease both}@media(prefers-reduced-motion:reduce){.card-body{animation:none}}</style><g class="card-body">${content}</g>`
    : content;
}
export function heading(
  text: TextRenderer,
  title: string,
  theme: ProfileTheme,
  width: number,
  options: Appearance,
) {
  return options['hide-title']
    ? ''
    : text(options.title ?? title, 26, 37, {
        size: 18,
        weight: 600,
        fill: theme.accent,
        maxWidth: width - 52,
      });
}
