import * as z from 'zod';
import type { Metric } from './types.js';
import { DataError } from './http.js';

export const count = z.number().int().nonnegative();

export function decode<S extends z.ZodType>(
  schema: S,
  value: unknown,
  source: string,
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new DataError(
      source +
        ' API returned invalid data at ' +
        result.error.issues.map((issue) => issue.path.join('.')).join(', '),
    );
  }
  return result.data;
}

export function metric(id: string, value: number, scope: string): Metric {
  return { id, value, scope, unit: 'count' };
}
