import { readFileSync } from 'node:fs';
import { parsePluginDoc, type PluginDoc } from '@woodpecker-ci/plugin-schema';
import { describe, expect, it } from 'vitest';
import { parseDocument } from './ast.js';
import { buildChecklist } from './checklist.js';

const corpus = (name: string) =>
  readFileSync(new URL(`./fixtures/corpus/${name}`, import.meta.url), 'utf8');

const checklist = (src: string, plugins?: Map<string, PluginDoc>) =>
  buildChecklist(parseDocument(src), plugins);

describe('secrets', () => {
  it('names the secret and the step that uses it', () => {
    const items = checklist(
      [
        'steps:',
        '  publish:',
        '    image: alpine',
        '    environment:',
        '      TOKEN:',
        '        from_secret: codeberg_token',
        '',
      ].join('\n'),
    );

    expect(items).toEqual([{ kind: 'secret', subject: 'codeberg_token', usedBy: ['publish'] }]);
  });

  it('finds a secret nested in plugin settings, not only in environment', () => {
    const items = checklist(
      [
        'steps:',
        '  publish:',
        '    image: woodpeckerci/plugin-docker-buildx',
        '    settings:',
        '      password:',
        '        from_secret: registry_password',
        '',
      ].join('\n'),
    );

    expect(items.map((i) => i.subject)).toEqual(['registry_password']);
  });

  it('collapses one secret used by several steps into a single item', () => {
    const items = checklist(
      [
        'steps:',
        '  a:',
        '    image: alpine',
        '    environment:',
        '      T:',
        '        from_secret: shared',
        '  b:',
        '    image: alpine',
        '    environment:',
        '      T:',
        '        from_secret: shared',
        '',
      ].join('\n'),
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.usedBy).toEqual(['a', 'b']);
  });

  it('reads step names from the list form', () => {
    const items = checklist(
      [
        'steps:',
        '  - name: deploy',
        '    image: alpine',
        '    environment:',
        '      T:',
        '        from_secret: deploy_key',
        '',
      ].join('\n'),
    );

    expect(items[0]?.usedBy).toEqual(['deploy']);
  });

  it('derives the checklist a real config only documents in header comments', () => {
    const items = checklist(corpus('Hugo__.woodpecker.yaml'));
    expect(items.map((i) => i.subject).sort()).toEqual(['codeberg_token', 'mail']);
  });

  it('returns nothing for a config that needs no setup', () => {
    expect(checklist('steps:\n  build:\n    image: golang\n')).toEqual([]);
  });
});

describe('required plugin settings', () => {
  const buildx: PluginDoc = {
    meta: { name: 'Docker Buildx' },
    schemaVersion: 1,
    warnings: [],
    settings: [
      {
        name: 'repo',
        aliases: ['repo'],
        type: { kind: 'list', of: 'string' },
        required: true,
        default: null,
        description: 'image repo',
        opaque: false,
      },
      {
        name: 'tag',
        aliases: ['tag', 'tags'],
        type: { kind: 'string' },
        required: true,
        default: null,
        description: 'image tags',
        opaque: false,
      },
      {
        name: 'dry_run',
        aliases: ['dry_run'],
        type: { kind: 'bool' },
        required: false,
        default: 'false',
        description: 'skip push',
        opaque: false,
      },
    ],
  };
  const catalog = new Map([['woodpeckerci/plugin-docker-buildx', buildx]]);

  const step = (settings: string[]) =>
    [
      'steps:',
      '  publish:',
      '    image: woodpeckerci/plugin-docker-buildx:5.0.0',
      '    settings:',
      ...settings.map((line) => `      ${line}`),
      '',
    ].join('\n');

  it('flags a required setting that is unset', () => {
    const items = checklist(step(['dry_run: true']), catalog);
    expect(items).toEqual([
      { kind: 'required-setting', subject: 'repo', usedBy: ['publish'], plugin: 'Docker Buildx' },
      { kind: 'required-setting', subject: 'tag', usedBy: ['publish'], plugin: 'Docker Buildx' },
    ]);
  });

  it('accepts a required setting written under an alias', () => {
    const items = checklist(step(['repo: example/app', 'tags: latest']), catalog);
    expect(items).toEqual([]);
  });

  it('matches the plugin despite a tag on the image', () => {
    expect(checklist(step([]), catalog).length).toBeGreaterThan(0);
  });

  it('matches the plugin despite a digest on the image', () => {
    const src = [
      'steps:',
      '  publish:',
      '    image: woodpeckerci/plugin-docker-buildx@sha256:abc123',
      '    settings:',
      '      repo: example/app',
      '      tag: latest',
      '',
    ].join('\n');
    expect(checklist(src, catalog)).toEqual([]);
  });

  it('says nothing about an image with no plugin documentation', () => {
    expect(checklist(step([]), new Map())).toEqual([]);
  });

  it('composes with a real v1 document parsed by plugin-schema', () => {
    const doc = parsePluginDoc(
      [
        '<!-- woodpecker-plugin-settings v1 -->',
        '',
        '| Name    | Type     | Required | Default | Description |',
        '| ------- | -------- | -------- | ------- | ----------- |',
        '| `token` | `secret` | yes      | _none_  | forge token |',
        '',
      ].join('\n'),
    );

    const items = checklist(
      'steps:\n  a:\n    image: example/plugin\n',
      new Map([['example/plugin', doc]]),
    );
    expect(items).toEqual([
      { kind: 'required-setting', subject: 'token', usedBy: ['a'], plugin: 'example/plugin' },
    ]);
  });
});

describe('degradation', () => {
  it.each([
    ['', 'empty'],
    ['steps: []\n', 'no steps'],
    ['- 1\n- 2\n', 'not a mapping'],
  ])('returns an empty list rather than throwing on %s', (src) => {
    expect(() => checklist(src)).not.toThrow();
    expect(checklist(src)).toEqual([]);
  });
});
