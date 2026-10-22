import { access, readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { ConfigurationError } from '@cool-profile/card-kit';
import type { Card } from '@cool-profile/card-kit';
import { runtimeDefaults, runtimeSchema } from './schema.js';
import type { Runtime, RuntimePatch } from './schema.js';
import { environmentLayers, validateLayer } from './layers.js';
import type { ConfigLayer } from './layers.js';
import { parseConfigurationText } from '@cool-profile/card-kit/text';
import { freezeJson, mergeValues, parseResolved } from './values.js';
import type { ConfigValues, Origins } from './values.js';

export interface Configuration {
  readonly cwd: string;
  readonly file?: ConfigLayer;
  readonly environment: readonly ConfigLayer[];
  readonly runtime: Runtime;
  readonly runtimeOrigins: Origins;
}

export interface LoadOptions {
  cwd?: string;
  config?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  runtimeInputs?: readonly { source: string; value: RuntimePatch }[];
}

async function selectFile(cwd: string, explicit: string | undefined): Promise<string | undefined> {
  if (explicit !== undefined) {
    if (!explicit) throw new ConfigurationError('Configuration file path cannot be empty');
    return resolve(cwd, explicit);
  }
  const candidates = await Promise.all(
    ['coolp.yaml', 'coolp.yml', 'coolp.json'].map(async (name) => {
      const path = resolve(cwd, name);
      try {
        await access(path);
        return path;
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
        throw error;
      }
    }),
  );
  const files = candidates.filter((file) => file !== undefined);
  if (files.length > 1)
    throw new ConfigurationError('Multiple configuration files found in ' + cwd);
  return files[0];
}

function absoluteRuntimePath(layer: ConfigLayer, base: string): ConfigLayer {
  const directory = layer.value.runtime?.['output-dir'];
  if (directory === undefined) return layer;
  return {
    ...layer,
    value: {
      ...layer.value,
      runtime: { ...layer.value.runtime, 'output-dir': resolve(base, directory) },
    },
  };
}

export async function loadConfiguration(
  registry: ReadonlyMap<string, Card>,
  options: LoadOptions = {},
): Promise<Configuration> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const environment = options.environment ?? process.env;
  const filePath = await selectFile(cwd, options.config ?? environment.COOLP_CONFIG);
  let file: ConfigLayer | undefined;
  if (filePath) {
    const extension = extname(filePath).toLowerCase();
    if (!['.json', '.yaml', '.yml'].includes(extension)) {
      throw new ConfigurationError(filePath + ': expected a YAML or JSON configuration file');
    }
    let text: string;
    try {
      text = await readFile(filePath, 'utf8');
    } catch {
      throw new ConfigurationError('Cannot read configuration file: ' + filePath);
    }
    const value = parseConfigurationText(text, filePath, extension === '.json');
    file = absoluteRuntimePath(validateLayer(registry, value, filePath), dirname(filePath));
  }
  const variables = environmentLayers(registry, environment).map((layer) =>
    absoluteRuntimePath(layer, cwd),
  );
  const layers = [
    ...(file ? [file] : []),
    ...variables,
    ...(options.runtimeInputs ?? []).map((input) =>
      absoluteRuntimePath(validateLayer(registry, { runtime: input.value }, input.source), cwd),
    ),
  ];
  const origins: Origins = new Map();
  let runtime: ConfigValues = mergeValues(
    {},
    {
      ...runtimeDefaults,
      'output-dir': resolve(cwd, runtimeDefaults['output-dir']),
    },
    origins,
    { source: 'builtin', path: ['runtime'] },
  );
  for (const layer of layers) {
    if (layer.value.runtime) {
      runtime = mergeValues(runtime, layer.value.runtime, origins, {
        source: layer.source,
        path: ['runtime'],
      });
    }
  }
  const parsed = parseResolved(runtimeSchema, runtime, origins, [], 'runtime');
  return Object.freeze({
    cwd,
    ...(file ? { file: freezeJson(file) } : {}),
    environment: freezeJson(variables),
    runtime: freezeJson(parsed),
    runtimeOrigins: origins,
  });
}
