/**
 * Path to range mapping, the host's responsibility (spec 4.4).
 *
 * WASM diagnostics carry a YAML path such as `steps.build` and no line or
 * column. Placing a squiggle means resolving that path against the JS-side AST,
 * which does hold ranges.
 *
 * Resolution order:
 *   1. Split on `.`, walk the AST, prefer the key node's range over the value's.
 *   2. `steps.<name>` resolves in both map form and list form.
 *   3. On failure, fall back to the nearest resolvable ancestor.
 *   4. On total failure, return null. The caller shows the diagnostic in the
 *      panel without an editor anchor. Never drop it silently.
 */
import type { Document } from 'yaml';
import { walkPath, type TextRange } from './path.js';

export type { TextRange } from './path.js';

export function resolveRange(doc: Document, field: string): TextRange | null {
  const resolved = walkPath(doc, field);

  for (let i = resolved.length - 1; i >= 0; i -= 1) {
    const range = resolved[i]?.range;
    if (range) return range;
  }

  return null;
}
