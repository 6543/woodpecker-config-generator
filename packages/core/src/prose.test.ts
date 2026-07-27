import { existsSync } from 'node:fs';
import { createLinter } from '@woodpecker-ci/pipeline-wasm/sync';
import type { Linter } from '@woodpecker-ci/pipeline-wasm';
import { stringify } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzeWhen, EVENTS, type WhenAST } from './analyze.js';
import { describeWhen } from './prose.js';

const step = { level: 'step' } as const;
const workflow = { level: 'workflow' } as const;

describe('describeWhen, list form is OR', () => {
  it('joins entries with or', () => {
    const sentence = describeWhen(
      [{ event: 'pull_request' }, { event: 'push', branch: 'main' }],
      workflow,
    );
    expect(sentence).toBe('Runs on pull requests, or pushes on branch `main`.');
  });
});

describe('describeWhen, map form is AND', () => {
  it('states every key of a single clause', () => {
    const sentence = describeWhen({ event: 'push', branch: ['main', 'dev'] }, workflow);
    expect(sentence).toBe('Runs on pushes on branch `main` or `dev`.');
  });
});

describe('describeWhen, qualifiers the matcher silently applies', () => {
  it('says a branch filter does nothing on a tag event', () => {
    const sentence = describeWhen({ event: 'tag', branch: 'main' }, workflow);
    expect(sentence).toContain('no effect');
    expect(sentence).toContain('tag');
  });

  it('does not qualify a path filter when every admitted event honours it', () => {
    const sentence = describeWhen({ event: 'push', path: 'docs/**' }, workflow);
    expect(sentence).toBe('Runs on pushes touching `docs/**`.');
  });

  it('qualifies a path filter when only some admitted events honour it', () => {
    const sentence = describeWhen({ event: ['push', 'tag'], path: 'docs/**' }, workflow);
    expect(sentence).toContain('push and pull request events only');
  });

  it('qualifies a branch filter when only some admitted events honour it', () => {
    const sentence = describeWhen({ event: ['push', 'tag'], branch: 'main' }, workflow);
    expect(sentence).toContain('skipped for tag events');
  });

  it('says a path filter does nothing on a deployment event', () => {
    const sentence = describeWhen({ event: 'deployment', path: 'docs/**' }, workflow);
    expect(sentence).toContain('no effect');
  });

  it('says a matrix filter does nothing at workflow level', () => {
    expect(describeWhen({ matrix: { GO: '1.26' } }, workflow)).toContain('step-level only');
  });

  it('accepts a matrix filter at step level', () => {
    const sentence = describeWhen({ matrix: { GO: '1.26' } }, step);
    expect(sentence).toContain('`GO=1.26`');
    expect(sentence).not.toContain('no effect');
  });

  it('renders an expression raw rather than paraphrasing it', () => {
    const sentence = describeWhen({ evaluate: 'CI_COMMIT_MESSAGE contains "[skip]"' }, workflow);
    expect(sentence).toContain('`CI_COMMIT_MESSAGE contains "[skip]"`');
  });
});

describe('describeWhen, empty', () => {
  it.each([
    [undefined, 'undefined'],
    [{}, 'an empty map'],
    [[], 'an empty list'],
  ])('says it runs for every event given %s', (when) => {
    expect(describeWhen(when as WhenAST | undefined, workflow)).toBe('Runs for every event.');
  });
});

describe('describeWhen, composition', () => {
  it('appends the workflow filter, which is evaluated independently', () => {
    const sentence = describeWhen(
      { event: 'tag' },
      {
        level: 'step',
        workflowWhen: { event: 'push', branch: 'main' },
      },
    );
    expect(sentence).toContain('Runs on tags.');
    expect(sentence).toContain('The workflow filter also applies');
    expect(sentence).toContain('pushes on branch `main`');
  });

  it('stays quiet when the workflow constrains nothing', () => {
    const sentence = describeWhen({ event: 'push' }, { level: 'step', workflowWhen: {} });
    expect(sentence).toBe('Runs on pushes.');
  });
});

/**
 * The cross-check the design calls for: the events a sentence claims must be
 * exactly the events the real matcher admits. Prose that disagrees with the
 * engine is the failure mode this whole package exists to avoid.
 *
 * Skipped where the WASM artifact is absent, since it is built from an upstream
 * checkout and not committed.
 */
const WASM = new URL('../../pipeline-wasm/dist/woodpecker.wasm', import.meta.url);

const CASES: WhenAST[] = [
  { event: 'push' },
  { event: ['push', 'pull_request'] },
  { event: 'tag' },
  { event: 'cron' },
  { event: 'manual' },
  { event: 'deployment' },
  { event: 'release' },
  { event: 'push', branch: 'main' },
  { event: 'tag', branch: 'main' },
  [{ event: 'pull_request' }, { event: 'push', branch: 'main' }],
  [{ event: 'tag' }, { event: 'cron' }],
  { event: ['push', 'tag', 'manual'] },
];

const metadataFor = (event: string) => ({
  repo: { name: 'demo', default_branch: 'main' },
  curr: {
    event,
    commit: {
      branch: 'main',
      ref: event === 'tag' ? 'refs/tags/v1.0.0' : 'refs/heads/main',
    },
  },
});

describe.skipIf(!existsSync(WASM))('prose agrees with the matcher', () => {
  let wp: Linter;

  beforeAll(async () => {
    wp = await createLinter({ wasmUrl: WASM.href });
  });

  afterAll(() => wp?.dispose());

  it.each(CASES.map((when, index) => [index, when] as const))(
    'case %i claims exactly the events the engine admits',
    async (_index, when) => {
      const src = stringify({ when, steps: { build: { image: 'alpine' } } });

      const admitted: string[] = [];
      for (const event of EVENTS) {
        const result = await wp.match(src, metadataFor(event));
        expect(result.error, `matcher rejected the config for ${event}`).toBeUndefined();
        if (result.workflow) admitted.push(event);
      }

      expect(analyzeWhen(when).events, JSON.stringify(when)).toEqual(admitted);
    },
  );

  it('claims every event for an unconstrained block, and the engine agrees', async () => {
    const src = stringify({ steps: { build: { image: 'alpine' } } });
    for (const event of EVENTS) {
      const result = await wp.match(src, metadataFor(event));
      expect(result.workflow, event).toBe(true);
    }
    expect(analyzeWhen(undefined).events).toEqual([...EVENTS]);
  });
});
