import type { Graphic, MediaFormat } from './types.js';

export interface Media {
  bytes: Buffer;
  mime: string;
  width: number;
  height: number;
  animated: boolean;
}
export async function encodeGraphic(graphic: Graphic, format: MediaFormat): Promise<Media> {
  const common = { width: graphic.width, height: graphic.height, animated: false };
  if (format === 'svg') {
    return {
      ...common,
      animated: Boolean(graphic.animation),
      bytes: Buffer.from(graphic.svg),
      mime: 'image/svg+xml',
    };
  }
  if (format === 'png') {
    const { Resvg } = await import('@resvg/resvg-js');
    const image = new Resvg(graphic.svg, { font: { loadSystemFonts: false } }).render();
    return { ...common, bytes: image.asPng(), mime: 'image/png' };
  }
  throw new Error('Encoding is not implemented: ' + format);
}
