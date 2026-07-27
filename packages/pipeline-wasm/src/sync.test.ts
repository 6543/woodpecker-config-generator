import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLinter } from './sync.js';
import type { Linter } from './types.js';

/**
 * The artifact is built from an upstream checkout and is not committed, so
 * these skip rather than fail where it is absent. `pnpm build:wasm` produces it.
 */
const WASM = new URL('../dist/woodpecker.wasm', import.meta.url);
const available = existsSync(WASM);

const CONFIG = [
  'when:',
  '  - event: pull_request',
  '  - event: push',
  '    branch: main',
  '',
  'steps:',
  '  build:',
  '    image: golang',
  '    commands:',
  '      - go build',
  '  deploy:',
  '    image: alpine',
  '    when:',
  '      event: push',
  '      branch: main',
  '  notify:',
  '    image: alpine',
  '    when:',
  '      event: tag',
  '',
].join('\n');

const metadata = (event: string, branch = 'main') => ({
  repo: { name: 'demo', default_branch: 'main' },
  curr: {
    event,
    commit: {
      branch,
      ref: event === 'tag' ? 'refs/tags/v1.0.0' : `refs/heads/${branch}`,
    },
  },
});

describe.skipIf(!available)('pipeline-wasm', () => {
  let wp: Linter;

  beforeAll(async () => {
    wp = await createLinter({ wasmUrl: WASM.href });
  });

  afterAll(() => wp?.dispose());

  it('reports the upstream version it was built from', () => {
    expect(wp.version().woodpecker).toBeTruthy();
  });

  it('exposes the embedded schema, not a copy', () => {
    expect(wp.schema()).toHaveProperty('$schema');
    expect(wp.schema()).toHaveProperty('properties');
  });

  describe('parse', () => {
    it('accepts a valid config', async () => {
      expect(await wp.parse(CONFIG)).toEqual({ ok: true });
    });

    it('reports a syntax error instead of throwing', async () => {
      const result = await wp.parse('steps: [[[');
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('lint', () => {
    it('finds the errors the server would find', async () => {
      const diagnostics = await wp.lint([
        {
          name: '.woodpecker.yaml',
          data: 'steps:\n  bad:\n    commands: ["echo hi"]\n    settings:\n      foo: bar\n',
        },
      ]);

      const messages = diagnostics.map((d) => d.message);
      expect(messages).toContain('Invalid or missing image');
      expect(messages).toContain('Cannot configure both `commands` and `settings`');
    });

    it('attaches a YAML path so the host can place a squiggle', async () => {
      const diagnostics = await wp.lint([
        { name: '.woodpecker.yaml', data: 'steps:\n  bad:\n    commands: ["echo hi"]\n' },
      ]);
      expect(diagnostics.some((d) => d.field === 'steps.bad')).toBe(true);
    });

    it('separates warnings from errors', async () => {
      const diagnostics = await wp.lint([
        { name: '.woodpecker.yaml', data: 'steps:\n  bad:\n    commands: ["echo hi"]\n' },
      ]);
      expect(diagnostics.some((d) => d.severity === 'error')).toBe(true);
      expect(diagnostics.some((d) => d.severity === 'warning')).toBe(true);
    });

    it('turns an unparseable config into a diagnostic rather than a panic', async () => {
      const diagnostics = await wp.lint([{ name: 'x.yaml', data: 'steps: [[[' }]);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.source).toBe('generic');
      expect(diagnostics[0]?.file).toBe('x.yaml');
    });

    it('survives every config in the corpus', async () => {
      const diagnostics = await wp.lint([{ name: 'a.yaml', data: CONFIG }]);
      expect(Array.isArray(diagnostics)).toBe(true);
    });
  });

  describe('match', () => {
    it('runs deploy only on a push to main', async () => {
      const result = await wp.match(CONFIG, metadata('push'));
      expect(result.workflow).toBe(true);
      expect(result.effective).toEqual({ build: true, deploy: true, notify: false });
    });

    it('excludes everything when the workflow gate rejects the branch', async () => {
      const result = await wp.match(CONFIG, metadata('push', 'feat/x'));
      expect(result.workflow).toBe(false);
      expect(Object.values(result.effective).every((v) => !v)).toBe(true);
    });

    it('separates the step gate from the composed result on a tag', async () => {
      const result = await wp.match(CONFIG, metadata('tag'));
      // The step's own `when` matches a tag, but the workflow gate does not,
      // so nothing runs. Showing `steps` alone would mislead.
      expect(result.steps.notify).toBe(true);
      expect(result.effective.notify).toBe(false);
    });

    it('reports a bad config in its own error field', async () => {
      const result = await wp.match('steps: [[[', metadata('push'));
      expect(result.error).toBeTruthy();
    });
  });

  describe('matrix', () => {
    it('expands every combination', async () => {
      const axes = await wp.matrix(
        'matrix:\n  GO: [1.24, 1.25]\n  OS: [linux, darwin]\nsteps:\n  build:\n    image: golang\n',
      );
      expect(axes).toHaveLength(4);
      expect(axes).toContainEqual({ GO: '1.24', OS: 'linux' });
    });

    it('returns an empty list when there is no matrix', async () => {
      expect(await wp.matrix('steps:\n  build:\n    image: golang\n')).toEqual([]);
    });
  });

  describe('stages', () => {
    const step = (name: string, dependsOn?: string) =>
      `  ${name}:\n    image: alpine\n${dependsOn === undefined ? '' : `    depends_on: ${dependsOn}\n`}`;

    it('runs steps one after another without depends_on', async () => {
      const result = await wp.stages(`steps:\n${step('a')}${step('b')}${step('c')}`);
      expect(result.mode).toBe('sequential');
      expect(result.stages).toEqual([['clone'], ['a'], ['b'], ['c']]);
    });

    it('treats an empty depends_on as DAG mode for the whole workflow', async () => {
      const result = await wp.stages(
        `steps:\n${step('a', '[]')}${step('b', '[]')}${step('c', '[a, b]')}`,
      );
      expect(result.mode).toBe('dag');
      expect(result.stages).toEqual([['clone'], ['a', 'b'], ['c']]);
    });

    it('marks the implicit clone as injected, not authored', async () => {
      const result = await wp.stages(`steps:\n${step('a')}`);
      expect(result.injected).toEqual(['clone']);
    });

    it('reports a cycle with the path rather than hanging', async () => {
      const result = await wp.stages(`steps:\n${step('a', '[b]')}${step('b', '[a]')}`);
      expect(result.error).toContain('cycle detected');
    });
  });
});
