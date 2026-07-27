/**
 * Worker body. Instantiates the module once and forwards one JSON payload per
 * call, so the main thread never blocks on a lint of a large config.
 */
import { instantiate, type Method } from './runtime.js';

export interface WorkerRequest {
  id: number;
  method: Method | 'init' | 'dispose';
  payload: string;
  wasmUrl?: string;
}

export interface WorkerResponse {
  id: number;
  /** JSON string, absent when `error` is set. */
  payload?: string;
  error?: string;
}

type Api = Awaited<ReturnType<typeof instantiate>>;

let api: Api | null = null;

async function handle(request: WorkerRequest): Promise<WorkerResponse> {
  try {
    if (request.method === 'init') {
      api ??= await instantiate(request.wasmUrl);
      return { id: request.id, payload: '{}' };
    }

    if (!api) throw new Error('worker used before init');

    if (request.method === 'dispose') {
      api.dispose();
      api = null;
      return { id: request.id, payload: '{}' };
    }

    return { id: request.id, payload: api[request.method](request.payload) };
  } catch (error) {
    return { id: request.id, error: error instanceof Error ? error.message : String(error) };
  }
}

// Guarded so the module can be imported for its types without a worker scope.
if (typeof self !== 'undefined' && 'onmessage' in self) {
  self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    void handle(event.data).then((response) => {
      (self as unknown as { postMessage(value: WorkerResponse): void }).postMessage(response);
    });
  };
}
