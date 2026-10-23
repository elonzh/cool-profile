import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { createCardRegistry } from '../packages/card-kit/src/index.js';
import { configCard } from './fixtures/config-card.js';
import { parseOptions, stringFields } from '../apps/coolp/src/input/options.js';
import { parseGenerationFields } from '../apps/coolp/src/input/fields.js';
import { parseCardUrl } from '../apps/coolp/src/input/url.js';
import {
  loadConfiguration,
  resolveBatch,
  resolveCardRequest,
} from '../apps/coolp/src/config/index.js';
import {
  galleryEntries,
  isAnimatedSvg,
  requestArtifacts,
  sampleFor,
} from '../apps/gallery/src/model.js';
import type { CatalogCard, GallerySample } from '../apps/gallery/src/model.js';
import { writeGalleryCatalog } from '../scripts/gallery-catalog.js';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function folder() {
  const root = await mkdtemp(resolve(tmpdir(), 'coolp-gallery-'));
  folders.push(root);
  return root;
}
const descriptor: CatalogCard = {
  id: configCard.id,
  name: {},
  parameterSchema: configCard.parameterSchema,
  formats: [...configCard.formats],
  themes: [...configCard.themes],
  locales: [...configCard.locales],
  cases: [],
};

it('exports equivalent CLI, namespaced URL and config requests and quotes account text literally', async () => {
  const subject = "O'Reilly $(printf hidden) & 中文";
  const artifacts = requestArtifacts(
    descriptor,
    { format: 'svg', theme: 'dark', locale: 'en', seed: 7 },
    new Map([
      ['source', 'cnb'],
      ['subject', subject],
      ['code', '007'],
      ['animate', 'false'],
      ['options', '{"count":0,"enabled":false,"tags":[]}'],
    ]),
    'https://profile.test',
  );
  const { stdout } = await promisify(execFile)('/bin/sh', [
    '-c',
    artifacts.cli.replace(/^coolp /, "printf '%s\\n' "),
  ]);
  const parsed = parseOptions(stdout.trimEnd().split('\n'));
  expect(parsed.positionals).toEqual(['render', 'profile/overview']);
  expect(parsed.options.get('output')).toBe('profile/profile-overview.svg');
  parsed.options.delete('output');
  const registry = createCardRegistry([configCard]);
  const root = await folder();
  const configuration = await loadConfiguration(registry, { cwd: root, environment: {} });
  const cli = resolveCardRequest(configuration, registry, descriptor.id, {
    inputs: [parseGenerationFields(configCard, stringFields(parsed.options), 'CLI')],
  });
  const url = new URL(artifacts.url);
  const route = parseCardUrl(url.pathname + url.search, registry);
  const http = resolveCardRequest(configuration, registry, route.id, { inputs: [route.input] });
  const file = resolve(root, 'coolp.json');
  await writeFile(file, artifacts.config);
  const batchConfiguration = await loadConfiguration(registry, {
    cwd: root,
    config: file,
    environment: {},
  });
  const batch = resolveBatch(batchConfiguration, registry)[0]!;
  const request = ({ id, media, params }: typeof cli) => ({ id, media, params });
  expect(request(cli)).toEqual(request(http));
  expect(request(batch.request)).toEqual(request(cli));
  expect(cli.params.subject).toBe(subject);
  expect(cli.params.code).toBe('007');
  expect(batch.output).toBe(resolve(root, artifacts.filename));
});

it('uses the same duplicate JSON, media and unknown-field validation as the application', () => {
  const media = { format: 'svg' as const, theme: 'default', locale: 'zh-CN', seed: 0 };
  expect(() =>
    requestArtifacts(
      descriptor,
      media,
      new Map([['options', '{"count":1,"count":2}']]),
      'https://profile.test',
    ),
  ).toThrow('options');
  expect(() =>
    requestArtifacts(
      descriptor,
      { ...media, seed: 0x1_0000_0000 },
      new Map(),
      'https://profile.test',
    ),
  ).toThrow();
  expect(() =>
    requestArtifacts(descriptor, media, new Map([['unknown', 'x']]), 'https://profile.test'),
  ).toThrow('Unknown');
  expect(() =>
    requestArtifacts(
      descriptor,
      { ...media, theme: 'unsupported' },
      new Map(),
      'https://profile.test',
    ),
  ).toThrow('Unsupported');
});

it('keeps the requested sample language and theme and identifies animation in SVG data', () => {
  const example = {
    params: {},
    samples: [
      {
        url: 'example.svg',
        poster: 'poster.png',
        format: 'svg' as const,
        theme: 'dark',
        locale: 'zh-CN',
        animated: true,
        width: 800,
        height: 200,
      },
    ],
  };
  const media = { format: 'png' as const, theme: 'dark', locale: 'zh-CN', seed: 0 };
  expect(sampleFor(example, media)?.format).toBe('svg');
  expect(sampleFor(example, { ...media, locale: 'en' })).toBeUndefined();
  expect(sampleFor(example, { ...media, theme: 'default' })).toBeUndefined();
  expect(isAnimatedSvg('<svg><style>@keyframes move{}</style></svg>')).toBe(true);
  expect(isAnimatedSvg('<svg><animateTransform attributeName="transform"/></svg>')).toBe(true);
  expect(isAnimatedSvg('<svg><title>@keyframes</title></svg>')).toBe(false);
});

it('discovers namespaced fusion-card samples without requiring source or subject', async () => {
  const root = await folder();
  const examples = resolve(root, 'examples');
  await mkdir(examples);
  const manifest = {
    name: { 'zh-CN': '融合卡', en: 'Combined' },
    showcase: ['combined-default.*.svg'],
    cases: [{ pattern: 'combined-*', params: { 'github-user': 'one', 'cnb-user': 'two' } }],
  };
  await writeFile(resolve(examples, 'manifest.json'), JSON.stringify(manifest));
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#087e58"/></svg>';
  for (const locale of ['zh-CN', 'en'])
    await writeFile(resolve(examples, 'combined-default.' + locale + '.svg'), svg);
  const packages = [
    {
      id: 'profile/overview',
      name: 'fusion',
      directory: root,
      entry: resolve('test/fixtures/profile-card.ts'),
    },
  ];
  const target = resolve(root, 'generated/catalog.ts');
  const catalog = await writeGalleryCatalog(packages, target);
  expect(catalog[0]?.id).toBe('profile/overview');
  expect(catalog[0]?.cases[0]?.samples[0]).toMatchObject({ width: 20, height: 20, showcase: 0 });
  expect(catalog[0]?.cases[0]?.params).toEqual({ 'github-user': 'one', 'cnb-user': 'two' });
  expect(catalog[0]?.cases[0]?.samples.map((sample) => sample.locale).sort()).toEqual([
    'en',
    'zh-CN',
  ]);
  expect(await readFile(target, 'utf8')).toContain('?url');
  expect(
    (await readdir(resolve(root, 'generated/gallery-posters'))).some((file) =>
      file.endsWith('.png'),
    ),
  ).toBe(true);
  await writeFile(
    resolve(examples, 'manifest.json'),
    JSON.stringify({ ...manifest, id: 'arbitrary' }),
  );
  await expect(writeGalleryCatalog(packages, target)).rejects.toThrow('Unrecognized');
  await writeFile(
    resolve(examples, 'manifest.json'),
    JSON.stringify({ ...manifest, showcase: ['missing-*'] }),
  );
  await expect(writeGalleryCatalog(packages, target)).rejects.toThrow('showcase missing-*');
});

it('selects one sample per curated style after filtering without changing its configuration', () => {
  const sample: GallerySample = {
    url: 'dark.svg',
    poster: 'poster.png',
    width: 800,
    height: 200,
    format: 'svg' as const,
    theme: 'dark',
    locale: 'zh-CN',
    animated: false,
    showcase: 1,
  };
  const unfeatured = { ...sample, url: 'unfeatured.svg' };
  delete unfeatured.showcase;
  const first = {
    ...descriptor,
    themes: ['default', 'dark'],
    cases: [
      {
        params: { source: 'cnb', subject: 'one' },
        samples: [
          sample,
          { ...sample, url: 'default.svg', theme: 'default', showcase: 0 },
          { ...sample, url: 'dark.en.svg', locale: 'en' },
          { ...sample, url: 'dark.png', format: 'png' as const },
          unfeatured,
        ],
      },
      {
        params: { source: 'github', subject: 'two' },
        samples: [
          { ...sample, url: 'github.svg' },
          { ...sample, url: 'github.en.svg', locale: 'en' },
        ],
      },
      {
        params: { source: 'github', subject: 'two', layout: 'compact' },
        samples: [{ ...sample, format: 'png' as const, url: 'compact.png', showcase: 2 }],
      },
    ],
  };
  const entries = galleryEntries([first]);
  expect(entries.map((entry) => entry.sample.url)).toEqual([
    'default.svg',
    'dark.svg',
    'compact.png',
  ]);
  expect(entries[2]!.card.cases[entries[2]!.caseIndex]!.params).toEqual({
    source: 'github',
    subject: 'two',
    layout: 'compact',
  });
  const githubEnglish = galleryEntries(
    [first],
    (entry) =>
      entry.card.cases[entry.caseIndex]!.params.source === 'github' && entry.sample.locale === 'en',
  );
  expect(githubEnglish.map((entry) => entry.sample.url)).toEqual(['github.en.svg']);
  expect(githubEnglish[0]!.caseIndex).toBe(1);
  expect(first.cases[0]!.samples[0]!.url).toBe('dark.svg');
});
