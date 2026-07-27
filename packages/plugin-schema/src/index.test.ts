import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePluginDoc } from './index.js';
import type { PluginSetting } from './types.js';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const byName = (settings: PluginSetting[], name: string): PluginSetting => {
  const found = settings.find((s) => s.name === name);
  if (!found) throw new Error(`setting ${name} not parsed`);
  return found;
};

describe('parsePluginDoc, v1', () => {
  const doc = parsePluginDoc(fixture('v1.md'));

  it('reports schema version 1 when the sentinel is present', () => {
    expect(doc.schemaVersion).toBe(1);
    expect(doc.warnings).toEqual([]);
  });

  it('keeps the existing frontmatter untouched', () => {
    expect(doc.meta.name).toBe('Docker Buildx');
    expect(doc.meta.tags).toEqual(['docker', 'build']);
    expect(doc.meta.containerImage).toBe('woodpeckerci/plugin-docker-buildx');
  });

  it('parses every row of the table', () => {
    expect(doc.settings).toHaveLength(10);
  });

  it('reads a boolean with a default', () => {
    const s = byName(doc.settings, 'dry_run');
    expect(s.type).toEqual({ kind: 'bool' });
    expect(s.required).toBe(false);
    expect(s.default).toBe('false');
    expect(s.description).toBe('disables docker push');
  });

  it('marks a required setting with no default', () => {
    const s = byName(doc.settings, 'repo');
    expect(s.type).toEqual({ kind: 'list', of: 'string' });
    expect(s.required).toBe(true);
    expect(s.default).toBeNull();
  });

  it('types a secret as secret, since that is what drives from_secret wiring', () => {
    expect(byName(doc.settings, 'password').type).toEqual({ kind: 'secret' });
  });

  it('splits aliases on the slash and keeps the first as canonical', () => {
    const s = byName(doc.settings, 'tag');
    expect(s.aliases).toEqual(['tag', 'tags']);
  });

  it('marks object settings opaque so the form falls back to raw YAML', () => {
    const s = byName(doc.settings, 'logins');
    expect(s.type).toEqual({ kind: 'object' });
    expect(s.opaque).toBe(true);
  });

  it('does not mark anything else opaque', () => {
    const opaque = doc.settings.filter((s) => s.opaque).map((s) => s.name);
    expect(opaque).toEqual(['logins']);
  });

  it('reads inline enum values', () => {
    expect(byName(doc.settings, 'platform').type).toEqual({
      kind: 'enum',
      values: ['amd64', 'arm64'],
    });
  });

  it('keeps a CI variable reference as the default verbatim', () => {
    expect(byName(doc.settings, 'ref').default).toBe('${CI_COMMIT_REF}');
  });
});

describe('parsePluginDoc, legacy', () => {
  const doc = parsePluginDoc(fixture('legacy.md'));

  it('reports no schema version when the sentinel is absent', () => {
    expect(doc.schemaVersion).toBeNull();
  });

  it('still recovers names, defaults and descriptions', () => {
    expect(doc.settings.map((s) => s.name)).toEqual(['depth', 'recursive', 'partial']);
    expect(byName(doc.settings, 'depth').default).toBe('0');
    expect(byName(doc.settings, 'recursive').description).toBe('clone submodules recursively');
  });

  it('types everything unknown, since the legacy table carries no type', () => {
    expect(doc.settings.every((s) => s.type.kind === 'unknown')).toBe(true);
  });

  it('treats a bare none as no default', () => {
    expect(byName(doc.settings, 'partial').default).toBeNull();
  });

  it('cannot know requiredness, so nothing is required', () => {
    expect(doc.settings.every((s) => !s.required)).toBe(true);
  });
});

describe('parsePluginDoc, degradation', () => {
  it('returns an empty settings list and a warning when there is no table', () => {
    const doc = parsePluginDoc(fixture('no-settings.md'));
    expect(doc.settings).toEqual([]);
    expect(doc.warnings.join(' ')).toMatch(/no settings table/i);
    expect(doc.meta.name).toBe('Prose Only');
  });

  it('anchors on the sentinel, not on the first table in the file', () => {
    const doc = parsePluginDoc(fixture('v1-multi-table.md'));
    expect(doc.settings.map((s) => s.name)).toEqual(['token']);
  });

  it('collects warnings instead of throwing on a malformed v1 table', () => {
    const doc = parsePluginDoc(fixture('malformed-v1.md'));

    expect(doc.settings).toHaveLength(2);
    expect(byName(doc.settings, 'alpha').type).toEqual({ kind: 'unknown' });
    expect(byName(doc.settings, 'alpha').required).toBe(false);
    expect(byName(doc.settings, 'alpha').default).toBeNull();

    const joined = doc.warnings.join(' ');
    expect(joined).toMatch(/strng/);
    expect(joined).toMatch(/maybe/);
    expect(joined).toMatch(/Default/);
  });

  it('recovers from unparseable frontmatter without losing the settings', () => {
    const doc = parsePluginDoc(fixture('malformed-v1.md'));
    expect(doc.meta).toEqual({});
    expect(doc.warnings.join(' ')).toMatch(/frontmatter/i);
    expect(doc.settings.length).toBeGreaterThan(0);
  });

  it.each([
    ['', 'empty'],
    ['---\n', 'unterminated frontmatter'],
    ['|||\n|-|\n', 'pipe soup'],
  ])('never throws on %s input', (input) => {
    expect(() => parsePluginDoc(input)).not.toThrow();
  });
});
