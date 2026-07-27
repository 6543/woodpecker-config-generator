import { describe, expect, it } from 'vitest';
import { useSimulation } from './useSimulation';

describe('useSimulation', () => {
  it('builds a branch ref for branch events', () => {
    const sim = useSimulation();
    sim.event.value = 'push';
    sim.branch.value = 'feat/x';
    expect(sim.metadata.value.curr).toMatchObject({
      event: 'push',
      commit: { branch: 'feat/x', ref: 'refs/heads/feat/x' },
    });
  });

  it('builds a tag ref for tag events, since branch filters are skipped there', () => {
    const sim = useSimulation();
    sim.event.value = 'tag';
    sim.tag.value = 'v2.1.0';
    expect(sim.metadata.value.curr).toMatchObject({
      event: 'tag',
      commit: { ref: 'refs/tags/v2.1.0' },
    });
  });

  it('lets an imported metadata.json replace the dropdowns wholesale', () => {
    const sim = useSimulation();
    expect(sim.importMetadata('{"curr":{"event":"deployment"}}')).toBeNull();
    expect(sim.metadata.value).toEqual({ curr: { event: 'deployment' } });
  });

  it('reports an unusable file instead of throwing', () => {
    const sim = useSimulation();
    expect(sim.importMetadata('not json')).toMatch(/not valid JSON/);
    expect(sim.importMetadata('[1,2,3]')).toMatch(/metadata object/);
    expect(sim.imported.value).toBeNull();
  });

  it('returns to the dropdowns when the import is cleared', () => {
    const sim = useSimulation();
    sim.importMetadata('{"curr":{"event":"cron"}}');
    sim.clearImport();
    expect(sim.metadata.value.repo).toBeDefined();
  });
});
