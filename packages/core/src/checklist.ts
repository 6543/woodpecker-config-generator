/**
 * Setup checklist (spec 6.5).
 *
 * Derived, never authored. Scan the config for `from_secret:` references and,
 * via the plugin schema, for settings typed `secret` or marked required. This
 * surfaces knowledge the generator already has and that today only survives as
 * YAML header comments, which are the first thing lost on copy-paste.
 */
import type { PluginDoc } from '@woodpecker-ci/plugin-schema';
import type { Document } from 'yaml';
import { NotImplementedError } from './not-implemented.js';

export type ChecklistKind = 'secret' | 'required-setting';

export interface ChecklistItem {
  kind: ChecklistKind;
  /** Secret name, or plugin setting name. */
  subject: string;
  /** Step names that need it. */
  usedBy: string[];
  /** Set for `required-setting`. */
  plugin?: string;
}

export function buildChecklist(_doc: Document, _plugins: Map<string, PluginDoc>): ChecklistItem[] {
  throw new NotImplementedError('buildChecklist');
}
