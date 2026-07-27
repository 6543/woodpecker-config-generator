import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'pipeline-wasm',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
