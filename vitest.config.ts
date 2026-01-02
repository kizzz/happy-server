import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts', '../tests/external/**/*.spec.ts'],
    testTimeout: 180000,
    hookTimeout: 180000,
  },
  plugins: [tsconfigPaths()]
});