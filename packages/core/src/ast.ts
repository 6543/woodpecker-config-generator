/**
 * The AST is the model, not a plain JS object (spec 3).
 *
 * Round-tripping through a plain object destroys comments and key order, which
 * makes the tool useless for editing an existing config. Importing an existing
 * config is an MVP feature (spec 8.1), so this is load-bearing.
 *
 * Caveat: Woodpecker parses with `codeberg.org/6543/xyaml/v2`, which supports
 * sequence merge keys that the `yaml` npm package does not implement (spec
 * 2.9). This AST is for editing and range mapping only. It is never the source
 * of truth for semantics. Where the two disagree, WASM wins.
 */
import type { Document } from 'yaml';
import { NotImplementedError } from './not-implemented.js';

export type { Document } from 'yaml';

export function parseDocument(_src: string): Document {
  throw new NotImplementedError('parseDocument');
}

export function serialize(_doc: Document): string {
  throw new NotImplementedError('serialize');
}

/**
 * True when a node uses anchors or merge keys. Such blocks are form-hostile:
 * the form marks them read-only and points the user at the text pane, and the
 * AST preserves them byte for byte (spec 6.6). Silently rewriting a merge key
 * would be a correctness bug given the dialect gap above.
 */
export function isFormHostile(_doc: Document, _path: string): boolean {
  throw new NotImplementedError('isFormHostile');
}
