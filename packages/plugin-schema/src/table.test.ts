import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findTableAfter, findTableUnderHeading, splitRow } from './table.js';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('splitRow', () => {
  it('drops the leading and trailing pipes', () => {
    expect(splitRow('| `a` | b |')).toEqual(['`a`', 'b']);
  });

  it('tolerates a row without outer pipes', () => {
    expect(splitRow('a | b')).toEqual(['a', 'b']);
  });

  it('keeps an escaped pipe inside a cell', () => {
    expect(splitRow('| registry password \\| token | c |')).toEqual([
      'registry password | token',
      'c',
    ]);
  });

  it('preserves empty cells rather than collapsing them', () => {
    expect(splitRow('| a |  | c |')).toEqual(['a', '', 'c']);
  });
});

describe('findTableAfter', () => {
  it('returns the table that follows the offset, not an earlier one', () => {
    const md = fixture('v1-multi-table.md');
    const sentinel = md.indexOf('<!-- woodpecker-plugin-settings v1 -->');
    const table = findTableAfter(md, sentinel);

    expect(table?.headers).toEqual(['Name', 'Type', 'Required', 'Default', 'Description']);
    expect(table?.rows).toHaveLength(1);
  });

  it('stops at the first blank line after the table, ignoring later tables', () => {
    const md = fixture('v1-multi-table.md');
    const sentinel = md.indexOf('<!-- woodpecker-plugin-settings v1 -->');
    const table = findTableAfter(md, sentinel);

    expect(table?.rows.flat()).not.toContain('Note');
  });

  it('returns null when no table follows', () => {
    expect(findTableAfter('# Heading\n\njust prose\n', 0)).toBeNull();
  });

  it('reads CRLF documents', () => {
    const md = '| A | B |\r\n| - | - |\r\n| 1 | 2 |\r\n';
    expect(findTableAfter(md, 0)?.rows).toEqual([['1', '2']]);
  });
});

describe('findTableUnderHeading', () => {
  it('finds the legacy table under a Settings heading', () => {
    const table = findTableUnderHeading(fixture('legacy.md'));
    expect(table?.headers).toEqual(['Settings Name', 'Default', 'Description']);
    expect(table?.rows).toHaveLength(3);
  });

  it('returns null when the document has no settings heading', () => {
    expect(findTableUnderHeading(fixture('no-settings.md'))).toBeNull();
  });

  it('accepts Parameter Reference, which real plugin docs use more than Settings', () => {
    const table = findTableUnderHeading(fixture('legacy-parameter-reference.md'));
    expect(table?.headers).toEqual(['setting', 'description']);
    expect(table?.rows).toHaveLength(3);
  });

  it('stays inside the section, so a later table is not mistaken for settings', () => {
    expect(findTableUnderHeading(fixture('settings-section-without-table.md'))).toBeNull();
  });
});
