import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * پیکربندی تست‌های یکپارچه (فاز ۲) — روی PostgreSQL واقعی با migration واقعی.
 * دیتابیس تست در setup ساخته و خالی می‌شود؛ هرگز به دیتابیس تولید وصل نشود.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/tests/integration/**/*.test.ts'],
    setupFiles: ['src/tests/integration/setup.ts'],
    globals: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
