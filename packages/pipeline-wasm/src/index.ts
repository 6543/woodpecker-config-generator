/**
 * Worker-backed entry point. The WASM runs off the main thread and is fetched
 * on first call, never at import (spec 4.1).
 */
import { NotImplementedError } from './not-implemented.js';
import type { Linter, LinterOptions } from './types.js';

export * from './types.js';
export { NotImplementedError } from './not-implemented.js';

/** Upstream defaults, used when the instance configuration is unknown (spec 2.11). */
export const UPSTREAM_DEFAULTS = {
  trusted: { network: false, volumes: false, security: false },
  privilegedPlugins: [] as string[],
  trustedClonePlugins: ['docker.io/woodpeckerci/plugin-git:2.9.2'],
} as const;

export function createLinter(_options?: LinterOptions): Promise<Linter> {
  throw new NotImplementedError('createLinter');
}
