import { create } from 'fontkit';
import type { Font } from 'fontkit';
import { escapeXml } from './svg.js';
import type { TextRenderer, TextStyle } from './types.js';

export function createTextRenderer(
  buffer: Buffer,
  fallbacks: readonly Buffer[] = [],
): TextRenderer {
  const regular = [buffer, ...fallbacks].map((input) => {
    const parsed = create(input);
    if (!('layout' in parsed)) throw new Error('Expected a single font');
    return parsed;
  });
  const variants = new Map<number, Font[]>();
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  function faces(weight = 400): Font[] {
    const cached = variants.get(weight);
    if (cached) return cached;
    const fonts = regular.map((font) =>
      font.variationAxes?.wght ? font.getVariation({ wght: weight }) : font,
    );
    variants.set(weight, fonts);
    return fonts;
  }
  function shape(value: string, weight?: number) {
    const fonts = faces(weight);
    const runs: { font: Font; value: string }[] = [];
    for (const { segment } of segmenter.segment(value)) {
      const font =
        fonts.find((candidate) =>
          [...segment].every(
            (char) =>
              /\p{Default_Ignorable_Code_Point}/u.test(char) ||
              candidate.hasGlyphForCodePoint(char.codePointAt(0)!),
          ),
        ) ?? fonts[0]!;
      const previous = runs.at(-1);
      if (previous?.font === font) previous.value += segment;
      else runs.push({ font, value: segment });
    }
    return runs.map(({ font, value: part }) => ({ font, run: font.layout(part) }));
  }
  const measure = (value: string, style: Pick<TextStyle, 'size' | 'weight'>) => {
    return shape(value, style.weight).reduce(
      (width, { font, run }) =>
        width +
        (run.positions.reduce((sum, position) => sum + position.xAdvance, 0) * style.size) /
          font.unitsPerEm,
      0,
    );
  };
  const render = (value: string, x: number, y: number, style: TextStyle): string => {
    const original = value;
    if (style.maxWidth !== undefined && measure(value, style) > style.maxWidth) {
      const glyphs = [
        ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
      ].map((segment) => segment.segment);
      while (glyphs.length && measure(glyphs.join('') + '…', style) > style.maxWidth) glyphs.pop();
      value = glyphs.join('') + '…';
    }
    const width = measure(value, style);
    if (style.anchor === 'end') x -= width;
    if (style.anchor === 'middle') x -= width / 2;
    let cursor = 0;
    const paths = shape(value, style.weight)
      .map(({ font, run }) => {
        const scale = style.size / font.unitsPerEm;
        return run.glyphs
          .map((glyph, index) => {
            const position = run.positions[index]!;
            const transform =
              'translate(' +
              (x + cursor + position.xOffset * scale) +
              ' ' +
              (y - position.yOffset * scale) +
              ') scale(' +
              scale +
              ' ' +
              -scale +
              ')';
            cursor += position.xAdvance * scale;
            return '<path d="' + glyph.path.toSVG() + '" transform="' + transform + '"/>';
          })
          .join('');
      })
      .join('');
    return (
      '<g fill="' +
      escapeXml(style.fill) +
      '" aria-label="' +
      escapeXml(original) +
      '">' +
      paths +
      '</g>'
    );
  };
  return Object.assign(render, { measure });
}
