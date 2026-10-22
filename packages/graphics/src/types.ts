export type MediaFormat = 'svg' | 'png' | 'gif' | 'webp';

export interface MediaOptions {
  format: MediaFormat;
  theme: string;
  locale: string;
  seed: number;
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
