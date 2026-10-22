import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { createCardRegistry, defineCard, validatePatch } from '../packages/card-kit/src/index.js';
import { svgDocument } from '../packages/graphics/src/index.js';
import type { CardDefinition } from '../packages/card-kit/src/index.js';
import type { DataClient } from '../packages/data/src/types.js';
import { cards as profileCards } from './fixtures/profile-card.js';

const params = z.strictObject({
  subject: z.string().min(1),
  settings: z.strictObject({ count: z.number().int().positive(), active: z.boolean() }),
});

function definition(id = 'profile/overview'): CardDefinition<typeof params, string> {
  return {
    id,
    params,
    formats: ['svg', 'png'],
    themes: ['default', 'dark'],
    locales: ['zh-CN', 'en'],
    async load(_ctx, input) {
      return input.subject;
    },
    render(_ctx, subject) {
      return svgDocument(100, 20, '', { title: subject });
    },
  };
}

describe('card definitions', () => {
  it('loads multiple sources through the supplied client and renders their snapshots', async () => {
    const read = vi.fn<DataClient['read']>();
    for (const source of ['github', 'cnb']) {
      read.mockResolvedValueOnce({
        source,
        subject: 'elonzh',
        collectedAt: '2026-10-22T00:00:00Z',
        version: 'fixture',
        permissionScope: 'public',
        data: { name: source + ' & profile', url: '', metrics: [] },
      });
    }
    const graphic = await profileCards[0]!.generate(
      {
        data: { read },
        signal: new AbortController().signal,
        now: new Date('2026-10-22T00:00:00Z'),
      },
      { media: { format: 'svg', theme: 'default', locale: 'zh-CN', seed: 0 } },
      { 'github-user': 'elonzh', 'cnb-user': 'elonzh' },
    );
    expect(read.mock.calls.map(([request]) => request.source)).toEqual(['github', 'cnb']);
    expect(graphic.svg).toContain('github &amp; profile / cnb &amp; profile / zh-CN');
  });

  it('accepts source-independent namespaced IDs and preserves parameter metadata', () => {
    const card = defineCard(definition());
    expect(card.id).toBe('profile/overview');
    expect(card.parameterSchema.properties).toHaveProperty('subject');
    expect(card.formats[0]).toBe('svg');
  });

  it.each(['../snake', 'snake.svg', 'bilibili//card', '/snake', 'snake/'])(
    'rejects ambiguous or invalid card ID %s',
    (id) => {
      expect(() => defineCard(definition(id))).toThrow('Invalid card ID');
    },
  );

  it('rejects duplicate IDs rather than replacing a card', () => {
    expect(() => createCardRegistry([defineCard(definition()), defineCard(definition())])).toThrow(
      'Duplicate card ID',
    );
  });

  it('rejects reserved option names and implicit input mutation', () => {
    const base = definition();
    const original = {
      id: base.id,
      formats: base.formats,
      themes: base.themes,
      locales: base.locales,
      async load() {
        return '';
      },
      render() {
        return svgDocument(100, 20, '');
      },
    };
    expect(() =>
      defineCard({ ...original, params: z.strictObject({ locale: z.string() }) }),
    ).toThrow('reserved');
    expect(() =>
      defineCard({ ...original, params: z.strictObject({ subject: z.string().default('x') }) }),
    ).toThrow('card.defaults');
    expect(() =>
      defineCard({ ...original, params: z.strictObject({ subject: z.coerce.string() }) }),
    ).toThrow('coerce');
    expect(() => defineCard({ ...original, params: z.object({ subject: z.string() }) })).toThrow(
      'strictObject',
    );
  });

  it('validates format-dependent defaults without requiring the remaining input', () => {
    const card = defineCard({
      ...definition(),
      defaults(media) {
        return { settings: { count: media.format === 'svg' ? 1 : 2, active: false } };
      },
    });
    expect(card.defaults({ format: 'png', locale: 'zh-CN', theme: 'default', seed: 0 })).toEqual({
      settings: { count: 2, active: false },
    });
    expect(() =>
      defineCard({ ...definition(), defaults: () => ({ settings: { count: -1, active: false } }) }),
    ).toThrow('defaults');
  });
});

describe('partial configuration validation', () => {
  it('allows recursively absent fields before overlay resolution', () => {
    expect(() =>
      validatePatch(params, { settings: { active: false } }, 'environment'),
    ).not.toThrow();
    expect(params.safeParse({ settings: { active: false } }).success).toBe(false);
  });

  it.each([
    { settings: { count: '3' } },
    { settings: { active: 'false' } },
    { settings: null },
    { subject: '' },
    { typo: 'value' },
  ])('rejects invalid provided fields rather than ignoring them', (input) => {
    expect(() => validatePatch(params, input, 'coolp.yaml')).toThrow('coolp.yaml');
  });

  it('accepts a partial object in a union only if one branch can still be satisfied', () => {
    const schema = z.strictObject({
      value: z.union([z.strictObject({ count: z.number(), active: z.boolean() }), z.string()]),
    });
    expect(() => validatePatch(schema, { value: { active: false } }, 'input')).not.toThrow();
    expect(() => validatePatch(schema, { value: { active: 'false' } }, 'input')).toThrow();
  });
});
