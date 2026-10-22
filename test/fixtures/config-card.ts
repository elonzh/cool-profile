import * as z from 'zod';
import { defineCard, bindCard } from '../../packages/card-kit/src/index.js';
import { svgDocument } from '../../packages/graphics/src/index.js';

export const configCard = bindCard(
  'profile/overview',
  defineCard({
    params: z.strictObject({
      source: z.enum(['github', 'cnb']),
      subject: z.string().min(1),
      code: z.string(),
      animate: z.boolean(),
      options: z
        .strictObject({
          count: z.number().int().min(0),
          enabled: z.boolean(),
          tags: z.array(z.string()),
        })
        .nullable(),
    }),
    formats: ['svg', 'png'],
    themes: ['default', 'dark', 'season'],
    locales: ['zh-CN', 'en'],
    defaults(media) {
      return {
        source: 'github' as const,
        code: '001',
        animate: media.format === 'svg',
        options: { count: 5, enabled: true, tags: ['default'] },
      };
    },
    validate(params, media) {
      return media.format === 'png' && params.animate
        ? [{ path: 'animate', message: 'PNG cannot animate' }]
        : [];
    },
    async load() {
      return undefined;
    },
    render() {
      return svgDocument(20, 20, '');
    },
  }),
);
