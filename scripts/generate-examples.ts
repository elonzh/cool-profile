import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createDataClient, stableKey } from '../packages/data/src/index.js';
import type { DataClient } from '../packages/data/src/types.js';
import { createTextRenderer } from '../packages/graphics/src/index.js';
import type { MediaFormat } from '../packages/graphics/src/types.js';
import { encodeGraphic } from '../packages/graphics/src/encode.js';
import { discoverCardPackages, loadCardPackages } from './card-packages.js';

const root = resolve(import.meta.dirname, '..');
const now = new Date();
const upstream = createDataClient({
  now: () => now,
  providers: {
    github: { 'base-url': 'https://api.github.com', 'token-env': 'GITHUB_TOKEN' },
    cnb: { 'base-url': 'https://api.cnb.cool', 'token-env': 'CNB_TOKEN' },
  },
});
const pending = new Map<string, ReturnType<DataClient['read']>>();
const data: DataClient = {
  read(query, controls) {
    const key = stableKey(query);
    let task = pending.get(key);
    if (!task) {
      task = upstream.read(query, controls);
      pending.set(key, task);
    }
    return task as ReturnType<typeof upstream.read<typeof query.kind>>;
  },
};
const text = createTextRenderer(
  await readFile(resolve(root, 'apps/coolp/assets/fonts/NotoSansSC.ttf')),
  [await readFile(resolve(root, 'apps/coolp/assets/fonts/NotoEmoji.ttf'))],
);
const packages = await discoverCardPackages(root);
const selected = process.argv.slice(2);
for (const item of packages) {
  if (selected.length && !selected.includes(item.id)) continue;
  const [card] = await loadCardPackages([item]);
  const directory = resolve(item.directory, 'examples');
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8')) as {
    cases: { pattern: string; params: Record<string, unknown> }[];
  };
  const files = await readdir(directory);
  const themes =
    card!.themes.length > 12
      ? ['default', 'dark', 'radical', 'tokyonight', 'dracula', 'transparent']
      : card!.themes;
  for (const example of manifest.cases) {
    const prefix = example.pattern.replace(/\*$/, '');
    const formats = card!.formats.includes('svg')
      ? [
          'svg',
          ...new Set(
            files
              .filter((file) => file.startsWith(prefix) && !file.endsWith('.svg'))
              .map((file) => extname(file).slice(1)),
          ),
        ]
      : card!.formats;
    for (const locale of card!.locales)
      for (const theme of themes) {
        for (const format of formats) {
          if (!card!.formats.includes(format as MediaFormat)) continue;
          const media = { format: format as MediaFormat, locale, theme, seed: 0 };
          const params = card!.params.parse({ ...card!.defaults(media), ...example.params });
          const draw = await card!.prepare(
            { data, now, signal: new AbortController().signal },
            params,
          );
          const graphic = await draw({ text, media });
          const encoded = await encodeGraphic(graphic, media.format);
          await writeFile(
            resolve(directory, `${prefix}${theme}.${locale}.${format}`),
            encoded.bytes,
          );
          if (locale === 'zh-CN' && format === formats[0]) {
            const folder = resolve(root, '.impeccable/review/media');
            await mkdir(folder, { recursive: true });
            const poster = {
              ...graphic,
              svg: graphic.animation?.frame(graphic.animation.durationMs * 0.55) ?? graphic.svg,
            };
            const png = await encodeGraphic(poster, 'png');
            await writeFile(
              resolve(folder, `${item.id.replaceAll('/', '-')}-${prefix}${theme}.png`),
              png.bytes,
            );
          }
        }
      }
    console.log(item.id + ' ' + prefix + ' generated');
  }
}
