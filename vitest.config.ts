import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    exclude: ['src/tests/integration/**', 'node_modules/**'],
    setupFiles: ['src/tests/setup.ts'],
    globals: false,
  },
});
