export type MediaFormat = 'svg' | 'png' | 'gif' | 'webp';

export interface MediaOptions {
  format: MediaFormat;
  theme: string;
  locale: string;
  seed: number;
}

export interface TextStyle {
  size: number;
  fill: string;
  weight?: 400 | 600 | 700;
  maxWidth?: number;
  anchor?: 'start' | 'middle' | 'end';
}
export interface TextRenderer {
  (value: string, x: number, y: number, style: TextStyle): string;
  measure(value: string, style: Pick<TextStyle, 'size' | 'weight'>): number;
}

export interface Graphic {
  width: number;
  height: number;
  svg: string;
  animation?: {
    durationMs: number;
    fps: number;
    frame(timeMs: number): string;
  };
}
