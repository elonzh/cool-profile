import { ConfigurationError, parseSchema, validatePatch } from '@cool-profile/card-kit';
import type { Card } from '@cool-profile/card-kit';
import * as z from 'zod';
import { mediaSchema, cardPatchSchema } from '../config/schema.js';
import type { RequestLayer } from '../config/resolve.js';
import type { ConfigValues } from '../config/values.js';
import { decodeWire, schemaAt } from '../config/wire.js';
import { parseConfigurationText } from '../config/parse.js';
import { isRecord } from '../config/values.js';

export function parseGenerationFields(
  card: Card,
  entries: Iterable<readonly [string, string]>,
  source: string,
): RequestLayer {
  const media: ConfigValues = {};
  let params: ConfigValues = {};
  let aggregate: ConfigValues = {};
  const seen = new Set<string>();
  const mediaJson = z.toJSONSchema(mediaSchema);
  for (const [name, value] of entries) {
    if (seen.has(name)) throw new ConfigurationError(source + ': duplicate parameter ' + name);
    seen.add(name);
    const label = source + ': ' + name;
    if (name === 'params') {
      const valueObject = parseConfigurationText(value, label, true);
      if (!isRecord(valueObject)) throw new ConfigurationError(label + ': expected a JSON object');
      aggregate = valueObject;
    } else if (Object.hasOwn(mediaSchema.shape, name)) {
      media[name] = decodeWire(schemaAt(mediaJson, [name]), value, label, mediaJson);
    } else if (Object.hasOwn(card.params.shape, name)) {
      params[name] = decodeWire(
        schemaAt(card.parameterSchema, [name]),
        value,
        label,
        card.parameterSchema,
      );
    } else throw new ConfigurationError(source + ': unknown parameter ' + name);
  }
  for (const key of Object.keys(params)) {
    if (Object.hasOwn(aggregate, key))
      throw new ConfigurationError(source + ': duplicate parameter ' + key);
  }
  params = { ...aggregate, ...params };
  validatePatch(card.params, params, source + '.params');
  const patch = parseSchema(cardPatchSchema, { render: media, params }, source);
  return { source, ...patch };
}
