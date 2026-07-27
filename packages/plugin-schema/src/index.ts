import { parseFrontmatter } from './frontmatter.js';
import { findTableAfter, findTableUnderHeading, type MarkdownTable } from './table.js';
import { parseSettingType } from './type-vocabulary.js';
import { SENTINEL_V1, type PluginDoc, type PluginSetting } from './types.js';

export * from './types.js';
export { parseSettingType } from './type-vocabulary.js';
export { splitRow, findTableAfter, findTableUnderHeading } from './table.js';
export type { MarkdownTable } from './table.js';

const V1_COLUMNS = ['Name', 'Type', 'Required', 'Default', 'Description'] as const;

/** Locate a column by header text, case-insensitively. */
function columnIndex(headers: string[], name: string): number {
  return headers.findIndex((header) => header.trim().toLowerCase() === name.toLowerCase());
}

/** Locate a column whose header merely contains a word, for legacy tables. */
function looseColumnIndex(headers: string[], word: string): number {
  return headers.findIndex((header) => header.toLowerCase().includes(word));
}

function unfence(cell: string): string {
  const trimmed = cell.trim();
  const match = /^`(.*)`$/s.exec(trimmed);
  return (match?.[1] ?? trimmed).trim();
}

/**
 * Aliases are written `` `tag`/`tags` `` and split on the slash. The first entry
 * is canonical, the rest are accepted spellings.
 */
function parseNames(cell: string): string[] {
  return cell
    .split('/')
    .map((part) => unfence(part))
    .filter((part) => part !== '');
}

/**
 * A default is a backticked literal, a `${CI_*}` reference, or absent.
 *
 * `_none_` is the documented spelling for absent. Bare `none`, `-` and an empty
 * cell are accepted too, because legacy tables use all three. A backticked
 * `` `none` `` stays a literal, so an author can still express the string.
 */
function normalizeDefault(cell: string | undefined): string | null {
  const trimmed = (cell ?? '').trim();
  if (trimmed === '') return null;

  const fenced = /^`(.*)`$/s.exec(trimmed);
  if (fenced) return (fenced[1] ?? '').trim();

  const plain = trimmed.toLowerCase();
  if (plain === '_none_' || plain === 'none' || plain === '-' || plain === 'n/a') return null;

  return trimmed;
}

function parseV1Table(table: MarkdownTable, warnings: string[]): PluginSetting[] {
  const columns = Object.fromEntries(
    V1_COLUMNS.map((name) => [name, columnIndex(table.headers, name)]),
  ) as Record<(typeof V1_COLUMNS)[number], number>;

  for (const name of V1_COLUMNS) {
    if (columns[name] < 0) {
      warnings.push(`v1 table is missing the \`${name}\` column`);
    }
  }

  const settings: PluginSetting[] = [];

  for (const row of table.rows) {
    const nameCell = columns.Name >= 0 ? (row[columns.Name] ?? '') : (row[0] ?? '');
    const aliases = parseNames(nameCell);
    const name = aliases[0];
    if (name === undefined) {
      warnings.push('skipped a row with an empty `Name` cell');
      continue;
    }

    const typeCell = columns.Type >= 0 ? (row[columns.Type] ?? '') : '';
    const parsedType = parseSettingType(typeCell);
    if (parsedType.warning && columns.Type >= 0) {
      warnings.push(`\`${name}\`: ${parsedType.warning}`);
    }

    const requiredCell = (columns.Required >= 0 ? (row[columns.Required] ?? '') : '')
      .trim()
      .toLowerCase();
    let required = false;
    if (requiredCell === 'yes') {
      required = true;
    } else if (requiredCell !== 'no' && columns.Required >= 0) {
      warnings.push(`\`${name}\`: \`Required\` is \`${requiredCell}\`, expected yes or no`);
    }

    settings.push({
      name,
      aliases,
      type: parsedType.type,
      required,
      default: columns.Default >= 0 ? normalizeDefault(row[columns.Default]) : null,
      description: columns.Description >= 0 ? (row[columns.Description] ?? '') : '',
      opaque: parsedType.type.kind === 'object',
    });
  }

  return settings;
}

/**
 * Legacy tables carry `Name | Default | Description` and no type information,
 * so everything comes back `unknown` and not required. The form renders free
 * text with the description as help, which is still better than nothing.
 */
function parseLegacyTable(table: MarkdownTable, warnings: string[]): PluginSetting[] {
  const nameCol = Math.max(looseColumnIndex(table.headers, 'name'), 0);
  const defaultCol = looseColumnIndex(table.headers, 'default');
  const descriptionCol = looseColumnIndex(table.headers, 'description');

  const settings: PluginSetting[] = [];

  for (const row of table.rows) {
    const aliases = parseNames(row[nameCol] ?? '');
    const name = aliases[0];
    if (name === undefined) {
      warnings.push('skipped a row with an empty name cell');
      continue;
    }

    settings.push({
      name,
      aliases,
      type: { kind: 'unknown' },
      required: false,
      default: defaultCol >= 0 ? normalizeDefault(row[defaultCol]) : null,
      description: descriptionCol >= 0 ? (row[descriptionCol] ?? '') : '',
      opaque: false,
    });
  }

  return settings;
}

/**
 * Parse a plugin `docs.md`.
 *
 * Primary input is the raw markdown: the plugin index already provides raw
 * URLs, the sentinel survives there, and there is no HTML to fight.
 *
 * Never throws. Problems land in `PluginDoc.warnings` and the parse degrades to
 * the legacy path, so one badly formatted plugin cannot break a catalog.
 */
export function parsePluginDoc(markdown: string): PluginDoc {
  const source = typeof markdown === 'string' ? markdown : '';
  const { meta, warnings: frontmatterWarnings } = parseFrontmatter(source);
  const warnings = [...frontmatterWarnings];

  const sentinel = source.indexOf(SENTINEL_V1);
  if (sentinel >= 0) {
    const table = findTableAfter(source, sentinel);
    if (!table) {
      warnings.push('sentinel found but no table follows it');
      return { meta, settings: [], schemaVersion: 1, warnings };
    }
    return { meta, settings: parseV1Table(table, warnings), schemaVersion: 1, warnings };
  }

  const legacy = findTableUnderHeading(source);
  if (!legacy) {
    warnings.push('no settings table found');
    return { meta, settings: [], schemaVersion: null, warnings };
  }

  warnings.push('no v1 sentinel, parsed the legacy table best-effort');
  return { meta, settings: parseLegacyTable(legacy, warnings), schemaVersion: null, warnings };
}
