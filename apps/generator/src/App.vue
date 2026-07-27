<script setup lang="ts">
import { decodeState } from '@woodpecker-ci/config-core';
import type { Diagnostic } from '@woodpecker-ci/pipeline-wasm';
import { onMounted, ref } from 'vue';
import DiagnosticsBar from './components/DiagnosticsBar.vue';
import EditorPane from './components/EditorPane.vue';
import SimulateBar from './components/SimulateBar.vue';
import TemplatePicker from './components/TemplatePicker.vue';
import WorkflowPanel from './components/WorkflowPanel.vue';
import type { Template } from './data/templates';
import { useConfigStore } from './stores/config';

const config = useConfigStore();
const editor = ref<InstanceType<typeof EditorPane> | null>(null);

onMounted(() => {
  // A shared link skips the template picker. A bad one must open the picker
  // rather than break the app, which is why decodeState returns null.
  const shared = decodeState(location.hash);
  const first = shared ? Object.entries(shared.files)[0] : undefined;
  if (first) {
    config.filename = first[0];
    config.start(first[1]);
  }
});

function pick(template: Template) {
  config.start(template.source);
}

function reveal(diagnostic: Diagnostic) {
  editor.value?.reveal(config.rangeFor(diagnostic));
}
</script>

<template>
  <TemplatePicker v-if="!config.started" @pick="pick" />

  <div v-else class="flex h-screen flex-col bg-white text-slate-900">
    <SimulateBar />

    <!-- Both panes stay visible. Showing the YAML at all times is a teaching
         choice: the tool should make itself unnecessary. -->
    <main class="grid min-h-0 flex-1 grid-cols-1 divide-slate-200 md:grid-cols-2 md:divide-x">
      <WorkflowPanel />
      <EditorPane ref="editor" />
    </main>

    <DiagnosticsBar @reveal="reveal" />
  </div>
</template>
