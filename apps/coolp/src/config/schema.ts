import * as z from 'zod';

export const mediaSchema = z.strictObject({
  format: z.enum(['svg', 'png', 'gif', 'webp']),
  theme: z.string().min(1),
  locale: z.string().min(1),
  seed: z.number().int().min(0).max(0xffff_ffff),
});
export const mediaPatchSchema = mediaSchema.partial();

const serverSchema = z.strictObject({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
});
const cacheSchema = z.strictObject({
  ttl: z.number().int().min(0),
  'max-entries': z.number().int().positive(),
});
const providerSchema = z.strictObject({
  'base-url': z.url().refine(
    (value) => {
      try {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    },
    {
      message: 'Expected an HTTP API base URL without credentials, query or fragment',
    },
  ),
  'token-env': z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .optional(),
});
const runtimeFields = {
  'log-level': z.enum(['debug', 'info', 'warn', 'error', 'silent']),
  'output-dir': z.string().min(1),
  'render-concurrency': z.number().int().min(1).max(8),
};
export const runtimeSchema = z.strictObject({
  ...runtimeFields,
  server: serverSchema,
  cache: cacheSchema,
  providers: z.record(z.string().min(1), providerSchema),
});
export const runtimePatchSchema = z.strictObject({
  'log-level': runtimeFields['log-level'].optional(),
  'output-dir': runtimeFields['output-dir'].optional(),
  'render-concurrency': runtimeFields['render-concurrency'].optional(),
  server: serverSchema.partial().optional(),
  cache: cacheSchema.partial().optional(),
  providers: z.record(z.string().min(1), providerSchema.partial()).optional(),
});
export const cardPatchSchema = z.strictObject({
  render: mediaPatchSchema.optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});
export const jobSchema = cardPatchSchema.extend({
  card: z.string().min(1),
  output: z.string().min(1).optional(),
});
export const documentSchema = z.strictObject({
  runtime: runtimePatchSchema.optional(),
  defaults: mediaPatchSchema.optional(),
  cards: z.record(z.string(), cardPatchSchema).optional(),
  jobs: z.array(jobSchema).optional(),
});

export type Runtime = z.output<typeof runtimeSchema>;
export type RuntimePatch = z.output<typeof runtimePatchSchema>;
export type MediaPatch = z.output<typeof mediaPatchSchema>;
export type CardPatch = z.output<typeof cardPatchSchema>;
export type Job = z.output<typeof jobSchema>;
export type ConfigDocument = z.output<typeof documentSchema>;

export const runtimeDefaults: Runtime = {
  'log-level': 'info',
  'output-dir': 'dist',
  'render-concurrency': 1,
  server: { host: '127.0.0.1', port: 3000 },
  cache: { ttl: 300, 'max-entries': 256 },
  providers: {
    github: { 'base-url': 'https://api.github.com', 'token-env': 'GITHUB_TOKEN' },
    cnb: { 'base-url': 'https://api.cnb.cool', 'token-env': 'CNB_TOKEN' },
  },
};
