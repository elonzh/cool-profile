import { parseDocument } from 'yaml';
import { ConfigurationError } from './schema.js';

export function parseConfigurationText(text: string, source: string, json = false): unknown {
  if (json) {
    try {
      JSON.parse(text);
    } catch {
      throw new ConfigurationError(source + ': invalid JSON');
    }
  }
  const document = parseDocument(text, {
    strict: true,
    uniqueKeys: true,
    prettyErrors: false,
    schema: 'core',
  });
  const issues = [...document.errors, ...document.warnings];
  if (issues.length) {
    throw new ConfigurationError(source + ': ' + issues.map((error) => error.message).join('; '));
  }
  try {
    return cloneJson(document.toJS({ maxAliasCount: 100 }));
  } catch (error) {
    if (error instanceof ConfigurationError)
      throw new ConfigurationError(source + ': ' + error.message);
    throw new ConfigurationError(source + ': invalid YAML structure');
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
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
