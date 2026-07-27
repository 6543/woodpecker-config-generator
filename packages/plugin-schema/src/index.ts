import type { PluginDoc } from './types.js';

export * from './types.js';

class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}

/**
 * Parse a plugin `docs.md`.
 *
 * Primary input is the raw markdown: the index already provides raw URLs, the
 * sentinel survives, and there is no HTML to fight (spec 5.4).
 *
 * Never throws on malformed input. Problems land in `PluginDoc.warnings` and
 * the parse degrades to the legacy path (spec 5.5).
 */
export function parsePluginDoc(_markdown: string): PluginDoc {
  throw new NotImplementedError('parsePluginDoc');
}
