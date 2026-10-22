import { create } from 'fontkit';
import type { Font } from 'fontkit';
import { escapeXml } from './svg.js';
import type { TextRenderer, TextStyle } from './types.js';

export function createTextRenderer(buffer: Buffer): TextRenderer {
  const parsed = create(buffer);
  if (!('layout' in parsed)) throw new Error('Expected a single font');
  const regular = parsed;
  const variants = new Map<number, Font>();
  function face(weight = 400): Font {
    const cached = variants.get(weight);
    if (cached) return cached;
    const font = regular.variationAxes?.wght ? regular.getVariation({ wght: weight }) : regular;
    variants.set(weight, font);
    return font;
  }
  const measure = (value: string, style: Pick<TextStyle, 'size' | 'weight'>) => {
    const font = face(style.weight);
    return (
      (font.layout(value).positions.reduce((sum, position) => sum + position.xAdvance, 0) *
        style.size) /
      font.unitsPerEm
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
    const font = face(style.weight);
    const scale = style.size / font.unitsPerEm;
    const run = font.layout(value);
    let cursor = 0;
    const paths = run.glyphs
      .map((glyph, index) => {
        const position = run.positions[index]!;
        const transform =
          'translate(' +
          (x + (cursor + position.xOffset) * scale) +
          ' ' +
          (y - position.yOffset * scale) +
          ') scale(' +
          scale +
          ' ' +
          -scale +
          ')';
        cursor += position.xAdvance;
        return '<path d="' + glyph.path.toSVG() + '" transform="' + transform + '"/>';
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
