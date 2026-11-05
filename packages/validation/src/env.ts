import { z } from 'zod';

// Shared, non-secret config only. Add service-specific secret schemas with their slices.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  AI_PROVIDER_MODE: z.enum(['fake', 'live']).default('fake'),
  MEDIA_STORAGE_PROVIDER: z.enum(['fake', 'cloudinary']).default('fake'),
  FEATURE_PUBLIC_SHARING: z.literal('false').default('false').transform(() => false),
  FEATURE_SECONDARY_ASR: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export type Environment = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, unknown>): Environment {
  const result = envSchema.safeParse(input);
  // Never include rejected values or the source environment in errors/logs.
  if (!result.success) throw new Error('Invalid environment configuration');
  return result.data;
}
