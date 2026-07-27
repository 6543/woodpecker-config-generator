/**
 * Setup checklist (spec 6.5).
 *
 * Derived, never authored. Scan the config for `from_secret:` references and,
 * via the plugin schema, for required settings that are not set. This surfaces
 * knowledge the generator already has and that today only survives as YAML
 * header comments, which are the first thing lost on copy-paste.
 */
import type { PluginDoc } from '@woodpecker-ci/plugin-schema';
import { isMap, isScalar, isSeq, visit, type Document, type Node } from 'yaml';

export type ChecklistKind = 'secret' | 'required-setting';

export interface ChecklistItem {
  kind: ChecklistKind;
  /** Secret name, or plugin setting name. */
  subject: string;
  /** Step names that need it, in document order. */
  usedBy: string[];
  /** Set for `required-setting`. The plugin's display name. */
  plugin?: string;
}

interface Step {
  name: string;
  node: Node;
}

/** Steps come in both shapes Woodpecker accepts. Names are what the UI shows. */
function collectSteps(doc: Document): Step[] {
  const steps = doc.get('steps');

  if (isMap(steps)) {
    return steps.items
      .filter((pair) => pair.value !== null && typeof pair.value === 'object')
      .map((pair) => ({
        name: isScalar(pair.key) ? String(pair.key.value) : String(pair.key),
        node: pair.value as Node,
      }));
  }

  if (isSeq(steps)) {
    return steps.items.filter(isMap).map((item, index) => {
      const name = item.get('name');
      return { name: typeof name === 'string' ? name : String(index), node: item as Node };
    });
  }

  return [];
}

/** Every `from_secret: <name>` anywhere in a step, in document order. */
function secretsIn(step: Node): string[] {
  const found: string[] = [];

  visit(step, {
    Pair(_key, pair) {
      if (!isScalar(pair.key) || pair.key.value !== 'from_secret') return;
      if (!isScalar(pair.value)) return;
      const name = String(pair.value.value);
      if (name !== '' && !found.includes(name)) found.push(name);
    },
  });

  return found;
}

/**
 * Strip a tag or digest so `plugin-git:2.9.2` and `plugin-git@sha256:...` both
 * match a catalog keyed by image name. A registry port is not a tag, so only a
 * colon after the final slash counts.
 */
export function normalizeImage(image: string): string {
  const withoutDigest = image.split('@')[0] ?? '';
  const lastSlash = withoutDigest.lastIndexOf('/');
  const colon = withoutDigest.indexOf(':', lastSlash + 1);
  return colon === -1 ? withoutDigest : withoutDigest.slice(0, colon);
}

function settingsKeys(step: Node): Set<string> {
  const keys = new Set<string>();
  if (!isMap(step)) return keys;

  const settings = step.get('settings');
  if (!isMap(settings)) return keys;

  for (const pair of settings.items) {
    keys.add(isScalar(pair.key) ? String(pair.key.value) : String(pair.key));
  }

  return keys;
}

function upsert(items: ChecklistItem[], next: ChecklistItem): void {
  const existing = items.find((item) => item.kind === next.kind && item.subject === next.subject);
  if (!existing) {
    items.push(next);
    return;
  }
  for (const step of next.usedBy) {
    if (!existing.usedBy.includes(step)) existing.usedBy.push(step);
  }
}

/**
 * Build the checklist for a config.
 *
 * `plugins` is a catalog keyed by container image, without tag or digest. Steps
 * whose image is not in the catalog contribute secrets but no setting
 * requirements, since nothing is known about them.
 */
export function buildChecklist(
  doc: Document,
  plugins: Map<string, PluginDoc> = new Map(),
): ChecklistItem[] {
  const secrets: ChecklistItem[] = [];
  const required: ChecklistItem[] = [];

  for (const step of collectSteps(doc)) {
    for (const secret of secretsIn(step.node)) {
      upsert(secrets, { kind: 'secret', subject: secret, usedBy: [step.name] });
    }

    if (!isMap(step.node)) continue;
    const image = step.node.get('image');
    if (typeof image !== 'string') continue;

    const plugin = plugins.get(normalizeImage(image));
    if (!plugin) continue;

    const present = settingsKeys(step.node);
    for (const setting of plugin.settings) {
      if (!setting.required) continue;
      if (setting.aliases.some((alias) => present.has(alias))) continue;

      upsert(required, {
        kind: 'required-setting',
        subject: setting.name,
        usedBy: [step.name],
        plugin: plugin.meta.name ?? normalizeImage(image),
      });
    }
  }

  return [...secrets, ...required];
}
