import { decodeWire, schemaAt } from '@cool-profile/card-kit/wire';
import type { JsonSchema } from '@cool-profile/card-kit/wire';
import { mediaSchema } from '@cool-profile/card-kit/media';
import type { MediaOptions } from '@cool-profile/card-kit/media';

export interface GallerySample {
  url: string;
  poster: string;
  format: MediaOptions['format'];
  theme: string;
  locale: string;
  animated: boolean;
  width: number;
  height: number;
}
export interface GalleryCase {
  params: Record<string, unknown>;
  samples: GallerySample[];
}
export interface CatalogCard {
  id: string;
  name: Record<string, string>;
  parameterSchema: JsonSchema;
  formats: MediaOptions['format'][];
  themes: string[];
  locales: string[];
  cases: GalleryCase[];
}

export interface GalleryEntry {
  card: CatalogCard;
  caseIndex: number;
  sample: GallerySample;
}

export function galleryEntries(cards: readonly CatalogCard[]): GalleryEntry[] {
  return cards.flatMap((card) =>
    card.cases.flatMap((example, caseIndex) =>
      [...example.samples]
        .sort((a, b) => card.themes.indexOf(a.theme) - card.themes.indexOf(b.theme))
        .map((sample) => ({ card, caseIndex, sample })),
    ),
  );
}

export function wireValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function isAnimatedSvg(svg: string): boolean {
  return /<style\b[\s\S]*?@keyframes|<animate(?:Transform|Motion)?\b/.test(svg);
}

export function sampleFor(
  example: GalleryCase | undefined,
  media: MediaOptions,
): GallerySample | undefined {
  const samples =
    example?.samples.filter(
      (sample) => sample.locale === media.locale && sample.theme === media.theme,
    ) ?? [];
  return samples.find((sample) => sample.format === media.format) ?? samples[0];
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : "'" + value.replaceAll("'", "'\\''") + "'";
}

export function requestArtifacts(
  card: CatalogCard,
  rawMedia: MediaOptions,
  fields: ReadonlyMap<string, string>,
  origin: string,
) {
  const parsed = mediaSchema.safeParse(rawMedia);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues.map((issue) => issue.path.join('.') + ': ' + issue.message).join('; '),
    );
  const media = parsed.data;
  if (
    !card.formats.includes(media.format) ||
    !card.themes.includes(media.theme) ||
    !card.locales.includes(media.locale)
  )
    throw new Error('Unsupported media settings');
  const params = Object.fromEntries(
    [...fields]
      .filter(([, value]) => value !== '')
      .map(([name, value]) => [
        name,
        decodeWire(schemaAt(card.parameterSchema, [name]), value, name, card.parameterSchema),
      ]),
  );
  const filename = 'profile/' + card.id.replaceAll('/', '-') + '.' + media.format;
  const args = [
    'coolp',
    'render',
    card.id,
    '--params',
    JSON.stringify(params),
    '--format',
    media.format,
    '--theme',
    media.theme,
    '--locale',
    media.locale,
    '--seed',
    String(media.seed),
    '--output',
    filename,
  ];
  const url = new URL(
    '/v1/cards/' + card.id.split('/').map(encodeURIComponent).join('/') + '.' + media.format,
    origin,
  );
  url.search = new URLSearchParams({
    params: JSON.stringify(params),
    theme: media.theme,
    locale: media.locale,
    seed: String(media.seed),
  }).toString();
  const config = {
    runtime: { 'output-dir': '.' },
    jobs: [{ card: card.id, params, render: media, output: filename }],
  };
  return {
    params,
    filename,
    cli: args.map(shellQuote).join(' '),
    url: url.href,
    config: JSON.stringify(config, null, 2),
  };
}
