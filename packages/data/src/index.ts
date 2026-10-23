import { createHash } from 'node:crypto';
import { AsyncCache, stableKey, waitFor, freezeData } from './cache.js';
import { DataError, sourceHttp } from './http.js';
import type { ProviderOptions } from './http.js';
import type { DataCapabilities, DataClient, DataKind, DataRequest, Snapshot } from './types.js';
import { loadActivity, loadProfileStats } from './adapters.js';
import { loadLanguages } from './languages.js';
import { loadRepository } from './repositories.js';
import { calendarWindow } from './window.js';

export { AsyncCache, stableKey, waitFor } from './cache.js';
export { DataError } from './http.js';
export { limitConcurrency, defaultProviderConcurrency } from './concurrency.js';
export type { ProviderOptions } from './http.js';

export function createDataClient(options: {
  providers: Readonly<Record<string, ProviderOptions>>;
  environment?: Readonly<Record<string, string | undefined>>;
  cache?: { ttl: number; 'max-entries': number };
  fetch?: typeof fetch;
  now?: () => Date;
}): DataClient {
  const environment = { ...(options.environment ?? process.env) };
  const settings = options.cache ?? { ttl: 300, 'max-entries': 256 };
  const cache = new AsyncCache<unknown>(settings.ttl * 1000, settings['max-entries']);
  const snapshots = new AsyncCache<unknown>(settings.ttl * 1000, settings['max-entries']);
  const now = options.now ?? (() => new Date());
  const providers = new Map(
    Object.entries(options.providers).map(([name, provider]) => {
      const token = provider['token-env'] ? environment[provider['token-env']] : undefined;
      const scope =
        name +
        ':' +
        createHash('sha256')
          .update(stableKey([provider['base-url'], token ?? 'public']))
          .digest('hex');
      return [
        name,
        sourceHttp(name, provider, token, cache, scope, options.fetch ?? fetch),
      ] as const;
    }),
  );
  return {
    async read<K extends DataKind>(
      query: DataRequest<K>,
      controls?: { signal?: AbortSignal; now?: Date },
    ): Promise<Snapshot<DataCapabilities[K]['data']>> {
      controls?.signal?.throwIfAborted();
      const http = providers.get(query.source);
      if (!http || !['github', 'cnb'].includes(query.source)) {
        throw new DataError('Unsupported data source: ' + query.source, 'configuration');
      }
      const collectedAt = new Date((controls?.now ?? now()).getTime());
      const window =
        query.kind === 'activity' || query.kind === 'profile-stats'
          ? calendarWindow(
              query as DataRequest<'activity'>,
              collectedAt,
              query.source === 'cnb' ? 'Asia/Shanghai' : 'UTC',
            )
          : undefined;
      const key = stableKey([http.permissionScope, query, window]);
      const snapshot = snapshots.get(key, async () => {
        const data =
          query.kind === 'activity'
            ? await loadActivity(http, query as DataRequest<'activity'>, collectedAt)
            : query.kind === 'profile-stats'
              ? await loadProfileStats(http, query as DataRequest<'profile-stats'>, collectedAt)
              : query.kind === 'languages'
                ? await loadLanguages(http, query as DataRequest<'languages'>)
                : await loadRepository(http, query as DataRequest<'repository'>);
        return freezeData({
          source: query.source,
          subject: query.subject,
          collectedAt: collectedAt.toISOString(),
          permissionScope: http.permissionScope,
          version: createHash('sha256').update(stableKey(data)).digest('hex'),
          data,
        });
      });
      // Capability dispatch is checked above; this is the single generic erasure boundary.
      return (await waitFor(snapshot, controls?.signal)) as Snapshot<DataCapabilities[K]['data']>;
    },
  };
}
