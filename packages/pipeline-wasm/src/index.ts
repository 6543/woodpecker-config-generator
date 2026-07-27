/**
 * Worker-backed entry point, the default.
 *
 * The WASM is fetched on first call and never at import, and it runs off the
 * main thread. A 3.3 MB module that blocked first paint would defeat the point.
 */
import { createLinterOver, type Callable, type Method } from './runtime.js';
import type { Linter, LinterOptions } from './types.js';
import type { WorkerRequest, WorkerResponse } from './worker.js';

export * from './types.js';
export { UPSTREAM_DEFAULTS } from './runtime.js';

function spawn(options: LinterOptions): Callable {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const pending = new Map<
    number,
    { resolve: (value: string) => void; reject: (reason: Error) => void }
  >();
  let nextId = 0;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.error !== undefined) entry.reject(new Error(event.data.error));
    else entry.resolve(event.data.payload ?? '{}');
  };

  const post = (method: WorkerRequest['method'], payload: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const request: WorkerRequest = { id, method, payload };
      if (options.wasmUrl !== undefined) request.wasmUrl = options.wasmUrl;
      worker.postMessage(request);
    });

  const ready = post('init', '');

  return {
    call: async (method: Method, payload: string) => {
      await ready;
      return post(method, payload);
    },
    release: () => {
      void post('dispose', '').finally(() => worker.terminate());
    },
  };
}

export function createLinter(options: LinterOptions = {}): Promise<Linter> {
  return createLinterOver(spawn(options), options);
}
