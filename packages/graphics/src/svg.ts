import type { Graphic } from './types.js';

const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => entities[character]!);
}

export function svgDocument(
  width: number,
  height: number,
  body: string,
  description?: { title?: string; description?: string },
): Graphic {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('SVG dimensions must be positive finite numbers');
  }
  const title = description?.title ? '<title>' + escapeXml(description.title) + '</title>' : '';
  const desc = description?.description
    ? '<desc>' + escapeXml(description.description) + '</desc>'
    : '';
  const attributes = `xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`;
  return {
    width,
    height,
    svg: `<svg ${attributes} role="img">${title}${desc}${body}</svg>`,
  };
}
