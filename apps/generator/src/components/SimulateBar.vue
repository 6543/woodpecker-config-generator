<script setup lang="ts">
import { ref } from 'vue';
import { SIMULATABLE_EVENTS } from '../composables/useSimulation';
import { useConfigStore } from '../stores/config';

const config = useConfigStore();
const importError = ref<string | null>(null);

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  void file.text().then((text) => {
    importError.value = config.simulation.importMetadata(text);
  });
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2">
    <span class="text-xs font-medium tracking-wide text-slate-500 uppercase">Simulate</span>

    <template v-if="!config.simulation.imported">
      <label class="text-xs text-slate-600">
        Event
        <select
          v-model="config.simulation.event"
          class="ml-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        >
          <option v-for="name in SIMULATABLE_EVENTS" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>

      <label v-if="config.simulation.event !== 'tag'" class="text-xs text-slate-600">
        Branch
        <input
          v-model="config.simulation.branch"
          class="ml-1 w-40 rounded border border-slate-300 px-2 py-1 text-xs"
        />
      </label>

      <label v-else class="text-xs text-slate-600">
        Tag
        <input
          v-model="config.simulation.tag"
          class="ml-1 w-40 rounded border border-slate-300 px-2 py-1 text-xs"
        />
      </label>
    </template>

    <template v-else>
      <span class="text-xs text-slate-600">Using an imported metadata.json</span>
      <button
        type="button"
        class="text-xs text-slate-900 underline"
        @click="config.simulation.clearImport()"
      >
        Use the dropdowns instead
      </button>
    </template>

    <label class="ml-auto text-xs text-slate-600">
      Woodpecker
      <select
        class="ml-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        title="Only the current major is supported. 1.x and 2.x differ materially."
      >
        <option>3.x</option>
      </select>
    </label>

    <label class="cursor-pointer text-xs text-slate-600 underline">
      Import metadata.json
      <input type="file" accept="application/json,.json" class="sr-only" @change="onFile" />
    </label>

    <p v-if="importError" class="w-full text-xs text-red-700">{{ importError }}</p>
  </div>
</template>
