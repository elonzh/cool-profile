import type { Graphic, MediaFormat } from './types.js';
import { setImmediate } from 'node:timers/promises';

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
  const { Resvg } = await import('@resvg/resvg-js');
  const { default: sharp } = await import('sharp');
  const animation = graphic.animation;
  const frameCount = animation ? Math.ceil((animation.durationMs * animation.fps) / 1000) : 1;
  const frames: Buffer[] = [];
  const delay: number[] = [];
  for (let index = 0; index < frameCount; index++) {
    const time = animation ? (index * animation.durationMs) / frameCount : 0;
    const svg = animation ? animation.frame(time) : graphic.svg;
    frames.push(new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng());
    if (animation) {
      // GIF stores centiseconds; accumulate rounding so 40 fps keeps its total duration.
      const start = Math.round((index * animation.durationMs) / frameCount / 10);
      const end = Math.round(((index + 1) * animation.durationMs) / frameCount / 10);
      delay.push((end - start) * 10);
    }
    await setImmediate();
  }
  const image = sharp(frames, { join: { animated: Boolean(animation) } });
  const timing = animation ? { delay, loop: 0 } : {};
  const bytes =
    format === 'gif'
      ? await image.gif({ ...timing, effort: 3 }).toBuffer()
      : await image.webp({ ...timing, lossless: true, effort: 2 }).toBuffer();
  return { ...common, animated: Boolean(animation), bytes, mime: 'image/' + format };
}
