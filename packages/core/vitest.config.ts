import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    // See apps/generator: exports point at dist, tests must run against source.
    alias: {
      '@woodpecker-ci/pipeline-wasm/sync': src('../pipeline-wasm/src/sync.ts'),
      '@woodpecker-ci/pipeline-wasm': src('../pipeline-wasm/src/index.ts'),
      '@woodpecker-ci/plugin-schema': src('../plugin-schema/src/index.ts'),
    },
  },
  test: {
    name: 'core',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
