import { AsyncCache, stableKey } from './cache.js';
import { limitConcurrency, defaultProviderConcurrency } from './concurrency.js';

export class DataError extends Error {
  constructor(
    message: string,
    readonly kind: 'configuration' | 'input' | 'not-found' | 'upstream' = 'upstream',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DataError';
  }
}

export interface ProviderOptions {
  'base-url': string;
  'token-env'?: string | undefined;
  concurrency?: number | undefined;
}
export interface SourceHttp {
  source: string;
  permissionScope: string;
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  requireToken(): void;
}

export function sourceHttp(
  source: string,
  provider: ProviderOptions,
  token: string | undefined,
  cache: AsyncCache<unknown>,
  permissionScope: string,
  fetcher: typeof fetch,
): SourceHttp {
  const schedule = limitConcurrency(provider.concurrency ?? defaultProviderConcurrency);
  const request = (method: string, path: string, body?: unknown) => {
    const url = provider['base-url'].replace(/\/$/, '') + path;
    return cache.get(stableKey([permissionScope, method, url, body]), () =>
      schedule(async () => {
        let response: Response;
        try {
          response = await fetcher(url, {
            method,
            redirect: 'error',
            signal: AbortSignal.timeout(30_000),
            headers: {
              Accept:
                source === 'cnb' ? 'application/vnd.cnb.api+json' : 'application/vnd.github+json',
              'User-Agent': 'cool-profile',
              ...(token ? { Authorization: 'Bearer ' + token } : {}),
              ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
        } catch {
          throw new DataError(source + ' API request failed');
        }
        if (!response.ok) {
          throw new DataError(
            source + ' API returned HTTP ' + response.status,
            response.status === 404 ? 'not-found' : 'upstream',
            response.status,
          );
        }
        try {
          return await response.json();
        } catch {
          throw new DataError(source + ' API returned invalid JSON');
        }
      }),
    );
  };
  return {
    source,
    permissionScope,
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    requireToken() {
      if (!token)
        throw new DataError(
          'Set ' + (provider['token-env'] ?? source.toUpperCase() + '_TOKEN'),
          'configuration',
        );
    },
  };
}
