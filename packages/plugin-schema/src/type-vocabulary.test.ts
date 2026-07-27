import { describe, expect, it } from 'vitest';
import { parseSettingType } from './type-vocabulary.js';

describe('parseSettingType', () => {
  it.each([
    ['`string`', { kind: 'string' }],
    ['`bool`', { kind: 'bool' }],
    ['`int`', { kind: 'int' }],
    ['`duration`', { kind: 'duration' }],
    ['`secret`', { kind: 'secret' }],
    ['`object`', { kind: 'object' }],
  ])('reads the scalar type %s', (cell, expected) => {
    const { type, warning } = parseSettingType(cell);
    expect(type).toEqual(expected);
    expect(warning).toBeUndefined();
  });

  it('accepts an unbackticked cell', () => {
    expect(parseSettingType('bool').type).toEqual({ kind: 'bool' });
  });

  it.each([
    ['`list<string>`', 'string'],
    ['`list<int>`', 'int'],
  ])('reads %s', (cell, of) => {
    expect(parseSettingType(cell).type).toEqual({ kind: 'list', of });
  });

  it('rejects a list element type outside the vocabulary', () => {
    const { type, warning } = parseSettingType('`list<float>`');
    expect(type).toEqual({ kind: 'unknown' });
    expect(warning).toMatch(/list<float>/);
  });

  it('reads enum values inline', () => {
    expect(parseSettingType('`enum(amd64,arm64)`').type).toEqual({
      kind: 'enum',
      values: ['amd64', 'arm64'],
    });
  });

  it('trims whitespace around enum values', () => {
    expect(parseSettingType('`enum(a, b ,c )`').type).toEqual({
      kind: 'enum',
      values: ['a', 'b', 'c'],
    });
  });

  it('warns on an empty enum rather than producing a field with no options', () => {
    const { type, warning } = parseSettingType('`enum()`');
    expect(type).toEqual({ kind: 'unknown' });
    expect(warning).toBeDefined();
  });

  it('warns on a type outside the vocabulary but still yields a usable setting', () => {
    const { type, warning } = parseSettingType('`strng`');
    expect(type).toEqual({ kind: 'unknown' });
    expect(warning).toMatch(/strng/);
  });

  it('treats an empty cell as unknown', () => {
    const { type, warning } = parseSettingType('');
    expect(type).toEqual({ kind: 'unknown' });
    expect(warning).toBeDefined();
  });
});
