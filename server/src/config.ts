import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

/**
 * All configuration comes from environment variables (see .env.example).
 * The app refuses to start if a required value is missing or malformed,
 * so misconfiguration fails loudly instead of at the first request.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(7),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_UPLOAD_DIR: z.string().default('./uploads'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  MAX_PHOTO_MB: z.coerce.number().positive().default(15),
  MAX_VIDEO_MB: z.coerce.number().positive().default(500),
  MAX_PROOF_MB: z.coerce.number().positive().default(10),

  ADMIN_NAME: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;

if (env.STORAGE_DRIVER === 's3') {
  for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
    if (!env[key]) {
      console.error(`STORAGE_DRIVER=s3 requires ${key}`);
      process.exit(1);
    }
  }
}

export const config = {
  ...env,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  uploadDir: path.resolve(env.LOCAL_UPLOAD_DIR),
  limits: {
    photo: env.MAX_PHOTO_MB * 1024 * 1024,
    video: env.MAX_VIDEO_MB * 1024 * 1024,
    proof: env.MAX_PROOF_MB * 1024 * 1024,
  },
};
