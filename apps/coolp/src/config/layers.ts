import * as z from 'zod';
import { ConfigurationError, parseSchema, validatePatch } from '@cool-profile/card-kit';
import type { Card } from '@cool-profile/card-kit';
import type { ConfigDocument, CardPatch, MediaPatch } from './schema.js';
import { documentSchema, runtimeSchema, mediaSchema } from './schema.js';
import { originLabel, isRecord, cloneJson } from './values.js';
import { decodeWire, schemaAt } from './wire.js';

export interface ConfigLayer {
  source: string;
  value: ConfigDocument;
}

export function validateMediaPatch(
  card: Card,
  patch: MediaPatch,
  source: string | ((field: string) => string),
): void {
  for (const [field, allowed] of [
    ['format', card.formats],
    ['theme', card.themes],
    ['locale', card.locales],
  ] as const) {
    const value = patch[field];
    if (value !== undefined && !allowed.some((allowedValue) => allowedValue === value)) {
      const label = typeof source === 'string' ? source : source(field);
      throw new ConfigurationError(label + ': ' + field + ' is not supported by ' + card.id);
    }
  }
}

function validateCardPatch(card: Card, patch: CardPatch, source: string): void {
  if (patch.render) validateMediaPatch(card, patch.render, source + '.render');
  if (patch.params) validatePatch(card.params, patch.params, source + '.params');
}

export function validateLayer(
  registry: ReadonlyMap<string, Card>,
  value: unknown,
  source: string,
): ConfigLayer {
  const document = parseSchema(documentSchema, cloneJson(value), source);
  for (const [id, patch] of Object.entries(document.cards ?? {})) {
    const card = registry.get(id);
    const label = originLabel({ source, path: ['cards', id] });
    if (!card) throw new ConfigurationError(label + ': unknown card ID');
    validateCardPatch(card, patch, label);
  }
  for (const [index, job] of (document.jobs ?? []).entries()) {
    const card = registry.get(job.card);
    const label = originLabel({ source, path: ['jobs', index] });
    if (!card) throw new ConfigurationError(label + ': unknown card ID ' + job.card);
    validateCardPatch(card, job, label);
  }
  return { source, value: document };
}

export function environmentLayers(
  registry: ReadonlyMap<string, Card>,
  environment: Readonly<Record<string, string | undefined>>,
): ConfigLayer[] {
  const runtimeJson = z.toJSONSchema(runtimeSchema);
  const mediaJson = z.toJSONSchema(mediaSchema);
  const variables: { name: string; path: string[]; value: string }[] = [];
  for (const [name, value] of Object.entries(environment)) {
    if (!name.startsWith('COOLP__') || value === undefined) continue;
    const parts = name.slice('COOLP__'.length).split('__');
    if (parts.some((part) => !/^[A-Z][A-Z0-9_]*$/.test(part))) {
      throw new ConfigurationError(name + ': invalid configuration environment variable');
    }
    const path = parts.map((part) => part.toLowerCase().replaceAll('_', '-'));
    if (!['runtime', 'defaults', 'cards'].includes(path[0]!)) {
      throw new ConfigurationError(name + ': unknown configuration scope');
    }
    if (path[0] === 'cards' && path.length !== 1) {
      throw new ConfigurationError(name + ': use COOLP__CARDS with a JSON card mapping');
    }
    variables.push({ name, path, value });
  }
  for (let index = 0; index < variables.length; index++) {
    const current = variables[index]!;
    for (const other of variables.slice(index + 1)) {
      const size = Math.min(current.path.length, other.path.length);
      if (current.path.slice(0, size).every((key, offset) => key === other.path[offset])) {
        throw new ConfigurationError(current.name + ' conflicts with ' + other.name);
      }
    }
  }
  return variables
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .map((variable) => {
      const { name, path, value } = variable;
      const root =
        path[0] === 'runtime' ? runtimeJson : path[0] === 'defaults' ? mediaJson : undefined;
      let schema: z.core.JSONSchema.JSONSchema;
      try {
        schema = root ? schemaAt(root, path.slice(1)) : { type: 'object' };
      } catch (error) {
        if (error instanceof ConfigurationError)
          throw new ConfigurationError(name + ': ' + error.message);
        throw error;
      }
      let fragment: unknown = decodeWire(schema, value, name, root ?? schema);
      for (const key of [...path].reverse()) fragment = { [key]: fragment };
      if (!isRecord(fragment)) throw new ConfigurationError(name + ': invalid configuration');
      return validateLayer(registry, fragment, name);
    });
}
