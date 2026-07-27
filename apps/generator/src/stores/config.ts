import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Holds the edited config. The YAML text is the transport; the AST in
 * `@woodpecker-ci/config-core` is the model (spec 3). Both panes of the split
 * view read from here, which is what keeps form edits and text edits in sync.
 */
export const useConfigStore = defineStore('config', () => {
  const source = ref('');
  const filename = ref('.woodpecker.yaml');

  function setSource(next: string) {
    source.value = next;
  }

  return { source, filename, setSource };
});
