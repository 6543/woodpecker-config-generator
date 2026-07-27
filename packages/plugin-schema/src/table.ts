/**
 * Minimal markdown pipe-table reader.
 *
 * Deliberately not a markdown parser. The v1 format is a table anchored by a
 * sentinel, so locating and splitting is all that is needed, and a small
 * hand-written reader has no dependency and no surprises.
 */

export interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

interface Line {
  text: string;
  start: number;
}

/**
 * Split one table row into cells.
 *
 * Splits on unescaped `|`. Per GFM a literal pipe inside a cell must be written
 * `\|`, including inside code spans, so this is the whole rule. Outer pipes are
 * optional and dropped when present; interior empty cells are preserved.
 */
export function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '\\' && line[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (char === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);

  const trimmed = line.trim();
  if (trimmed.startsWith('|') && cells.length > 0 && cells[0]?.trim() === '') {
    cells.shift();
  }
  if (trimmed.endsWith('|') && cells.length > 0 && cells[cells.length - 1]?.trim() === '') {
    cells.pop();
  }

  return cells.map((cell) => cell.trim());
}

/** `---`, `:--`, `--:`, `:-:` in every cell marks the header separator. */
function isDelimiterRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function toLines(markdown: string): Line[] {
  const lines: Line[] = [];
  let start = 0;

  for (const raw of markdown.split('\n')) {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    lines.push({ text, start });
    start += raw.length + 1;
  }

  return lines;
}

/**
 * Return the first table beginning at or after `offset`.
 *
 * A table is a row of cells followed by a delimiter row with the same cell
 * count. Rows end at the first line that is blank or carries no pipe, so a
 * later table elsewhere in the document is never absorbed.
 */
export function findTableAfter(markdown: string, offset: number): MarkdownTable | null {
  const lines = toLines(markdown);

  for (let i = 0; i < lines.length - 1; i += 1) {
    const header = lines[i];
    const delimiter = lines[i + 1];
    if (!header || !delimiter || header.start < offset) continue;
    if (!header.text.includes('|') || !delimiter.text.includes('|')) continue;

    const headers = splitRow(header.text);
    const delimiterCells = splitRow(delimiter.text);
    if (!isDelimiterRow(delimiterCells) || delimiterCells.length !== headers.length) continue;

    const rows: string[][] = [];
    for (let j = i + 2; j < lines.length; j += 1) {
      const line = lines[j];
      if (!line || line.text.trim() === '' || !line.text.includes('|')) break;
      rows.push(splitRow(line.text));
    }

    return { headers, rows };
  }

  return null;
}

/**
 * Heading spellings seen in the wild. `Parameter Reference` outnumbers
 * `Settings` across the published plugin docs, so it is not optional.
 */
const SETTINGS_HEADING = /^(#{1,6})[ \t]*(settings|configuration|options|parameters?)\b.*$/im;

/**
 * Legacy fallback: the first table inside a settings-ish section.
 *
 * Headings get renamed, translated and duplicated, which is exactly why v1 uses
 * a sentinel instead. This path exists only for docs that predate v1.
 *
 * The search is bounded by the next heading of the same or higher level. Some
 * plugins document parameters as a definition list rather than a table, and an
 * unbounded search would silently pick up an unrelated table further down.
 */
export function findTableUnderHeading(markdown: string): MarkdownTable | null {
  const heading = SETTINGS_HEADING.exec(markdown);
  if (!heading) return null;

  const level = heading[1]?.length ?? 1;
  const sectionStart = heading.index + heading[0].length;

  const next = new RegExp(`^#{1,${level}}[ \\t]+\\S.*$`, 'm').exec(markdown.slice(sectionStart));
  const section = next ? markdown.slice(sectionStart, sectionStart + next.index) : markdown;

  return findTableAfter(section, next ? 0 : sectionStart);
}
