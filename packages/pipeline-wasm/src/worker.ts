/**
 * Worker body. Instantiates the WASM module and forwards one JSON payload per
 * call. Chatty `js.Value` traversal is the main Go WASM performance trap, so
 * the protocol is deliberately one request, one response (spec 4.3).
 */
import { NotImplementedError } from './not-implemented.js';

export type WorkerRequest = {
  id: number;
  method: 'init' | 'parse' | 'lint' | 'match' | 'matrix' | 'stages' | 'schema' | 'version';
  payload: string;
};

export type WorkerResponse = {
  id: number;
  /** JSON string, or undefined when `error` is set. */
  payload?: string;
  error?: string;
};

export function handle(_req: WorkerRequest): Promise<WorkerResponse> {
  throw new NotImplementedError('worker.handle');
}
