import type * as z from 'zod';
import { ConfigurationError } from './schema.js';
import { parseConfigurationText, isRecord } from './text.js';

export type JsonSchema = z.core.JSONSchema.JSONSchema;

export function schemaAt(root: JsonSchema, path: readonly string[]): JsonSchema {
  let schema = root;
  for (const key of path) {
    schema = dereference(schema, root);
    const property: unknown =
      schema.properties && Object.hasOwn(schema.properties, key)
        ? schema.properties[key]
        : undefined;
    const next: unknown = property ?? schema.additionalProperties;
    if (!isRecord(next))
      throw new ConfigurationError('Unknown configuration field: ' + path.join('.'));
    schema = next;
  }
  return dereference(schema, root);
}

function dereference(schema: JsonSchema, root: JsonSchema): JsonSchema {
  const visited = new Set<string>();
  while (typeof schema.$ref === 'string') {
    const reference = schema.$ref;
    if (!reference.startsWith('#/') || visited.has(reference)) {
      throw new ConfigurationError('Unsupported parameter schema reference');
    }
    visited.add(reference);
    let current: unknown = root;
    for (const key of reference.slice(2).split('/')) {
      const decoded = key.replaceAll('~1', '/').replaceAll('~0', '~');
      current = isRecord(current) && Object.hasOwn(current, decoded) ? current[decoded] : undefined;
    }
    if (!isRecord(current)) throw new ConfigurationError('Invalid parameter schema reference');
    schema = current;
  }
  return schema;
}

function schemaTypes(schema: JsonSchema, root: JsonSchema): Set<string> {
  schema = dereference(schema, root);
  if (typeof schema.type === 'string') return new Set([schema.type]);
  if (Array.isArray(schema.type)) return new Set(schema.type);
  const branches = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(branches)) {
    return new Set(
      branches.flatMap((branch) =>
        typeof branch === 'object' && branch !== null ? [...schemaTypes(branch, root)] : [],
      ),
    );
  }
  if (Object.hasOwn(schema, 'const')) {
    return new Set([schema.const === null ? 'null' : typeof schema.const]);
  }
  return new Set();
}

export function decodeWire(
  schema: JsonSchema,
  value: string,
  source: string,
  root: JsonSchema = schema,
): unknown {
  const types = schemaTypes(schema, root);
  if (types.size === 1 && types.has('string')) return value;
  if (types.size === 1 && types.has('boolean')) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new ConfigurationError(source + ': expected true or false');
  }
  if (types.size && [...types].every((type) => type === 'number' || type === 'integer')) {
    if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value) || !Number.isFinite(Number(value))) {
      throw new ConfigurationError(source + ': expected a decimal number');
    }
    return Number(value);
  }
  return parseConfigurationText(value, source, true);
}
