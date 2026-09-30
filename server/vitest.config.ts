import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Tests run against a real, throwaway PostgreSQL database (never your dev data).
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://durgamatha:durgamatha@localhost:5432/durgamatha_test';

export default defineConfig({
  test: {
    globalSetup: './test/globalSetup.ts',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test-secret-that-is-long-enough-for-validation-0123456789',
      STORAGE_DRIVER: 'local',
      LOCAL_UPLOAD_DIR: path.join(os.tmpdir(), 'durgamatha-test-uploads'),
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
  },
});
