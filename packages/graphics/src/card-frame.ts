import type { TextRenderer } from './types.js';
import { cardTheme } from './theme.js';

export function cardFrame(
  source: 'github' | 'cnb',
  themeName: string,
  height: number,
  text: TextRenderer,
  title: string,
  name: string,
) {
  const theme = cardTheme(source, themeName);
  return {
    theme,
    content: [
      `<rect x=".5" y=".5" width="619" height="${height - 1}" rx="20" fill="${theme.background}" stroke="${theme.border}"/>`,
      `<rect x="28" y="29" width="4" height="36" rx="2" fill="${theme.accent}"/>`,
      text(source.toUpperCase() + ' / ' + title, 44, 37, {
        size: 12,
        weight: 600,
        fill: theme.muted,
      }),
      text(name, 44, 66, { size: 25, weight: 600, fill: theme.text, maxWidth: 535 }),
    ],
  };
}

export function wrapDescription(
  value: string,
  text: TextRenderer,
  width: number,
  maxLines: number,
): string[] {
  const graphemes = [...new Intl.Segmenter().segment(value.replace(/\s+/gu, ' ').trim())].map(
    (item) => item.segment,
  );
  const lines: string[] = [];
  let line = '';
  const style = { size: 14 };
  for (let index = 0; index < graphemes.length; index++) {
    const char = graphemes[index]!;
    if (text.measure(line + char, style) <= width) {
      line += char;
      continue;
    }
    if (lines.length === maxLines - 1) {
      while (line && text.measure(line + '…', style) > width) {
        line = [...new Intl.Segmenter().segment(line)]
          .slice(0, -1)
          .map((item) => item.segment)
          .join('');
      }
      lines.push(line.trimEnd() + '…');
      return lines;
    }
    // Prefer a word boundary when it leaves a reasonably filled line.
    const boundary = line.lastIndexOf(' ');
    if (boundary > 0 && text.measure(line.slice(0, boundary), style) >= width * 0.6) {
      lines.push(line.slice(0, boundary));
      line = line.slice(boundary + 1) + char;
    } else {
      lines.push(line.trimEnd());
      line = char.trimStart();
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}
