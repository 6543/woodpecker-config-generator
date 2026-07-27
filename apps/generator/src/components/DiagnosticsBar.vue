<script setup lang="ts">
import type { Diagnostic } from '@woodpecker-ci/pipeline-wasm';
import { ref } from 'vue';
import { useConfigStore } from '../stores/config';

const config = useConfigStore();
const open = ref(false);

defineEmits<{ reveal: [diagnostic: Diagnostic] }>();
</script>

<template>
  <div class="border-t border-slate-200 bg-white">
    <button
      type="button"
      class="flex w-full items-center gap-3 px-4 py-2 text-left text-xs"
      @click="open = !open"
    >
      <span :class="config.errorCount ? 'text-red-700' : 'text-slate-500'">
        {{ config.errorCount }} {{ config.errorCount === 1 ? 'error' : 'errors' }}
      </span>
      <span :class="config.warningCount ? 'text-amber-700' : 'text-slate-500'">
        {{ config.warningCount }} {{ config.warningCount === 1 ? 'warning' : 'warnings' }}
      </span>
      <span v-if="config.engineLoading" class="text-slate-400">loading engine</span>
      <span v-else-if="config.analysing" class="text-slate-400">checking</span>
      <span class="ml-auto text-slate-400">{{ open ? 'Hide' : 'Show' }}</span>
    </button>

    <ul v-if="open" class="max-h-56 overflow-auto border-t border-slate-100">
      <li v-if="config.engineFailure" class="px-4 py-2 text-xs text-red-700">
        The engine failed to load: {{ config.engineFailure }}
      </li>
      <li v-if="config.parseError" class="px-4 py-2 text-xs text-red-700">
        {{ config.parseError }}
      </li>
      <li
        v-for="(diagnostic, index) in config.diagnostics"
        :key="index"
        class="border-t border-slate-100 first:border-t-0"
      >
        <button
          type="button"
          class="flex w-full gap-2 px-4 py-2 text-left text-xs hover:bg-slate-50"
          @click="$emit('reveal', diagnostic)"
        >
          <span
            class="shrink-0 font-medium"
            :class="diagnostic.severity === 'error' ? 'text-red-700' : 'text-amber-700'"
          >
            {{ diagnostic.severity }}
          </span>
          <span class="text-slate-700">{{ diagnostic.message }}</span>
          <code v-if="diagnostic.field" class="ml-auto shrink-0 text-slate-400">
            {{ diagnostic.field }}
          </code>
        </button>
      </li>
      <li
        v-if="!config.diagnostics.length && !config.parseError"
        class="px-4 py-2 text-xs text-slate-500"
      >
        Nothing to report.
      </li>
    </ul>
  </div>
</template>
