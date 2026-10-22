import * as z from 'zod';

export const mediaSchema = z.strictObject({
  format: z.enum(['svg', 'png', 'gif', 'webp']),
  theme: z.string().min(1),
  locale: z.string().min(1),
  seed: z.number().int().min(0).max(0xffff_ffff),
});
export const mediaPatchSchema = mediaSchema.partial();
export type MediaOptions = z.output<typeof mediaSchema>;
