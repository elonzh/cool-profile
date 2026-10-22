import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  createDataClient,
  AsyncCache,
  stableKey,
  waitFor,
  limitConcurrency,
} from '@cool-profile/data';
import type { DataClient } from '@cool-profile/data/types';
import { createTextRenderer } from '@cool-profile/graphics';
import { encodeGraphic } from '@cool-profile/graphics/encode';
import type { Media } from '@cool-profile/graphics/encode';
import type { Card } from '@cool-profile/card-kit';
import { requireCard } from './config/index.js';
import type { Configuration, ResolvedRequest } from './config/index.js';
import metadata from '../package.json' with { type: 'json' };

export const version = metadata.version;
export interface RenderedMedia extends Media {
  etag: string;
}
export interface Renderer {
  render(request: ResolvedRequest, signal?: AbortSignal): Promise<RenderedMedia>;
}

export async function createRenderer(options: {
  registry: ReadonlyMap<string, Card>;
  configuration: Configuration;
  environment?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof fetch;
  now?: () => Date;
}): Promise<Renderer> {
  const { configuration, registry } = options;
  const font = await readFile(new URL('../assets/fonts/NotoSansSC.ttf', import.meta.url));
  const emoji = await readFile(new URL('../assets/fonts/NotoEmoji.ttf', import.meta.url));
  const text = createTextRenderer(font, [emoji]);
  const fontVersion = createHash('sha256').update(font).update(emoji).digest('hex');
  const data = createDataClient({
    providers: configuration.runtime.providers,
    cache: configuration.runtime.cache,
    ...(options.environment ? { environment: options.environment } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  const mediaCache = new AsyncCache<RenderedMedia>(
    configuration.runtime.cache.ttl * 1000,
    configuration.runtime.cache['max-entries'],
  );
  const encode = limitConcurrency(configuration.runtime['render-concurrency']);
  return {
    async render(request, signal) {
      signal?.throwIfAborted();
      const card = requireCard(registry, request.id);
      const revisions: string[] = [];
      const timestamp = (options.now?.() ?? new Date()).getTime();
      const tracking: DataClient = {
        async read(query, controls) {
          const snapshot = await data.read(query, {
            ...controls,
            now: new Date(timestamp),
            ...(signal ? { signal } : {}),
          });
          revisions.push(stableKey([snapshot.source, snapshot.permissionScope, snapshot.version]));
          return snapshot;
        },
      };
      const draw = await card.prepare(
        {
          data: tracking,
          now: new Date(timestamp),
          signal: signal ?? new AbortController().signal,
        },
        request.params,
      );
      signal?.throwIfAborted();
      const key = stableKey([
        version,
        fontVersion,
        request.id,
        request.media,
        request.params,
        revisions.sort(),
      ]);
      return waitFor(
        mediaCache.get(key, () =>
          encode(async () => {
            const graphic = await draw({ media: request.media, text });
            const media = await encodeGraphic(graphic, request.media.format);
            return {
              ...media,
              etag: '"' + createHash('sha256').update(media.bytes).digest('hex') + '"',
            };
          }),
        ),
        signal,
      );
    },
  };
}
