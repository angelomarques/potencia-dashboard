import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DAISY_WEBHOOK_SECRET: z.string().optional(),
    DAISY_WEBHOOK_URL: z.string().url().optional(),
    DAISY_PULL_TOKEN: z.string().optional(),
    DAISY_OWNER_EMAIL: z.string().optional(),
    DAISY_PREVIEW_ALLOWED_ORIGINS: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    D1_HTTP_BASE_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    DAISY_WEBHOOK_SECRET: process.env.DAISY_WEBHOOK_SECRET,
    DAISY_WEBHOOK_URL: process.env.DAISY_WEBHOOK_URL,
    DAISY_PULL_TOKEN: process.env.DAISY_PULL_TOKEN,
    DAISY_OWNER_EMAIL: process.env.DAISY_OWNER_EMAIL,
    DAISY_PREVIEW_ALLOWED_ORIGINS: process.env.DAISY_PREVIEW_ALLOWED_ORIGINS,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    CRON_SECRET: process.env.CRON_SECRET,
    D1_HTTP_BASE_URL: process.env.D1_HTTP_BASE_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
});
