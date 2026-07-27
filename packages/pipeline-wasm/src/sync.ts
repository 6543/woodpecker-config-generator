/**
 * Direct, same-thread entry point. For Node and for callers that cannot use a
 * Worker. Same API as the default entry.
 */
import { createLinterOver, instantiate, type Callable, type Method } from './runtime.js';
import type { Linter, LinterOptions } from './types.js';

export * from './types.js';
export { UPSTREAM_DEFAULTS } from './runtime.js';

export async function createLinter(options: LinterOptions = {}): Promise<Linter> {
  const api = await instantiate(options.wasmUrl);

  const transport: Callable = {
    call: (method: Method, payload: string) => Promise.resolve(api[method](payload)),
    release: () => api.dispose(),
  };

  return createLinterOver(transport, options);
}
