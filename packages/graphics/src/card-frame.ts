import type { TextRenderer } from './types.js';

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
