import { expect, it, vi } from 'vitest';
import { AsyncCache, createDataClient } from '../packages/data/src/index.js';
import { calendarWindow } from '../packages/data/src/window.js';
import {
  fixedNow,
  fixtureEnvironment,
  fixtureProviders,
  fixtureFetch,
} from './fixtures/upstream.js';

it.each(['github', 'cnb'])(
  'normalizes real %s response shapes and paginates public star totals',
  async (source) => {
    const fetcher = vi.fn(fixtureFetch());
    const client = createDataClient({
      providers: fixtureProviders,
      environment: fixtureEnvironment,
      fetch: fetcher,
      now: () => fixedNow,
    });
    const snapshot = await client.read({ kind: 'profile-stats', source, subject: 'author' });
    expect(snapshot.data.name).toBe('测试用户');
    expect(snapshot.data.metrics.find((value) => value.id === 'stars')?.value).toBe(7);
    expect(snapshot.data.metrics.find((value) => value.id === 'commits')?.value).toBe(9);
    expect(snapshot.data.metrics.find((value) => value.id === 'public-repositories')?.value).toBe(
      7,
    );
    expect(JSON.stringify(snapshot)).not.toContain('not-a-public-field');
    expect(snapshot.permissionScope).not.toContain('token');
    expect(Object.isFrozen(snapshot.data.metrics)).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('page=3'))).toBe(true);
    const again = await client.read({ kind: 'profile-stats', source, subject: 'author' });
    expect(again).toBe(snapshot);
  },
);

it('returns full source-specific activity windows and native intensity levels', async () => {
  const client = createDataClient({
    providers: fixtureProviders,
    environment: fixtureEnvironment,
    fetch: fixtureFetch(),
    now: () => fixedNow,
  });
  const [github, cnb] = await Promise.all(
    ['github', 'cnb'].map((source) => client.read({ kind: 'activity', source, subject: 'author' })),
  );
  expect(github!.data.days).toHaveLength(365);
  expect(cnb!.data.days).toHaveLength(365);
  expect(cnb!.data.days.at(-1)).toMatchObject({ date: '2026-10-22', value: 25, level: 4 });
  expect(cnb!.data.days.at(-2)?.level).toBe(3);
  expect(cnb!.data.metric).toBe('activity-score');
  expect(github!.data.metric).toBe('contributions');
  expect(calendarWindow({}, new Date('2026-10-22T16:30:00Z'), 'Asia/Shanghai').to).toBe(
    '2026-10-23',
  );
  expect(calendarWindow({}, new Date('2026-10-22T16:30:00Z'), 'UTC').to).toBe('2026-10-22');
});

it('does not substitute zero metrics for auth, HTTP or response failures', async () => {
  const withoutToken = createDataClient({
    providers: fixtureProviders,
    environment: {},
    fetch: fixtureFetch(),
  });
  await expect(
    withoutToken.read({ kind: 'profile-stats', source: 'cnb', subject: 'author' }),
  ).rejects.toThrow('CNB_TOKEN');
  const failed = createDataClient({
    providers: fixtureProviders,
    environment: fixtureEnvironment,
    fetch: async () => new Response('', { status: 404 }),
  });
  await expect(
    failed.read({ kind: 'profile-stats', source: 'github', subject: 'author' }),
  ).rejects.toMatchObject({ kind: 'not-found', status: 404 });
  const invalid = createDataClient({
    providers: fixtureProviders,
    environment: fixtureEnvironment,
    fetch: async () => Response.json({}),
  });
  await expect(
    invalid.read({ kind: 'profile-stats', source: 'cnb', subject: 'author' }),
  ).rejects.toThrow('invalid data');
});

it('does not let one aborted subscriber cancel another shared request', async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const upstream = fixtureFetch();
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    await gate;
    return upstream(input, init);
  });
  const client = createDataClient({
    providers: fixtureProviders,
    environment: fixtureEnvironment,
    fetch: fetcher,
    now: () => fixedNow,
  });
  const controller = new AbortController();
  const first = client.read(
    { kind: 'profile-stats', source: 'github', subject: 'author' },
    { signal: controller.signal },
  );
  const second = client.read({ kind: 'profile-stats', source: 'github', subject: 'author' });
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  release();
  await expect(second).resolves.toMatchObject({ data: { name: '测试用户' } });
  expect(fetcher).toHaveBeenCalledTimes(5);
});

it('expires cached values, evicts older entries and retries failures', async () => {
  let clock = 0;
  const cache = new AsyncCache<number>(10, 1, () => clock);
  let calls = 0;
  const load = async () => ++calls;
  expect(await cache.get('a', load)).toBe(1);
  expect(await cache.get('a', load)).toBe(1);
  clock = 11;
  expect(await cache.get('a', load)).toBe(2);
  expect(await cache.get('b', load)).toBe(3);
  expect(await cache.get('a', load)).toBe(4);
  await expect(
    cache.get('failed', async () => {
      throw new Error('failed');
    }),
  ).rejects.toThrow();
  expect(await cache.get('failed', load)).toBe(5);
});
