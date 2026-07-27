import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  // Deployed as a subpath artifact alongside the docs site. See DECISIONS.md:
  // the exact hosting shape is still open upstream (spec 10.3).
  base: './',
  plugins: [vue(), tailwindcss()],
  resolve: {
    // Workspace packages resolve through their `exports` to `dist`, which only
    // exists after a package build, so a bare `vite dev` fails to resolve them.
    // Point them at source instead, exactly as vitest.config.ts does, so the
    // dev server and the standalone build work without a prior package build
    // and pick up edits without one. The WASM asset is not resolved through the
    // package: useEngine passes an explicit `wasmUrl` served from the app base.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@woodpecker-ci/pipeline-wasm/sync': fileURLToPath(
        new URL('../../packages/pipeline-wasm/src/sync.ts', import.meta.url),
      ),
      '@woodpecker-ci/pipeline-wasm': fileURLToPath(
        new URL('../../packages/pipeline-wasm/src/index.ts', import.meta.url),
      ),
      '@woodpecker-ci/config-core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
      '@woodpecker-ci/plugin-schema': fileURLToPath(
        new URL('../../packages/plugin-schema/src/index.ts', import.meta.url),
      ),
    },
  },
  build: {
    target: 'es2023',
    // The WASM module is ~3.3 MB brotli and lazy-loaded on first edit, so it
    // never blocks first paint (spec 2.2). Keep it out of the entry chunk.
    assetsInlineLimit: 0,
  },
});
