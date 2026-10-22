import { ConfigurationError, parseSchema } from '@cool-profile/card-kit';
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
    if (['config', 'output', 'output-dir', 'log-level'].includes(name)) {
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
  };
}

export function parsePluginInput(
  card: Card,
  environment: Readonly<Record<string, string | undefined>>,
): PluginInput {
  const { fields, ...settings } = readPluginSettings(environment);
  return { ...settings, input: parseGenerationFields(card, fields, 'PLUGIN') };
}
