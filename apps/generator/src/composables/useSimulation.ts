import type { Metadata } from '@woodpecker-ci/pipeline-wasm';
import { computed, ref } from 'vue';

/** The events a person can pick in the simulate bar. */
export const SIMULATABLE_EVENTS = [
  'push',
  'pull_request',
  'tag',
  'deployment',
  'cron',
  'manual',
  'release',
] as const;

export type SimulatableEvent = (typeof SIMULATABLE_EVENTS)[number];

/**
 * Builds the metadata the matcher expects.
 *
 * The honest framing is that this is what `woodpecker-cli exec --metadata-file`
 * would select. It is the browser form of an existing sanctioned workflow, not
 * a new source of truth, which is why a real `metadata.json` can replace it
 * wholesale.
 */
export function useSimulation() {
  const event = ref<SimulatableEvent>('push');
  const branch = ref('main');
  const tag = ref('v1.0.0');
  const imported = ref<Metadata | null>(null);

  const metadata = computed<Metadata>(() => {
    if (imported.value) return imported.value;

    return {
      repo: { name: 'demo', default_branch: 'main', branch: 'main' },
      curr: {
        event: event.value,
        commit: {
          branch: branch.value,
          ref: event.value === 'tag' ? `refs/tags/${tag.value}` : `refs/heads/${branch.value}`,
        },
      },
    };
  });

  function importMetadata(raw: string): string | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return 'That file does not contain a metadata object.';
      }
      imported.value = parsed as Metadata;
      return null;
    } catch {
      return 'That file is not valid JSON.';
    }
  }

  function clearImport(): void {
    imported.value = null;
  }

  return { event, branch, tag, imported, metadata, importMetadata, clearImport };
}
