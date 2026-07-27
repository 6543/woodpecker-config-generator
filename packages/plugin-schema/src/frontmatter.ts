import { parse as parseYaml } from 'yaml';
import type { PluginFrontmatter } from './types.js';

export interface FrontmatterResult {
  meta: PluginFrontmatter;
  warnings: string[];
}

const FENCE = /^---[ \t]*\r?\n/;

/**
 * Read the leading YAML frontmatter block.
 *
 * Bad frontmatter must not cost the caller the settings table, so every failure
 * yields an empty `meta` plus a warning.
 */
export function parseFrontmatter(markdown: string): FrontmatterResult {
  const opening = FENCE.exec(markdown);
  if (!opening) return { meta: {}, warnings: [] };

  const bodyStart = opening[0].length;
  const closing = /^---[ \t]*$/m.exec(markdown.slice(bodyStart));
  if (!closing) {
    return { meta: {}, warnings: ['unterminated frontmatter block'] };
  }

  const block = markdown.slice(bodyStart, bodyStart + closing.index);

  let parsed: unknown;
  try {
    parsed = parseYaml(block);
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { meta: {}, warnings: [`frontmatter is not valid YAML: ${detail}`] };
  }

  if (parsed === null || parsed === undefined) return { meta: {}, warnings: [] };
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { meta: {}, warnings: ['frontmatter is not a mapping'] };
  }

  return { meta: parsed as PluginFrontmatter, warnings: [] };
}
