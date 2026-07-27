/**
 * @vitest-environment node
 *
 * The app's default environment is jsdom, where vitest rewrites
 * `import.meta.url` to an http URL and the filesystem cannot be reached from
 * it. This suite only needs Node.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLinter } from '@woodpecker-ci/pipeline-wasm/sync';
import type { Linter } from '@woodpecker-ci/pipeline-wasm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEMPLATES } from './templates';

/**
 * A template that does not lint is worse than a blank page: it teaches the
 * wrong thing and the person cannot tell whose fault it is. Checked against the
 * real engine, skipped where the artifact is absent.
 */
const WASM = new URL('../../../../packages/pipeline-wasm/dist/woodpecker.wasm', import.meta.url);
const WASM_PATH = fileURLToPath(WASM);

const metadata = {
  repo: { name: 'demo', default_branch: 'main' },
  curr: { event: 'push', commit: { branch: 'main', ref: 'refs/heads/main' } },
};

describe.skipIf(!existsSync(WASM_PATH))('templates', () => {
  let wp: Linter;

  beforeAll(async () => {
    wp = await createLinter({ wasmUrl: WASM.href });
  });

  afterAll(() => wp?.dispose());

  it('ships more than one starting point', () => {
    expect(TEMPLATES.length).toBeGreaterThan(1);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s parses', async (_id, template) => {
    expect(await wp.parse(template.source)).toEqual({ ok: true });
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    '%s lints without errors',
    async (_id, template) => {
      const diagnostics = await wp.lint([{ name: '.woodpecker.yaml', data: template.source }]);
      const errors = diagnostics.filter((d) => d.severity === 'error');
      expect(errors, JSON.stringify(errors)).toEqual([]);
    },
  );

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    '%s resolves to stages without a cycle',
    async (_id, template) => {
      const axes = await wp.matrix(template.source);
      const stages = await wp.stages(template.source, metadata, axes[0] ?? {});
      expect(stages.error).toBeUndefined();
      expect(stages.stages.length).toBeGreaterThan(0);
    },
  );

  it('expands the matrix template into one job per version', async () => {
    const template = TEMPLATES.find((t) => t.id === 'matrix');
    expect(await wp.matrix(template!.source)).toHaveLength(2);
  });

  it('runs at least one step on a push to the default branch', async () => {
    for (const template of TEMPLATES) {
      const axes = await wp.matrix(template.source);
      const result = await wp.match(template.source, metadata, axes[0] ?? {});
      expect(Object.values(result.effective).some(Boolean), template.id).toBe(true);
    }
  });

  it('puts the go template in DAG mode, which is what it is demonstrating', async () => {
    const go = TEMPLATES.find((t) => t.id === 'go');
    expect((await wp.stages(go!.source, metadata, {})).mode).toBe('dag');
  });
});
