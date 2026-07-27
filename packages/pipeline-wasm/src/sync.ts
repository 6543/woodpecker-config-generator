/**
 * Direct, same-thread entry point. For Node and for callers that cannot use a
 * Worker. Same API as the default entry (spec 4.5).
 */
import { NotImplementedError } from './not-implemented.js';
import type { Linter, LinterOptions } from './types.js';

export * from './types.js';

export function createLinter(_options?: LinterOptions): Promise<Linter> {
  throw new NotImplementedError('createLinter (sync)');
}
