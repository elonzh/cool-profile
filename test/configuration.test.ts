import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCardRegistry } from '../packages/card-kit/src/index.js';
import { configCard } from './fixtures/config-card.js';
import {
  loadConfiguration,
  resolveCardRequest,
  resolveBatch,
  resolveOutput,
} from '../apps/coolp/src/config/index.js';
import { parseGenerationFields } from '../apps/coolp/src/input/fields.js';
import { parseConfigurationText } from '../packages/card-kit/src/text.js';

const registry = createCardRegistry([configCard]);
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function workspace() {
  const cwd = await mkdtemp(resolve(tmpdir(), 'coolp-config-'));
  folders.push(cwd);
  return cwd;
}
async function configFile(cwd: string, value: unknown, name = 'coolp.json') {
  const file = resolve(cwd, name);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}
const fileSettings = {
  defaults: { locale: 'zh-CN', seed: 42 },
  cards: {
    'profile/overview': {
      render: { locale: 'zh-CN', theme: 'dark' },
      params: { source: 'cnb', subject: 'file-user', options: { count: 10, tags: ['a', 'b'] } },
    },
  },
  jobs: [{ card: 'profile/overview', params: { subject: 'job-user' }, output: 'job.svg' }],
};

describe('configuration overlay and provenance', () => {
  it('applies file, job, environment, plugin and explicit request precedence', async () => {
    const cwd = await workspace();
    await configFile(cwd, fileSettings);
    const configuration = await loadConfiguration(registry, {
      cwd,
      environment: {
        COOLP__DEFAULTS__LOCALE: 'en',
        COOLP__CARDS: JSON.stringify({ 'profile/overview': { params: { subject: 'env-user' } } }),
      },
    });
    const base = resolveCardRequest(configuration, registry, configCard.id, { jobIndex: 0 });
    expect(base.params.subject).toBe('env-user');
    expect(base.media.locale).toBe('en');
    expect(base.media.theme).toBe('dark');
    expect(base.origins['/params/subject']?.source).toBe('COOLP__CARDS');
    const plugin = parseGenerationFields(configCard, [['subject', 'plugin-user']], 'PLUGIN');
    const cli = parseGenerationFields(
      configCard,
      [
        ['subject', 'cli-user'],
        ['locale', 'zh-CN'],
      ],
      'CLI',
    );
    const request = resolveCardRequest(configuration, registry, configCard.id, {
      jobIndex: 0,
      inputs: [plugin, cli],
    });
    expect(request.params.subject).toBe('cli-user');
    expect(request.media.locale).toBe('zh-CN');
    expect(request.origins['/media/locale']?.source).toBe('CLI');
    expect(request.origins['/params/options/count']?.path).toEqual([
      'cards',
      'profile/overview',
      'params',
      'options',
      'count',
    ]);
  });

  it('merges objects, replaces arrays and preserves false, zero, empty arrays and null', async () => {
    const cwd = await workspace();
    await configFile(cwd, fileSettings);
    const configuration = await loadConfiguration(registry, {
      cwd,
      environment: {
        COOLP__DEFAULTS__SEED: '0',
        COOLP__CARDS: JSON.stringify({
          'profile/overview': { params: { options: { count: 0, enabled: false, tags: [] } } },
        }),
      },
    });
    const request = resolveCardRequest(configuration, registry, configCard.id);
    expect(request.params.options).toEqual({ count: 0, enabled: false, tags: [] });
    expect(request.media.seed).toBe(0);
    const cleared = resolveCardRequest(configuration, registry, configCard.id, {
      inputs: [{ source: 'CLI', params: { options: null } }],
    });
    expect(cleared.params.options).toBeNull();
    expect(cleared.origins).not.toHaveProperty('/params/options/count');
    expect(cleared.origins['/params/options']?.source).toBe('CLI');
  });

  it('computes format-dependent defaults after resolving media and checks combinations', async () => {
    const configuration = await loadConfiguration(registry, {
      cwd: await workspace(),
      environment: {},
    });
    const input = parseGenerationFields(
      configCard,
      [
        ['format', 'png'],
        ['subject', 'elonzh'],
      ],
      'URL',
    );
    const request = resolveCardRequest(configuration, registry, configCard.id, { inputs: [input] });
    expect(request.params.animate).toBe(false);
    expect(() =>
      resolveCardRequest(configuration, registry, configCard.id, {
        inputs: [input, { source: 'CLI --animate', params: { animate: true } }],
      }),
    ).toThrow('CLI --animate');
  });

  it('keeps requests independent and does not mutate caller-owned patches', async () => {
    const configuration = await loadConfiguration(registry, {
      cwd: await workspace(),
      environment: {},
    });
    const patch = { subject: 'first', options: { tags: ['caller'] } };
    const first = resolveCardRequest(configuration, registry, configCard.id, {
      inputs: [{ source: 'CLI', params: patch }],
    });
    const second = resolveCardRequest(configuration, registry, configCard.id, {
      inputs: [{ source: 'URL', params: { subject: 'second' } }],
    });
    expect(Object.isFrozen(first.params)).toBe(true);
    expect(Object.isFrozen(first.params.options)).toBe(true);
    expect(Object.isFrozen(patch.options)).toBe(false);
    expect(second.params.options).toEqual({ count: 5, enabled: true, tags: ['default'] });
    expect(patch).toEqual({ subject: 'first', options: { tags: ['caller'] } });
  });

  it('reports the field and its source for missing or unsupported values', async () => {
    const cwd = await workspace();
    await configFile(cwd, { defaults: { theme: 'missing-theme' } });
    const configuration = await loadConfiguration(registry, { cwd, environment: {} });
    expect(() =>
      resolveCardRequest(configuration, registry, configCard.id, {
        inputs: [{ source: 'CLI', params: { subject: 'elonzh' } }],
      }),
    ).toThrow('defaults.theme');
    const bare = await loadConfiguration(registry, { cwd: await workspace(), environment: {} });
    expect(() => resolveCardRequest(bare, registry, configCard.id)).toThrow('params.subject');
  });

  it('rejects an invalid lower-priority field before a later overlay can mask it', async () => {
    const cwd = await workspace();
    await configFile(cwd, {
      cards: { 'profile/overview': { params: { subject: '' } } },
    });
    await expect(
      loadConfiguration(registry, {
        cwd,
        environment: { COOLP__CARDS: '{"profile/overview":{"params":{"subject":"valid"}}}' },
      }),
    ).rejects.toThrow('coolp.json');
  });
});

describe('runtime, files and environment', () => {
  it('resolves config file selection and relative paths by their source', async () => {
    const cwd = await workspace();
    await configFile(
      cwd,
      { runtime: { 'output-dir': 'file-images', server: { port: 1234 } } },
      'settings/coolp.yaml',
    );
    const configuration = await loadConfiguration(registry, {
      cwd,
      environment: { COOLP_CONFIG: 'settings/coolp.yaml', COOLP__RUNTIME__SERVER__PORT: '8080' },
    });
    expect(configuration.runtime['output-dir']).toBe(resolve(cwd, 'settings/file-images'));
    expect(configuration.runtime.server.port).toBe(8080);
    const overridden = await loadConfiguration(registry, {
      cwd,
      config: 'settings/coolp.yaml',
      environment: { COOLP_CONFIG: 'missing.json', COOLP__RUNTIME__OUTPUT_DIR: 'env-images' },
      runtimeInputs: [
        { source: 'PLUGIN', value: { server: { port: 8081 } } },
        { source: 'CLI', value: { server: { port: 8082 }, 'output-dir': 'cli-images' } },
      ],
    });
    expect(overridden.runtime.server.port).toBe(8082);
    expect(overridden.runtime['output-dir']).toBe(resolve(cwd, 'cli-images'));
    expect(overridden.runtime.providers.github?.['token-env']).toBe('GITHUB_TOKEN');
  });

  it('detects ambiguous auto discovery and does not silently ignore explicit missing files', async () => {
    const cwd = await workspace();
    await configFile(cwd, {});
    await configFile(cwd, {}, 'coolp.yaml');
    await expect(loadConfiguration(registry, { cwd, environment: {} })).rejects.toThrow('Multiple');
    await expect(
      loadConfiguration(registry, { cwd, config: 'missing.json', environment: {} }),
    ).rejects.toThrow('Cannot read');
  });

  it.each([
    { COOLP__RUNTIME__SERVER__PORT: 'false' },
    { COOLP__RUNTIME__SERVER__PORT: '70000' },
    { COOLP__RUNTIME__SERVER__PORT: '' },
    { COOLP__DEFAULTS__SEED: '0xff' },
    { COOLP__DEFAULTS__SEED: '1e3' },
    { COOLP__UNKNOWN: 'value' },
    { COOLP__CARDS__PROFILE_OVERVIEW: '{}' },
    { COOLP__CARDS: '{"missing/card":{"params":{}}}' },
  ])('rejects invalid typed environment configuration', async (environment) => {
    await expect(
      loadConfiguration(registry, { cwd: await workspace(), environment }),
    ).rejects.toThrow();
  });

  it('rejects overlapping environment assignments and tracks missing provider fields', async () => {
    await expect(
      loadConfiguration(registry, {
        cwd: await workspace(),
        environment: {
          COOLP__RUNTIME__SERVER: '{"port":8080}',
          COOLP__RUNTIME__SERVER__PORT: '8081',
        },
      }),
    ).rejects.toThrow('conflicts');
    await expect(
      loadConfiguration(registry, {
        cwd: await workspace(),
        environment: {
          COOLP__RUNTIME__PROVIDERS__CUSTOM__TOKEN_ENV: 'CUSTOM_TOKEN',
        },
      }),
    ).rejects.toThrow('COOLP__RUNTIME__PROVIDERS__CUSTOM__TOKEN_ENV');
  });

  it('allows partial server card defaults until a request supplies required parameters', async () => {
    const cwd = await workspace();
    await configFile(cwd, {
      cards: { 'profile/overview': { params: { options: { enabled: false } } } },
    });
    const configuration = await loadConfiguration(registry, {
      cwd,
      environment: { GITHUB_TOKEN: 'secret-should-not-enter-config' },
    });
    const request = resolveCardRequest(configuration, registry, configCard.id, {
      inputs: [{ source: 'URL', params: { subject: 'elonzh' } }],
    });
    expect(request.params.options).toEqual({ count: 5, enabled: false, tags: ['default'] });
    expect(JSON.stringify(configuration)).not.toContain('secret-should-not-enter-config');
    expect(JSON.stringify(request)).not.toContain('secret-should-not-enter-config');
  });
});

describe('configuration formats and batch output', () => {
  it.each([
    ['defaults:\n  locale: en\n  locale: zh-CN\n', false],
    ['{"defaults":{"locale":"en","locale":"zh-CN"}}', true],
    ['defaults: {locale: !!unknown en}', false],
    ['cards: &self { value: *self }', false],
    ['{defaults: {locale: en}}', true],
  ] as const)('rejects ambiguous or non-JSON configuration structures', (text, json) => {
    expect(() => parseConfigurationText(text, 'configuration', json)).toThrow('configuration');
  });

  it.each([
    { jobs: [{ params: {} }] },
    { defaults: { subject: 'not-global' } },
    { runtime: { server: { typo: 123 } } },
    { runtime: { providers: { github: { 'base-url': 'invalid-url' } } } },
    { cards: { 'profile/overview': { render: { format: 'gif' } } } },
  ])('validates configuration structure before generation', async (value) => {
    const cwd = await workspace();
    await configFile(cwd, value);
    await expect(loadConfiguration(registry, { cwd, environment: {} })).rejects.toThrow();
  });

  it('includes the exact environment variable in unknown-field diagnostics', async () => {
    await expect(
      loadConfiguration(registry, {
        cwd: await workspace(),
        environment: { COOLP__RUNTIME__SERVER__TYPO: '123' },
      }),
    ).rejects.toThrow('COOLP__RUNTIME__SERVER__TYPO');
  });

  it('resolves namespaced default paths, explicit CLI paths and stdout', async () => {
    const cwd = await workspace();
    await configFile(cwd, fileSettings);
    const configuration = await loadConfiguration(registry, { cwd, environment: {} });
    const request = resolveCardRequest(configuration, registry, configCard.id);
    expect(resolveOutput(configuration, request)).toBe(resolve(cwd, 'dist/profile/overview.svg'));
    expect(resolveOutput(configuration, request, { output: 'custom.svg' })).toBe(
      resolve(cwd, 'custom.svg'),
    );
    expect(resolveOutput(configuration, request, { output: '-' })).toBe('-');
    expect(() => resolveOutput(configuration, request, { output: 'custom.png' })).toThrow(
      'conflicts',
    );
    expect(() => resolveOutput(configuration, request, { output: '' })).toThrow('cannot be empty');
  });

  it('validates all batch jobs and duplicate outputs before returning work', async () => {
    const cwd = await workspace();
    await configFile(cwd, {
      ...fileSettings,
      jobs: [
        { card: configCard.id, output: 'one.svg' },
        { card: configCard.id, output: './one.svg' },
      ],
    });
    const configuration = await loadConfiguration(registry, { cwd, environment: {} });
    expect(() => resolveBatch(configuration, registry)).toThrow('Duplicate batch output');
    const bare = await loadConfiguration(registry, { cwd: await workspace(), environment: {} });
    expect(() => resolveBatch(bare, registry)).toThrow('with jobs');
  });
});
