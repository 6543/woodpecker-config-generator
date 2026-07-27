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
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2023',
    // The WASM module is ~3.3 MB brotli and lazy-loaded on first edit, so it
    // never blocks first paint (spec 2.2). Keep it out of the entry chunk.
    assetsInlineLimit: 0,
  },
});
