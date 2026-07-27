/**
 * Types for `woodpecker-plugin-settings v1` (spec 5).
 *
 * The settings table in a plugin's `docs.md` already is the human
 * documentation. v1 makes that same table the machine source, so there is one
 * artifact for both audiences and nothing to drift.
 */

/**
 * Sentinel that anchors a v1 table. Single-line HTML comments are stripped
 * before the docs site renders (spec 2.10), so this is invisible to readers
 * while present in the raw file.
 */
export const SENTINEL_V1 = '<!-- woodpecker-plugin-settings v1 -->';

/** Closed type vocabulary (spec 5.3). `enum(...)` and `list<...>` are parametric. */
export type SettingTypeName =
  'string' | 'bool' | 'int' | 'duration' | 'secret' | 'object' | 'list' | 'enum' | 'unknown';

export type SettingType =
  | { kind: 'string' | 'bool' | 'int' | 'duration' | 'object' }
  /** Renders a secret picker and emits `from_secret:` wiring. */
  | { kind: 'secret' }
  | { kind: 'list'; of: 'string' | 'int' }
  /** Values are inline in the Type cell as `enum(a,b,c)` (spec 10.1). */
  | { kind: 'enum'; values: string[] }
  /** Legacy docs with no sentinel. Renders as a free-text field. */
  | { kind: 'unknown' };

export interface PluginSetting {
  /** Canonical name. For `` `tag`/`tags` `` this is `tag`. */
  name: string;
  /** All names including the canonical one, in table order. */
  aliases: string[];
  type: SettingType;
  required: boolean;
  /** Backticked literal, a `${CI_*}` reference, or null for `_none_`. */
  default: string | null;
  /** Free markdown, the last column. */
  description: string;
  /**
   * True for `object`. A table cannot express nested structures, so the form
   * renders a raw-YAML field instead of guessing (spec 5.3).
   */
  opaque: boolean;
}

/** Existing frontmatter, unchanged by v1. */
export interface PluginFrontmatter {
  name?: string;
  icon?: string;
  description?: string;
  author?: string;
  tags?: string[];
  containerImage?: string;
  containerImageUrl?: string;
  url?: string;
  [key: string]: unknown;
}

export interface PluginDoc {
  meta: PluginFrontmatter;
  settings: PluginSetting[];
  /** `null` means no sentinel was found: legacy, best-effort parse. */
  schemaVersion: 1 | null;
  /** e.g. "type `strng` not in vocabulary". Never thrown, always collected. */
  warnings: string[];
}

/** One entry of `docs/plugins/woodpecker-plugins/plugins.json` (spec 2.10). */
export interface PluginIndexEntry {
  name: string;
  docs: string;
  verified: boolean;
  [key: string]: unknown;
}
