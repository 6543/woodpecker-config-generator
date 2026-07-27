/**
 * Path to range mapping, the host's responsibility (spec 4.4).
 *
 * WASM returns `field: "steps.build"` with no line or column. Placing a squiggle
 * means resolving that path against the JS-side AST, which does hold ranges.
 *
 * This is the most error-prone piece in the design. Resolution order:
 *   1. Split on `.`, walk the AST, prefer the key node's range over the value's.
 *   2. `steps.<name>` resolves in both map form and list form (match on `name`).
 *   3. On failure, fall back to the nearest resolvable ancestor.
 *   4. On total failure, return null. The caller shows the diagnostic in the
 *      panel without an editor anchor. Never drop it silently.
 */
import type { Document } from 'yaml';
import { NotImplementedError } from './not-implemented.js';

export interface TextRange {
  start: number;
  end: number;
}

export function resolveRange(_doc: Document, _field: string): TextRange | null {
  throw new NotImplementedError('resolveRange');
}
