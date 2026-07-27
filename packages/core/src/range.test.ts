import { readdirSync, readFileSync } from 'node:fs';
import { isMap, isSeq } from 'yaml';
import { describe, expect, it } from 'vitest';
import { parseDocument } from './ast.js';
import { resolveRange } from './range.js';

const CORPUS_DIR = new URL('./fixtures/corpus/', import.meta.url);
const corpus = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
const read = (name: string) => readFileSync(new URL(name, CORPUS_DIR), 'utf8');

const MAP_FORM = [
  'when:',
  '  event: push',
  'steps:',
  '  build:',
  '    image: golang',
  '    commands:',
  '      - go build',
  '',
].join('\n');

const LIST_FORM = [
  'steps:',
  '  - name: build',
  '    image: golang',
  '  - name: deploy',
  '    image: alpine',
  '',
].join('\n');

const unquote = (text: string): string => text.replace(/^(['"])(.*)\1$/s, '$2');

const slice = (src: string, field: string): string | null => {
  const range = resolveRange(parseDocument(src), field);
  return range ? src.slice(range.start, range.end) : null;
};

/** Step names as written, for either the map or the list form. */
function stepNames(src: string): string[] {
  const steps = parseDocument(src).get('steps');
  if (isMap(steps)) return steps.items.map((pair) => String(pair.key));
  if (isSeq(steps)) {
    return steps.items
      .filter(isMap)
      .map((item) => item.get('name'))
      .filter((name): name is string => typeof name === 'string');
  }
  return [];
}

describe('resolveRange, map form', () => {
  it('anchors a step on its key, not its value', () => {
    expect(slice(MAP_FORM, 'steps.build')).toBe('build');
  });

  it('resolves a nested field', () => {
    expect(slice(MAP_FORM, 'steps.build.image')).toBe('image');
  });

  it('resolves a top-level block', () => {
    expect(slice(MAP_FORM, 'when')).toBe('when');
  });
});

describe('resolveRange, list form', () => {
  it('matches a step by its name field', () => {
    expect(slice(LIST_FORM, 'steps.build')).toBe('build');
  });

  it('picks the right entry, not merely the first', () => {
    const range = resolveRange(parseDocument(LIST_FORM), 'steps.deploy');
    expect(range).not.toBeNull();
    expect(LIST_FORM.slice(range!.start, range!.end)).toBe('deploy');
    expect(range!.start).toBeGreaterThan(LIST_FORM.indexOf('deploy') - 1);
  });

  it('indexes a sequence numerically, for steps written without a name', () => {
    const range = resolveRange(parseDocument(LIST_FORM), 'steps.1');
    expect(range).not.toBeNull();
    expect(LIST_FORM.slice(range!.start, range!.end)).toContain('deploy');
  });

  it('resolves a field inside a list-form step', () => {
    expect(slice(LIST_FORM, 'steps.deploy.image')).toBe('image');
  });
});

describe('resolveRange, failure handling', () => {
  it('falls back to the nearest resolvable ancestor', () => {
    const doc = parseDocument(MAP_FORM);
    expect(resolveRange(doc, 'steps.build.no_such_field')).toEqual(
      resolveRange(doc, 'steps.build'),
    );
  });

  it('falls back across several unresolvable segments', () => {
    const doc = parseDocument(MAP_FORM);
    expect(resolveRange(doc, 'steps.build.a.b.c')).toEqual(resolveRange(doc, 'steps.build'));
  });

  it('returns null when nothing resolves, so the caller can show the diagnostic unanchored', () => {
    expect(resolveRange(parseDocument(MAP_FORM), 'no_such_root')).toBeNull();
  });

  it('returns null for the empty field the linter uses for whole-file diagnostics', () => {
    expect(resolveRange(parseDocument(MAP_FORM), '')).toBeNull();
  });

  it('returns null on an empty document rather than throwing', () => {
    expect(resolveRange(parseDocument(''), 'steps.build')).toBeNull();
  });

  it('does not resolve a step name through an unrelated map', () => {
    expect(resolveRange(parseDocument(MAP_FORM), 'when.build')).toEqual(
      resolveRange(parseDocument(MAP_FORM), 'when'),
    );
  });
});

describe('resolveRange, quoted keys', () => {
  const src = ['steps:', "  'Check package':", '    image: rocker/r-base', ''].join('\n');

  it('covers the quotes, since that is the token to underline', () => {
    expect(slice(src, 'steps.Check package')).toBe("'Check package'");
  });
});

describe('resolveRange, corpus', () => {
  it.each(corpus)('resolves every step of %s to its own name', (name) => {
    const src = read(name);
    const names = stepNames(src);
    expect(names.length).toBeGreaterThan(0);

    for (const step of names) {
      const range = resolveRange(parseDocument(src), `steps.${step}`);
      expect(range, `steps.${step} in ${name}`).not.toBeNull();
      // A quoted key keeps its quotes in the range, which is what should be
      // underlined, so compare against the unquoted name.
      expect(unquote(src.slice(range!.start, range!.end))).toBe(step);
    }
  });
});
