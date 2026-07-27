import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'plugin-schema',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
