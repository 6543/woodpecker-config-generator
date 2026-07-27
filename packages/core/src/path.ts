import { isMap, isScalar, isSeq, type Document, type Node } from 'yaml';

export interface TextRange {
  start: number;
  end: number;
}

export interface PathStep {
  /**
   * The range to highlight for this segment. The key node for a map entry, the
   * `name` value for a list entry, so a squiggle lands on the identifier the
   * diagnostic is about rather than on the whole block.
   */
  range: TextRange | null;
  /** The value the segment resolved to, for callers that need the subtree. */
  node: unknown;
}

function rangeOf(node: unknown): TextRange | null {
  if (node === null || typeof node !== 'object') return null;
  const range = (node as Node).range;
  if (!range) return null;
  return { start: range[0], end: range[1] };
}

function keyText(key: unknown): string {
  return isScalar(key) ? String(key.value) : String(key);
}

/**
 * Walk a dotted YAML path, returning one entry per segment resolved.
 *
 * Stops at the first segment that does not resolve, so the caller can tell a
 * complete match (`steps.length === segments.length`) from a partial one and
 * fall back to the nearest ancestor.
 *
 * Steps resolve in both shapes Woodpecker accepts: `steps: {build: ...}` by
 * key, and `steps: [{name: build, ...}]` by the `name` field. A numeric segment
 * indexes a sequence directly.
 */
export function walkPath(doc: Document, field: string): PathStep[] {
  const resolved: PathStep[] = [];
  if (field === '') return resolved;

  let current: unknown = doc.contents;

  for (const segment of field.split('.')) {
    if (isMap(current)) {
      const pair = current.items.find((item) => keyText(item.key) === segment);
      if (!pair) return resolved;
      resolved.push({ range: rangeOf(pair.key), node: pair.value });
      current = pair.value;
      continue;
    }

    if (isSeq(current)) {
      const index = Number(segment);
      if (Number.isInteger(index) && String(index) === segment) {
        const item = current.items[index];
        if (item === undefined) return resolved;
        resolved.push({ range: rangeOf(item), node: item });
        current = item;
        continue;
      }

      const entry = current.items.find(
        (item) => isMap(item) && String(item.get('name')) === segment,
      );
      if (!isMap(entry)) return resolved;

      const namePair = entry.items.find((item) => keyText(item.key) === 'name');
      resolved.push({ range: rangeOf(namePair?.value) ?? rangeOf(entry), node: entry });
      current = entry;
      continue;
    }

    return resolved;
  }

  return resolved;
}
