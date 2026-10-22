import * as z from 'zod';
import type { DataClient } from '@cool-profile/data/types';
import type { Graphic, MediaFormat, MediaOptions } from '@cool-profile/graphics/types';
import { ConfigurationError, validatePatch } from './schema.js';

export const cardIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const parameterPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const marker = Symbol.for('coolp.card');
const reserved = new Set([
  'card',
  'format',
  'theme',
  'locale',
  'seed',
  'config',
  'output',
  'output-dir',
  'host',
  'port',
  'log-level',
  'help',
  'version',
  'dry-run',
]);
const mediaFormats = new Set<MediaFormat>(['svg', 'png', 'gif', 'webp']);

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface LoadContext {
  data: DataClient;
  signal: AbortSignal;
  now: Date;
}

export interface RenderContext {
  media: Readonly<MediaOptions>;
}

export interface CardDefinition<S extends z.ZodObject, Data> {
  id: string;
  params: S;
  formats: readonly MediaFormat[];
  themes: readonly string[];
  locales: readonly string[];
  defaults?(media: MediaOptions): Partial<z.output<S>>;
  validate?(params: z.output<S>, media: MediaOptions): readonly ValidationIssue[];
  load(ctx: LoadContext, params: z.output<S>): Promise<Data>;
  render(ctx: RenderContext, data: Data, params: z.output<S>): Graphic | Promise<Graphic>;
}

export interface Card {
  readonly [marker]: true;
  readonly id: string;
  readonly params: z.ZodObject;
  readonly parameterSchema: z.core.JSONSchema.JSONSchema;
  readonly formats: readonly MediaFormat[];
  readonly themes: readonly string[];
  readonly locales: readonly string[];
  defaults(media: MediaOptions): Record<string, unknown>;
  validate(params: Record<string, unknown>, media: MediaOptions): readonly ValidationIssue[];
  generate(
    loadContext: LoadContext,
    renderContext: RenderContext,
    params: Record<string, unknown>,
  ): Promise<Graphic>;
}

function nonemptyUnique(values: readonly string[], field: string): void {
  if (!values.length || values.some((value) => !value) || new Set(values).size !== values.length) {
    throw new ConfigurationError(field + ' must contain unique nonempty values');
  }
}

function parameterMetadata(schema: z.ZodObject): z.core.JSONSchema.JSONSchema {
  const visited = new WeakSet<object>();
  function check(value: unknown): void {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (value instanceof z.ZodType) {
      const definition = value.def;
      if ('coerce' in definition && definition.coerce) {
        throw new ConfigurationError('Card params cannot coerce input');
      }
      if (['default', 'prefault', 'catch'].includes(definition.type)) {
        throw new ConfigurationError('Declare parameter defaults in card.defaults');
      }
      if (['transform', 'pipe'].includes(definition.type)) {
        throw new ConfigurationError('Card params cannot transform input');
      }
      if (value instanceof z.ZodLazy) check(value.unwrap());
      check(definition);
      return;
    }
    for (const child of Object.values(value)) check(child);
  }
  check(schema);
  const input = z.toJSONSchema(schema, { io: 'input' });
  const output = z.toJSONSchema(schema, { io: 'output' });
  if (input.additionalProperties !== false) {
    throw new ConfigurationError('Card params must use z.strictObject');
  }
  if (JSON.stringify(input) !== JSON.stringify(output)) {
    throw new ConfigurationError('Card params cannot coerce, transform, or strip input');
  }
  for (const key of Object.keys(schema.shape)) {
    if (!parameterPattern.test(key) || reserved.has(key)) {
      throw new ConfigurationError('Invalid or reserved card parameter: ' + key);
    }
  }
  return input;
}

export function defineCard<S extends z.ZodObject, Data>(definition: CardDefinition<S, Data>): Card {
  const { id } = definition;
  if (!cardIdPattern.test(id)) throw new ConfigurationError('Invalid card ID: ' + id);
  for (const [name, values] of Object.entries({
    formats: definition.formats,
    themes: definition.themes,
    locales: definition.locales,
  }))
    nonemptyUnique(values, id + '.' + name);
  if (definition.formats.some((format) => !mediaFormats.has(format))) {
    throw new ConfigurationError(id + ': unsupported media format');
  }
  if (!definition.themes.includes('default') || !definition.locales.includes('zh-CN')) {
    throw new ConfigurationError(id + ': default theme and zh-CN locale are required');
  }
  const parameterSchema = parameterMetadata(definition.params);
  const defaults = (media: MediaOptions): Record<string, unknown> => {
    const value = definition.defaults?.(media) ?? {};
    validatePatch(definition.params, value, id + '.defaults');
    return value;
  };
  for (const format of definition.formats) {
    defaults({ format, theme: 'default', locale: 'zh-CN', seed: 0 });
  }
  return Object.freeze({
    [marker]: true,
    id,
    params: definition.params,
    parameterSchema,
    formats: Object.freeze([...definition.formats]),
    themes: Object.freeze([...definition.themes]),
    locales: Object.freeze([...definition.locales]),
    defaults,
    validate(params, media) {
      return definition.validate?.(definition.params.parse(params), media) ?? [];
    },
    async generate(loadContext, renderContext, rawParams) {
      const params = definition.params.parse(rawParams);
      const data = await definition.load(loadContext, params);
      return definition.render(renderContext, data, params);
    },
  } satisfies Card);
}

export function isCard(value: unknown): value is Card {
  return typeof value === 'object' && value !== null && Reflect.get(value, marker) === true;
}

export function createCardRegistry(cards: readonly Card[]): ReadonlyMap<string, Card> {
  const registry = new Map<string, Card>();
  for (const card of cards) {
    if (!isCard(card)) throw new ConfigurationError('Card entries must be created with defineCard');
    if (registry.has(card.id)) throw new ConfigurationError('Duplicate card ID: ' + card.id);
    registry.set(card.id, card);
  }
  return registry;
}
