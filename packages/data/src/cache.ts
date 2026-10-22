export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry).sort(([left], [right]) => left.localeCompare(right, 'en')),
      );
    }
    return entry;
  });
}

export function freezeData<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}

export class AsyncCache<T> {
  private readonly entries = new Map<string, { promise: Promise<T>; expires: number }>();
  constructor(
    private readonly ttlMs: number,
    private readonly capacity: number,
    private readonly clock: () => number = Date.now,
  ) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing && existing.expires > this.clock()) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.promise;
    }
    if (existing) this.entries.delete(key);
    const entry = { promise: Promise.resolve().then(load), expires: Infinity };
    this.entries.set(key, entry);
    while (this.entries.size > this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
    void entry.promise.then(
      () => {
        entry.expires = this.clock() + this.ttlMs;
        if (!this.ttlMs && this.entries.get(key) === entry) this.entries.delete(key);
      },
      () => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
      },
    );
    return entry.promise;
  }
}

export async function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  let abort: () => void = () => {};
  try {
    return await new Promise<T>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      void promise.then(resolve, reject);
    });
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
