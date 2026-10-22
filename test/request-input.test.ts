import { expect, it } from 'vitest';
import { createCardRegistry } from '../packages/card-kit/src/index.js';
import { configCard } from './fixtures/config-card.js';
import {
  loadConfiguration,
  resolveCardRequest,
  CardNotFoundError,
} from '../apps/coolp/src/config/index.js';
import { parseGenerationFields } from '../apps/coolp/src/input/fields.js';
import { parseCardUrl } from '../apps/coolp/src/input/url.js';
import { parseOptions, stringFields } from '../apps/coolp/src/input/options.js';
import { parsePluginInput } from '../apps/coolp/src/input/plugin.js';

const registry = createCardRegistry([configCard]);

it('normalizes CLI and namespaced URLs to the same typed generation request', async () => {
  const configuration = await loadConfiguration(registry, { environment: {} });
  const { options, positionals } = parseOptions([
    'profile/overview',
    '--subject',
    'elonzh/cool-profile',
    '--source=cnb',
    '--code',
    '0007',
    '--animate',
    'false',
    '--locale',
    'en',
    '--seed',
    '0',
    '--options',
    '{"enabled":false,"tags":[]}',
  ]);
  expect(positionals).toEqual([configCard.id]);
  const cli = parseGenerationFields(configCard, stringFields(options), 'CLI');
  const query = new URLSearchParams({
    subject: 'elonzh/cool-profile',
    source: 'cnb',
    code: '0007',
    animate: 'false',
    locale: 'en',
    seed: '0',
    options: '{"enabled":false,"tags":[]}',
  });
  const url = parseCardUrl('/v1/cards/profile/overview.svg?' + query, registry);
  const left = resolveCardRequest(configuration, registry, configCard.id, { inputs: [cli] });
  const right = resolveCardRequest(configuration, registry, url.id, { inputs: [url.input] });
  expect({ id: left.id, media: left.media, params: left.params }).toEqual({
    id: right.id,
    media: right.media,
    params: right.params,
  });
  expect(left.params.code).toBe('0007');
  expect(left.params.animate).toBe(false);
  expect(left.params.options).toEqual({ count: 5, enabled: false, tags: [] });
});

it('uses the same default format when neither entry selects a format', async () => {
  const configuration = await loadConfiguration(registry, {
    environment: { COOLP__CARDS: '{"profile/overview":{"render":{"format":"png"}}}' },
  });
  const cli = parseGenerationFields(configCard, [['subject', 'elonzh']], 'CLI');
  const url = parseCardUrl('/v1/cards/profile/overview?subject=elonzh', registry);
  const left = resolveCardRequest(configuration, registry, configCard.id, { inputs: [cli] });
  const right = resolveCardRequest(configuration, registry, url.id, { inputs: [url.input] });
  expect(left.media).toEqual(right.media);
  expect(left.media.format).toBe('png');
  expect(right.params.animate).toBe(false);
});

it('supports aggregate card parameters without hiding duplicate field input', () => {
  const input = parseGenerationFields(
    configCard,
    [
      ['subject', 'elonzh'],
      ['params', '{"code":"007","options":{"tags":[]}}'],
    ],
    'CLI',
  );
  expect(input.params).toEqual({ subject: 'elonzh', code: '007', options: { tags: [] } });
  expect(() =>
    parseGenerationFields(
      configCard,
      [
        ['subject', 'elonzh'],
        ['params', '{"subject":"another-user"}'],
      ],
      'CLI',
    ),
  ).toThrow('duplicate parameter subject');
  expect(() => parseGenerationFields(configCard, [['params', 'null']], 'CLI')).toThrow(
    'JSON object',
  );
});

it('preserves question marks within query values and distinguishes strings from nullable JSON', () => {
  const parsed = parseCardUrl(
    '/v1/cards/profile/overview?subject=why?this&code=null&options=null',
    registry,
  );
  expect(parsed.input.params).toMatchObject({ subject: 'why?this', code: 'null', options: null });
});

it.each(['0', 'False', 'false ', ''])('rejects ambiguous textual booleans %j', (value) => {
  expect(() => parseGenerationFields(configCard, [['animate', value]], 'CLI')).toThrow(
    'true or false',
  );
});

it.each([
  '/v1/cards/',
  '/v1/cards/profile//overview.svg',
  '/v1/cards/profile%2Foverview.svg',
  '/v1/cards/profile/%2E%2E/overview.svg',
  '/v1/cards/profile/overview%ZZ.svg',
  '/v1/cards/profile/overview.svg?format=png',
  '/v1/cards/profile/overview.svg?subject=one&subject=two',
  '/v1/cards/profile/overview.svg?port=9000',
  '/v1/cards/profile/overview.svg?token=secret',
])('rejects ambiguous routing or invalid request fields: %s', (url) => {
  expect(() => parseCardUrl(url, registry)).toThrow();
});

it('reports an unknown card separately from invalid parameters', () => {
  expect(() => parseCardUrl('/v1/cards/missing/card.svg', registry)).toThrow(CardNotFoundError);
});

it('maps plugin inputs to the same field parser and keeps deployment controls separate', () => {
  const plugin = parsePluginInput(configCard, {
    PLUGIN_CARD: configCard.id,
    PLUGIN_SUBJECT: 'elonzh',
    PLUGIN_SOURCE: 'cnb',
    PLUGIN_PARAMS: '{"code":"007","options":{"enabled":false}}',
    PLUGIN_ANIMATE: 'false',
    PLUGIN_LOCALE: 'en',
    PLUGIN_OUTPUT: 'profile.svg',
    PLUGIN_CONFIG: 'settings.yaml',
    PLUGIN_OUTPUT_DIR: 'images',
    PLUGIN_LOG_LEVEL: 'debug',
  });
  expect(plugin.input.params).toMatchObject({
    subject: 'elonzh',
    source: 'cnb',
    code: '007',
    animate: false,
    options: { enabled: false },
  });
  expect(plugin.input.render).toMatchObject({ locale: 'en' });
  expect(plugin.runtime).toEqual({ 'output-dir': 'images', 'log-level': 'debug' });
  expect(plugin.config).toBe('settings.yaml');
  expect(plugin.output).toBe('profile.svg');
});

it('rejects plugin JSON collisions and differently spelled duplicate settings', () => {
  expect(() =>
    parsePluginInput(configCard, {
      PLUGIN_PARAMS: '{"subject":"one"}',
      PLUGIN_SUBJECT: 'two',
    }),
  ).toThrow('duplicate parameter subject');
  expect(() =>
    parsePluginInput(configCard, {
      PLUGIN_OUTPUT_DIR: 'one',
      'PLUGIN_OUTPUT-DIR': 'two',
    }),
  ).toThrow('Duplicate plugin parameter');
});

it('parses CLI aliases, explicit values and terminators without implicit type conversion', () => {
  const result = parseOptions(['--subject=001', '-o', '-', '--dry-run', '--', '--literal']);
  expect(result.options.get('subject')).toBe('001');
  expect(result.options.get('output')).toBe('-');
  expect(result.options.get('dry-run')).toBe(true);
  expect(result.positionals).toEqual(['--literal']);
  expect(() => parseOptions(['-o', 'one', '--output', 'two'])).toThrow('Duplicate option');
  expect(() => parseOptions(['--help=false'])).toThrow('does not accept a value');
  expect(() => parseOptions(['--subject'])).toThrow('Missing value');
});
