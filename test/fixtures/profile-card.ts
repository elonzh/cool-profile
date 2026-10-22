import * as z from 'zod';
import { defineCard } from '../../packages/card-kit/src/index.js';
import { svgDocument } from '../../packages/graphics/src/index.js';

export const cards = [
  defineCard({
    id: 'profile/overview',
    params: z.strictObject({
      'github-user': z.string().min(1),
      'cnb-user': z.string().min(1),
    }),
    formats: ['svg'],
    themes: ['default'],
    locales: ['zh-CN', 'en'],
    async load(ctx, params) {
      const [github, cnb] = await Promise.all([
        ctx.data.read({ source: 'github', kind: 'profile-stats', subject: params['github-user'] }),
        ctx.data.read({ source: 'cnb', kind: 'profile-stats', subject: params['cnb-user'] }),
      ]);
      return { github, cnb };
    },
    render(ctx, data) {
      const title = data.github.data.name + ' / ' + data.cnb.data.name + ' / ' + ctx.media.locale;
      return svgDocument(240, 40, '', { title });
    },
  }),
];
