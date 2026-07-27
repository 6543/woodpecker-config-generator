import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // Workspace packages resolve through their `exports` to dist, which is only
    // as fresh as the last build. Tests must exercise current source.
    alias: {
      '@': src('./src'),
      '@woodpecker-ci/pipeline-wasm/sync': src('../../packages/pipeline-wasm/src/sync.ts'),
      '@woodpecker-ci/pipeline-wasm': src('../../packages/pipeline-wasm/src/index.ts'),
      '@woodpecker-ci/config-core': src('../../packages/core/src/index.ts'),
      '@woodpecker-ci/plugin-schema': src('../../packages/plugin-schema/src/index.ts'),
    },
  },
  test: {
    name: 'generator',
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
