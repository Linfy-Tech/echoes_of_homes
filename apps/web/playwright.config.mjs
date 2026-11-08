import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.mjs',
  use: { baseURL: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000' },
  reporter: [['line']],
});
