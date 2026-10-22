import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, matchesGlob, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import * as z from 'zod';
import { parseConfigurationText } from '../packages/card-kit/src/text.js';
import { loadCardPackages } from './card-packages.js';
import type { CardPackage } from './card-packages.js';
import type { CatalogCard, GalleryCase } from '../apps/gallery/src/model.js';
import { isAnimatedSvg } from '../apps/gallery/src/model.js';

const manifestSchema = z.strictObject({
  name: z.record(z.string(), z.string().min(1)),
  cases: z
    .array(
      z.strictObject({
        pattern: z.string().regex(/^[A-Za-z0-9*?_.-]+$/),
        params: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1),
});

export async function writeGalleryCatalog(
  packages: readonly CardPackage[],
  target: string,
): Promise<CatalogCard[]> {
  const imports: string[] = [];
  const assets = new Map<string, string>();
  const addAsset = (file: string): string => {
    const existing = assets.get(file);
    if (existing) return existing;
    const key = String(assets.size);
    let path = relative(dirname(target), file).split(sep).join('/');
    if (!path.startsWith('.')) path = './' + path;
    imports.push('import asset' + key + ' from ' + JSON.stringify(path + '?url') + ';');
    assets.set(file, key);
    return key;
  };
  const catalog: CatalogCard[] = [];
  const posterDirectory = resolve(dirname(target), 'gallery-posters');
  await mkdir(posterDirectory, { recursive: true });
  for (const item of packages) {
    const card = (await loadCardPackages([item]))[0]!;
    const directory = resolve(item.directory, 'examples');
    const manifestFile = resolve(directory, 'manifest.json');
    let entry: z.output<typeof manifestSchema> | undefined;
    try {
      entry = manifestSchema.parse(
        parseConfigurationText(await readFile(manifestFile, 'utf8'), manifestFile, true),
      );
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    const files = entry ? await readdir(directory) : [];
    const cases: GalleryCase[] = [];
    for (const example of entry?.cases ?? []) {
      const samples: GalleryCase['samples'] = [];
      for (const file of files.filter((name) => matchesGlob(name, example.pattern)).sort()) {
        const extension = extname(file).slice(1);
        const format = card.formats.find((format) => format === extension);
        if (!format) continue;
        const locale = [...card.locales]
          .sort((a, b) => b.length - a.length)
          .find((locale) => file.endsWith('.' + locale + '.' + format));
        if (!locale) continue;
        const stem = file.slice(0, -('.' + locale + '.' + format).length);
        const theme = [...card.themes]
          .sort((a, b) => b.length - a.length)
          .find((theme) => stem.endsWith('-' + theme));
        if (!theme) continue;
        const media = { format, locale, theme, seed: 0 };
        const params = card.params.parse({ ...card.defaults(media), ...example.params });
        const issues = card.validate(params, media, { now: new Date() });
        if (issues.length)
          throw new Error(
            manifestFile + ': ' + file + ': ' + issues.map((issue) => issue.message).join('; '),
          );
        const filePath = resolve(directory, file);
        const input = await readFile(filePath);
        const metadata = await sharp(input).metadata();
        const animated =
          format === 'svg' ? isAnimatedSvg(input.toString()) : (metadata.pages ?? 1) > 1;
        const posterFile = resolve(
          posterDirectory,
          createHash('sha256').update(input).digest('hex').slice(0, 16) + '.png',
        );
        await sharp(input, { page: 0, pages: 1 })
          .resize({ width: 800, withoutEnlargement: true })
          .png()
          .toFile(posterFile);
        samples.push({
          url: addAsset(filePath),
          poster: addAsset(posterFile),
          format,
          locale,
          theme,
          animated,
        });
      }
      if (!samples.length)
        throw new Error(manifestFile + ': no supported samples match ' + example.pattern);
      cases.push({ params: example.params, samples });
    }
    catalog.push({
      id: card.id,
      name: entry?.name ?? {},
      parameterSchema: card.parameterSchema,
      formats: [...card.formats],
      themes: [...card.themes],
      locales: [...card.locales],
      cases,
    });
  }
  const mapping = [...assets.values()]
    .map((key) => JSON.stringify(key) + ': asset' + key)
    .join(', ');
  const modelPath = relative(
    dirname(target),
    resolve(import.meta.dirname, '../apps/gallery/src/model.ts'),
  )
    .split(sep)
    .join('/');
  await writeFile(
    target,
    [
      '// Generated from card packages and examples/manifest.json.',
      'import type { CatalogCard } from ' +
        JSON.stringify(modelPath.startsWith('.') ? modelPath : './' + modelPath) +
        ';',
      ...imports,
      'const assets: Record<string, string> = {' + mapping + '};',
      'const definitions: CatalogCard[] = ' + JSON.stringify(catalog) + ';',
      'export const catalog = definitions.map(card => ({ ...card, cases: card.cases.map(example => ({ ...example, samples: example.samples.map(sample => ({ ...sample, url: assets[sample.url]!, poster: assets[sample.poster]! })) })) }));',
      '',
    ].join('\n'),
  );
  return catalog;
}
