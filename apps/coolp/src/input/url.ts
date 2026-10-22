import { ConfigurationError, cardIdPattern } from '@cool-profile/card-kit';
import type { Card } from '@cool-profile/card-kit';
import { CardNotFoundError, requireCard } from '../config/resolve.js';
import type { RequestLayer } from '../config/resolve.js';
import { parseGenerationFields } from './fields.js';

export function parseCardUrl(
  raw: string,
  registry: ReadonlyMap<string, Card>,
): { id: string; input: RequestLayer } {
  if (!raw.startsWith('/v1/cards/')) throw new CardNotFoundError(raw.split('?')[0]!);
  const question = raw.indexOf('?');
  const path = question < 0 ? raw : raw.slice(0, question);
  const query = question < 0 ? '' : raw.slice(question + 1);
  if (raw.includes('#')) throw new ConfigurationError('Image URL cannot contain a fragment');
  let segments: string[];
  try {
    segments = path
      .slice('/v1/cards/'.length)
      .split('/')
      .map((segment) => decodeURIComponent(segment));
  } catch {
    throw new ConfigurationError('Invalid card URL encoding');
  }
  if (
    segments.some(
      (segment) => !segment || segment.includes('/') || segment === '.' || segment === '..',
    )
  ) {
    throw new ConfigurationError('Invalid card ID path');
  }
  const last = segments.at(-1)!;
  const dot = last.lastIndexOf('.');
  const format = dot >= 0 ? last.slice(dot + 1) : undefined;
  if (dot >= 0) segments[segments.length - 1] = last.slice(0, dot);
  const id = segments.join('/');
  if (!cardIdPattern.test(id)) throw new ConfigurationError('Invalid card ID path');
  const card = requireCard(registry, id);
  const fields = [...new URLSearchParams(query)];
  if (fields.some(([key]) => key === 'format')) {
    throw new ConfigurationError('Select URL format with the file extension');
  }
  if (format !== undefined) fields.push(['format', format]);
  const input = parseGenerationFields(card, fields, 'URL');
  return { id, input };
}
