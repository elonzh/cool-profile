import { ConfigurationError } from '@cool-profile/card-kit';
import type * as z from 'zod';

export type ConfigValues = Record<string, unknown>;
export interface Origin {
  source: string;
  path: readonly (string | number)[];
}
export type Origins = Map<string, Origin>;

export function pointer(path: readonly (string | number)[]): string {
  return path.map((key) => '/' + String(key).replaceAll('~', '~0').replaceAll('/', '~1')).join('');
}

export function isRecord(value: unknown): value is ConfigValues {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

export function cloneJson(value: unknown, active = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || active.has(value)) {
    throw new ConfigurationError('Configuration must contain finite JSON values without cycles');
  }
  active.add(value);
  let result: unknown;
  if (Array.isArray(value)) result = value.map((entry) => cloneJson(entry, active));
  else if (isRecord(value)) {
    result = Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJson(entry, active)]),
    );
  } else throw new ConfigurationError('Configuration must contain plain JSON objects');
  active.delete(value);
  return result;
}

export function mergeValues(
  base: ConfigValues,
  patch: ConfigValues,
  origins: Origins,
  source: Origin,
  targetPath: readonly string[] = [],
): ConfigValues {
  const result: ConfigValues = Object.assign(Object.create(null), base);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const path = [...targetPath, key];
    const location = { source: source.source, path: [...source.path, key] };
    const previous: unknown = Object.hasOwn(result, key) ? result[key] : undefined;
    if (isRecord(value)) {
      result[key] = mergeValues(isRecord(previous) ? previous : {}, value, origins, location, path);
      origins.set(pointer(path), location);
    } else {
      const prefix = pointer(path);
      for (const existing of origins.keys()) {
        if (existing === prefix || existing.startsWith(prefix + '/')) origins.delete(existing);
      }
      result[key] = cloneJson(value);
      origins.set(prefix, location);
    }
  }
  return result;
}

export function freezeJson<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

export function nearestOrigin(
  origins: Origins,
  path: readonly (string | number)[],
): Origin | undefined {
  for (let size = path.length; size >= 0; size--) {
    const found = origins.get(pointer(path.slice(0, size)));
    if (found) return { source: found.source, path: [...found.path, ...path.slice(size)] };
  }
  return undefined;
}

export function originLabel(origin: Origin): string {
  const fields = origin.path
    .map((key) =>
      typeof key === 'number'
        ? '[' + key + ']'
        : /^[a-z][a-z0-9-]*$/.test(key)
          ? '.' + key
          : '[' + JSON.stringify(key) + ']',
    )
    .join('');
  return origin.source + (fields ? ': ' + fields.replace(/^\./, '') : '');
}

export function parseResolved<T extends z.ZodType>(
  schema: T,
  input: unknown,
  origins: Origins,
  prefix: readonly string[],
  fallback: string,
): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ConfigurationError(
    result.error.issues
      .map((issue) => {
        const path = [
          ...prefix,
          ...issue.path.map((key) => (typeof key === 'symbol' ? String(key) : key)),
        ];
        const origin = nearestOrigin(origins, path) ?? { source: fallback, path };
        return originLabel(origin) + ': ' + issue.message;
      })
      .join('; '),
  );
}
