/**
 * The AST is the model, not a plain JS object (spec 3).
 *
 * Round-tripping through a plain object destroys comments and key order, which
 * would make the tool useless for editing an existing config. Importing an
 * existing config is an MVP feature, so this is load-bearing.
 *
 * Caveat: Woodpecker parses with `codeberg.org/6543/xyaml/v2`, which supports
 * sequence merge keys that the `yaml` npm package does not implement (spec
 * 2.9). This AST is for editing and range mapping only. It is never the source
 * of truth for semantics. Where the two disagree, WASM wins.
 */
import { isNode, isScalar, parseDocument as parseYaml, visit, type Document } from 'yaml';
import { walkPath } from './path.js';

export type { Document } from 'yaml';

/** Source tokens are what let the serialiser reproduce the original bytes. */
const PARSE_OPTIONS = { keepSourceTokens: true } as const;

/**
 * Both options are load-bearing, not cosmetic.
 *
 * `lineWidth: 0` disables folding: without it, long `commands:` entries get
 * wrapped and the file no longer matches what the user wrote.
 * `flowCollectionPadding: false` keeps `[push, pull_request]` from becoming
 * `[ push, pull_request ]`.
 *
 * With both, all 35 corpus configs reserialise byte for byte. Without them,
 * only 7 do.
 */
const STRINGIFY_OPTIONS = { lineWidth: 0, flowCollectionPadding: false } as const;

export function parseDocument(source: string): Document {
  return parseYaml(source, PARSE_OPTIONS);
}

export function serialize(doc: Document): string {
  return doc.toString(STRINGIFY_OPTIONS);
}

function usesAnchors(node: unknown): boolean {
  if (!isNode(node)) return false;

  let hostile = false;

  visit(node, {
    Alias() {
      hostile = true;
      return visit.BREAK;
    },
    Node(_key, value) {
      if ('anchor' in value && typeof value.anchor === 'string' && value.anchor !== '') {
        hostile = true;
        return visit.BREAK;
      }
      return undefined;
    },
    Pair(_key, pair) {
      if (isScalar(pair.key) && pair.key.value === '<<') {
        hostile = true;
        return visit.BREAK;
      }
      return undefined;
    },
  });

  return hostile;
}

/**
 * True when the subtree at `path` declares an anchor, resolves an alias, or
 * carries a merge key.
 *
 * Such blocks do not map to a form. The form marks them read-only and points
 * the user at the text pane, and the AST preserves them byte for byte (spec
 * 6.6). Silently rewriting a merge key would be a correctness bug, since the
 * two YAML dialects disagree about what merge keys mean.
 *
 * An unresolvable path is not hostile, merely absent, so this returns false.
 */
export function isFormHostile(doc: Document, path: string): boolean {
  const segments = path === '' ? [] : path.split('.');
  const resolved = walkPath(doc, path);
  if (resolved.length !== segments.length) return false;

  const target = resolved.length === 0 ? doc.contents : resolved[resolved.length - 1]?.node;
  return usesAnchors(target);
}
