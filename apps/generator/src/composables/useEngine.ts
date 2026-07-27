import { createLinter } from '@woodpecker-ci/pipeline-wasm/sync';
import type { Linter, Metadata } from '@woodpecker-ci/pipeline-wasm';
import { ref, shallowRef } from 'vue';

/**
 * Lazy access to the pipeline engine.
 *
 * The module is 3.3 MB brotli, so it is fetched on the first edit rather than
 * at startup: it must never block first paint. Everything the UI shows about
 * what runs comes from here, so there is one engine and many renderers rather
 * than a second matcher written in TypeScript.
 */
const engine = shallowRef<Linter | null>(null);
const loading = ref(false);
const failure = ref<string | null>(null);
let pending: Promise<Linter> | null = null;

export function useEngine() {
  async function load(): Promise<Linter> {
    if (engine.value) return engine.value;
    if (pending) return pending;

    loading.value = true;
    failure.value = null;

    pending = createLinter({ wasmUrl: new URL('woodpecker.wasm', document.baseURI).href })
      .then((linter) => {
        engine.value = linter;
        return linter;
      })
      .catch((error: unknown) => {
        failure.value = error instanceof Error ? error.message : String(error);
        pending = null;
        throw error;
      })
      .finally(() => {
        loading.value = false;
      });

    return pending;
  }

  return { engine, loading, failure, load };
}

export type { Linter, Metadata };
