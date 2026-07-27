import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/pipeline-wasm',
      'packages/plugin-schema',
      'packages/core',
      'apps/generator',
    ],
  },
});
