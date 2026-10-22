import { extname, resolve } from 'node:path';
import { ConfigurationError, parseSchema, validatePatch } from '@cool-profile/card-kit';
import type { Card } from '@cool-profile/card-kit';
import type { MediaOptions } from '@cool-profile/graphics/types';
import { cardPatchSchema, mediaSchema } from './schema.js';
import type { CardPatch, Job } from './schema.js';
import type { Configuration } from './load.js';
import { validateMediaPatch } from './layers.js';
import { freezeJson, mergeValues, nearestOrigin, originLabel, parseResolved } from './values.js';
import type { ConfigValues, Origin, Origins } from './values.js';

export class CardNotFoundError extends Error {
  constructor(id: string) {
    super('Unknown card: ' + id);
    this.name = 'CardNotFoundError';
  }
}

export interface RequestLayer extends CardPatch {
  source: string;
  renderPath?: readonly (string | number)[];
  paramsPath?: readonly (string | number)[];
}
export interface ResolvedRequest {
  readonly id: string;
  readonly media: Readonly<MediaOptions>;
  readonly params: Readonly<ConfigValues>;
  readonly origins: Readonly<Record<string, Origin>>;
}

export function requireCard(registry: ReadonlyMap<string, Card>, id: string): Card {
  const card = registry.get(id);
  if (!card) throw new CardNotFoundError(id);
  return card;
}

function collectLayers(
  configuration: Configuration,
  id: string,
  jobIndex: number | undefined,
): RequestLayer[] {
  const layers: RequestLayer[] = [];
  const appendDefaults = (source: string, render: CardPatch['render']) => {
    if (render) layers.push({ source, render, renderPath: ['defaults'] });
  };
  const appendCard = (source: string, patch: CardPatch | undefined) => {
    if (patch)
      layers.push({
        ...patch,
        source,
        renderPath: ['cards', id, 'render'],
        paramsPath: ['cards', id, 'params'],
      });
  };
  const file = configuration.file;
  if (file) {
    appendDefaults(file.source, file.value.defaults);
    appendCard(file.source, file.value.cards?.[id]);
    if (jobIndex !== undefined) {
      const job = file.value.jobs?.[jobIndex];
      if (!job || job.card !== id) throw new ConfigurationError('Invalid batch job selection');
      layers.push({
        source: file.source,
        ...(job.render ? { render: job.render } : {}),
        ...(job.params ? { params: job.params } : {}),
        renderPath: ['jobs', jobIndex, 'render'],
        paramsPath: ['jobs', jobIndex, 'params'],
      });
    }
  } else if (jobIndex !== undefined)
    throw new ConfigurationError('Batch requires a configuration file');
  for (const layer of configuration.environment) appendDefaults(layer.source, layer.value.defaults);
  for (const layer of configuration.environment) appendCard(layer.source, layer.value.cards?.[id]);
  return layers;
}

export function resolveCardRequest(
  configuration: Configuration,
  registry: ReadonlyMap<string, Card>,
  id: string,
  options: { jobIndex?: number; inputs?: readonly RequestLayer[] } = {},
): ResolvedRequest {
  const card = requireCard(registry, id);
  const inputs = (options.inputs ?? []).map((input) => {
    const patch = parseSchema(
      cardPatchSchema,
      {
        ...(input.render !== undefined ? { render: input.render } : {}),
        ...(input.params !== undefined ? { params: input.params } : {}),
      },
      input.source,
    );
    if (patch.render) validateMediaPatch(card, patch.render, input.source);
    if (patch.params) validatePatch(card.params, patch.params, input.source);
    return { ...input, ...patch };
  });
  const layers = [...collectLayers(configuration, id, options.jobIndex), ...inputs];
  const origins: Origins = new Map();
  let mediaValues = mergeValues(
    {},
    {
      format: card.formats[0]!,
      theme: 'default',
      locale: 'zh-CN',
      seed: 0,
    },
    origins,
    { source: 'builtin', path: [] },
    ['media'],
  );
  for (const layer of layers) {
    if (layer.render)
      mediaValues = mergeValues(
        mediaValues,
        layer.render,
        origins,
        {
          source: layer.source,
          path: layer.renderPath ?? ['render'],
        },
        ['media'],
      );
  }
  const media = parseResolved(mediaSchema, mediaValues, origins, ['media'], 'request ' + id);
  validateMediaPatch(card, media, (field) =>
    originLabel(nearestOrigin(origins, ['media', field])!),
  );
  let paramsValues = mergeValues(
    {},
    card.defaults(media),
    origins,
    {
      source: id + '.defaults',
      path: [],
    },
    ['params'],
  );
  origins.set('/params', { source: 'request ' + id, path: ['params'] });
  for (const layer of layers) {
    if (layer.params) {
      paramsValues = mergeValues(
        paramsValues,
        layer.params,
        origins,
        {
          source: layer.source,
          path: layer.paramsPath ?? ['params'],
        },
        ['params'],
      );
      origins.set('/params', { source: layer.source, path: layer.paramsPath ?? ['params'] });
    }
  }
  const params = parseResolved(card.params, paramsValues, origins, ['params'], 'request ' + id);
  const issues = card.validate(params, media);
  if (issues.length) {
    throw new ConfigurationError(
      issues
        .map((issue) => {
          const origin = nearestOrigin(origins, ['params', ...issue.path.split('.')]);
          return (origin ? originLabel(origin) : 'request ' + id) + ': ' + issue.message;
        })
        .join('; '),
    );
  }
  return freezeJson({ id, media, params, origins: Object.fromEntries(origins) });
}

export function resolveOutput(
  configuration: Configuration,
  request: ResolvedRequest,
  options: { output?: string; batch?: boolean } = {},
): string {
  if (options.output === '') throw new ConfigurationError('Output path cannot be empty');
  if (options.output === '-') {
    if (options.batch) throw new ConfigurationError('Batch output cannot use stdout');
    return '-';
  }
  const output = options.output ?? request.id + '.' + request.media.format;
  const extension = extname(output).slice(1).toLowerCase();
  if (extension && extension !== request.media.format) {
    throw new ConfigurationError('Output extension conflicts with format: ' + request.media.format);
  }
  const base =
    options.batch || options.output === undefined
      ? configuration.runtime['output-dir']
      : configuration.cwd;
  return resolve(base, output);
}

export function resolveBatch(
  configuration: Configuration,
  registry: ReadonlyMap<string, Card>,
  inputs: readonly RequestLayer[] = [],
): readonly { request: ResolvedRequest; output: string; job: Job }[] {
  const jobs = configuration.file?.value.jobs;
  if (!jobs?.length) throw new ConfigurationError('Batch requires a configuration file with jobs');
  if (inputs.some((input) => input.params && Object.keys(input.params).length)) {
    throw new ConfigurationError(
      'Batch accepts public render options; set card parameters in jobs',
    );
  }
  const outputs = new Set<string>();
  return jobs.map((job, jobIndex) => {
    const request = resolveCardRequest(configuration, registry, job.card, { jobIndex, inputs });
    const output = resolveOutput(configuration, request, {
      batch: true,
      ...(job.output ? { output: job.output } : {}),
    });
    if (outputs.has(output)) throw new ConfigurationError('Duplicate batch output: ' + output);
    outputs.add(output);
    return { request, output, job };
  });
}
