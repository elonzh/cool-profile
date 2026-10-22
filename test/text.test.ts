import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createTextRenderer } from '../packages/graphics/src/index.js';
import { wrapDescription } from '../cards/stats/src/layout.js';

const font = await readFile('apps/coolp/assets/fonts/NotoSansSC.ttf');
const emoji = await readFile('apps/coolp/assets/fonts/NotoEmoji.ttf');
const primary = createTextRenderer(font);
const fallback = createTextRenderer(font, [emoji]);
const emojiOnly = createTextRenderer(emoji);
const style = { size: 16, fill: '#ffffff' };
const outlines = (value: string) =>
  [...value.matchAll(/<path d="([^"]*)"/g)].map((match) => match[1]);

it('uses actual Emoji outlines while preserving Latin and Chinese glyphs and measurements', () => {
  expect(outlines(primary('🟩', 0, 0, style))).toEqual(outlines(primary('⬜', 0, 0, style)));
  expect(outlines(fallback('🟩⬜', 0, 0, style))).toEqual(outlines(emojiOnly('🟩⬜', 0, 0, style)));
  expect(outlines(fallback('🟩', 0, 0, style))).not.toEqual(outlines(primary('🟩', 0, 0, style)));
  expect(fallback.measure('中文 A🟩B', style)).toBeCloseTo(
    primary.measure('中文 A', style) + emojiOnly.measure('🟩', style) + primary.measure('B', style),
  );
  expect(fallback('中文 🟩', 0, 0, style)).toContain('aria-label="中文 🟩"');
});

it('keeps joined Emoji intact in shaping, description wrapping and ellipsis', () => {
  expect(outlines(fallback('👩‍💻', 0, 0, style))).toEqual(outlines(emojiOnly('👩‍💻', 0, 0, style)));
  expect(outlines(fallback('👩‍💻', 0, 0, style))).toHaveLength(1);
  const value = 'A 👩‍💻 B 🟩 中文 '.repeat(20);
  const lines = wrapDescription(value, fallback, 180, 3);
  expect(lines).toHaveLength(3);
  expect(lines.every((line) => fallback.measure(line, { size: 14 }) <= 180)).toBe(true);
  expect(lines.join('')).not.toMatch(/\u200d(?: |…|$)/);
  const clipped = fallback(value, 0, 0, { ...style, maxWidth: 60 });
  expect(clipped).not.toContain('NaN');
  expect(clipped).toContain('aria-label="' + value + '"');
});
