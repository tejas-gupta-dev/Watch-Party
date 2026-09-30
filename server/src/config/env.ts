import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// repo-root .env first (npm run dev from root / server dir), then server/.env
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

// treat empty strings ("KEY=") as unset
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  NODE_ID: z.string().default(`node-${process.pid}`),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(16).default('dev-only-secret-change-me-please'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  RATE_LIMIT_MAX: z.coerce.number().int().default(600),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('watch-party'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  TRANSCODE_ENABLED: z.enum(['true', 'false']).default('false'),
});

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET.startsWith('dev-only')) {
  console.error('JWT_SECRET must be set in production');
  process.exit(1);
}

export const env = parsed.data;
export const transcodeEnabled = env.TRANSCODE_ENABLED === 'true';
