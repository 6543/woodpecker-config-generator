import type { SettingType } from './types.js';

export interface ParsedType {
  type: SettingType;
  /** Set when the cell fell outside the vocabulary. Never thrown. */
  warning?: string;
}

const SCALARS = new Set(['string', 'bool', 'int', 'duration', 'secret', 'object']);
const LIST_ELEMENTS = new Set(['string', 'int']);

/** Strip a single pair of surrounding backticks. Type cells are usually code. */
function unfence(cell: string): string {
  const trimmed = cell.trim();
  const match = /^`(.*)`$/s.exec(trimmed);
  return (match?.[1] ?? trimmed).trim();
}

const unknown = (warning: string): ParsedType => ({ type: { kind: 'unknown' }, warning });

/**
 * Parse one Type cell against the closed vocabulary:
 *
 *     string | bool | int | duration | secret | object
 *     list<string> | list<int>
 *     enum(a,b,c)
 *
 * Anything else yields `unknown` plus a warning. A setting with an
 * unrecognised type is still returned: the form renders it as free text, which
 * beats dropping the setting.
 */
export function parseSettingType(cell: string): ParsedType {
  const raw = unfence(cell);
  if (raw === '') return unknown('empty type cell');

  if (SCALARS.has(raw)) {
    return { type: { kind: raw as 'string' | 'bool' | 'int' | 'duration' | 'secret' | 'object' } };
  }

  const list = /^list<(.+)>$/.exec(raw);
  if (list) {
    const of = list[1]?.trim() ?? '';
    if (!LIST_ELEMENTS.has(of)) {
      return unknown(`type \`${raw}\` not in vocabulary: list element must be string or int`);
    }
    return { type: { kind: 'list', of: of as 'string' | 'int' } };
  }

  const enumMatch = /^enum\((.*)\)$/s.exec(raw);
  if (enumMatch) {
    const values = (enumMatch[1] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value !== '');
    if (values.length === 0) {
      return unknown(`type \`${raw}\` lists no values`);
    }
    return { type: { kind: 'enum', values } };
  }

  return unknown(`type \`${raw}\` not in vocabulary`);
}
