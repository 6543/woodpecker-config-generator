import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isFormHostile, parseDocument, serialize } from './ast.js';

const CORPUS_DIR = new URL('./fixtures/corpus/', import.meta.url);
const corpus = readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
const read = (name: string) => readFileSync(new URL(name, CORPUS_DIR), 'utf8');

describe('round-trip', () => {
  it('has a corpus to test against', () => {
    expect(corpus.length).toBeGreaterThan(30);
  });

  it.each(corpus)('reserialises %s byte for byte', (name) => {
    const src = read(name);
    expect(serialize(parseDocument(src))).toBe(src);
  });
});

describe('mutation', () => {
  const src = [
    '# top comment',
    'when:',
    '  event: [push, pull_request]',
    'steps:',
    '  build:',
    '    image: golang # trailing comment',
    '    commands:',
    '      - go build',
    '  deploy:',
    '    image: alpine',
    '',
  ].join('\n');

  it('keeps comments after an unrelated edit', () => {
    const doc = parseDocument(src);
    doc.setIn(['steps', 'deploy', 'image'], 'debian');
    const out = serialize(doc);

    expect(out).toContain('# top comment');
    expect(out).toContain('# trailing comment');
    expect(out).toContain('image: debian');
  });

  it('keeps key order rather than sorting or reordering', () => {
    const doc = parseDocument(src);
    doc.setIn(['steps', 'build', 'image'], 'rust');
    const out = serialize(doc);

    expect(out.indexOf('when:')).toBeLessThan(out.indexOf('steps:'));
    expect(out.indexOf('build:')).toBeLessThan(out.indexOf('deploy:'));
    expect(out.indexOf('image: rust')).toBeLessThan(out.indexOf('commands:'));
  });

  it('leaves flow collections in flow style', () => {
    const doc = parseDocument(src);
    doc.setIn(['steps', 'deploy', 'image'], 'debian');
    expect(serialize(doc)).toContain('event: [push, pull_request]');
  });
});

describe('isFormHostile', () => {
  const anchored = 'Docker__buildx.yaml';

  it('flags a subtree that resolves an alias', () => {
    const doc = parseDocument(read(anchored));
    expect(isFormHostile(doc, 'steps.dryrun')).toBe(true);
  });

  it('flags the block that declares the anchors', () => {
    const doc = parseDocument(read(anchored));
    expect(isFormHostile(doc, 'variables')).toBe(true);
  });

  it('does not flag a plain step', () => {
    const doc = parseDocument(
      ['steps:', '  build:', '    image: golang', '    commands:', '      - go build', ''].join(
        '\n',
      ),
    );
    expect(isFormHostile(doc, 'steps.build')).toBe(false);
  });

  it('flags a merge key, which the JS dialect and Woodpecker disagree about', () => {
    const doc = parseDocument(
      [
        'base: &base',
        '  image: golang',
        'steps:',
        '  build:',
        '    <<: *base',
        '    commands:',
        '      - go build',
        '',
      ].join('\n'),
    );
    expect(isFormHostile(doc, 'steps.build')).toBe(true);
  });

  it('reports false for a path that does not exist rather than throwing', () => {
    const doc = parseDocument('steps:\n  build:\n    image: golang\n');
    expect(isFormHostile(doc, 'steps.nope.deeper')).toBe(false);
  });
});
