import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_SERVICE_ACCOUNT_KEY: z.string().min(1),
    GOOGLE_SHEETS_ID: z.string().min(1),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    ADMIN_EMAIL: z.string().email(),
    RESEND_API_KEY: z.string().min(1).optional(),
    CRON_SECRET: z.string().min(1).optional(),
    GH_TOKEN: z.string().min(1).optional(),
    VERCEL_TOKEN: z.string().min(1).optional(),
    NEXTAUTH_TEST_MODE: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().min(1),
    NEXT_PUBLIC_TELEGRAM_BOT_NAME: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_SERVICE_ACCOUNT_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
    GOOGLE_SHEETS_ID: process.env.GOOGLE_SHEETS_ID,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    GH_TOKEN: process.env.GH_TOKEN,
    VERCEL_TOKEN: process.env.VERCEL_TOKEN,
    NEXTAUTH_TEST_MODE: process.env.NEXTAUTH_TEST_MODE,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    NEXT_PUBLIC_TELEGRAM_BOT_NAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
})
