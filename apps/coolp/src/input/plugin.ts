import { ConfigurationError, parseSchema } from '@cool-profile/card-kit';
import * as z from 'zod';
import type { ProviderOptions } from '@cool-profile/data';
import { parseConfigurationText } from '../config/parse.js';
import type { Card } from '@cool-profile/card-kit';
import { runtimePatchSchema } from '../config/schema.js';
import type { RuntimePatch } from '../config/schema.js';
import type { RequestLayer } from '../config/resolve.js';
import { parseGenerationFields } from './fields.js';

export interface PluginInput {
  input: RequestLayer;
  runtime: RuntimePatch;
  config?: string;
  output?: string;
  tokens?: Readonly<Record<string, string>>;
}
export interface PluginSettings extends Omit<PluginInput, 'input'> {
  fields: [string, string][];
}

export function readPluginSettings(
  environment: Readonly<Record<string, string | undefined>>,
): PluginSettings {
  const fields: [string, string][] = [];
  const controls = new Map<string, string>();
  const names = new Set<string>();
  for (const [variable, value] of Object.entries(environment)) {
    if (!variable.startsWith('PLUGIN_') || value === undefined) continue;
    const suffix = variable.slice('PLUGIN_'.length);
    if (!/^[A-Z][A-Z0-9_-]*$/.test(suffix)) {
      throw new ConfigurationError(variable + ': invalid plugin parameter name');
    }
    const name = suffix.toLowerCase().replaceAll('_', '-');
    if (names.has(name)) throw new ConfigurationError('Duplicate plugin parameter: ' + name);
    names.add(name);
    if (name === 'card') continue;
    if (['config', 'output', 'output-dir', 'log-level', 'tokens'].includes(name)) {
      if (!value) throw new ConfigurationError(variable + ': cannot be empty');
      controls.set(name, value);
    } else fields.push([name, value]);
  }
  const runtime = parseSchema(
    runtimePatchSchema,
    {
      ...(controls.has('output-dir') ? { 'output-dir': controls.get('output-dir') } : {}),
      ...(controls.has('log-level') ? { 'log-level': controls.get('log-level') } : {}),
    },
    'PLUGIN',
  );
  return {
    fields,
    runtime,
    ...(controls.has('config') ? { config: controls.get('config')! } : {}),
    ...(controls.has('output') ? { output: controls.get('output')! } : {}),
    ...(controls.has('tokens')
      ? {
          tokens: parseSchema(
            z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), z.string().min(1)),
            parseConfigurationText(controls.get('tokens')!, 'PLUGIN_TOKENS', true),
            'PLUGIN_TOKENS',
          ),
        }
      : {}),
  };
}

export function pluginEnvironment(
  settings: PluginSettings,
  providers: Readonly<Record<string, ProviderOptions>>,
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  const result = { ...environment };
  for (const [source, token] of Object.entries(settings.tokens ?? {})) {
    const variable = providers[source]?.['token-env'];
    if (!variable)
      throw new ConfigurationError(
        'PLUGIN_TOKENS: provider ' + source + ' needs a configured token-env',
      );
    result[variable] = token;
  }
  return result;
}

export function parsePluginInput(
  card: Card,
  environment: Readonly<Record<string, string | undefined>>,
): PluginInput {
  const { fields, ...settings } = readPluginSettings(environment);
  return { ...settings, input: parseGenerationFields(card, fields, 'PLUGIN') };
}
