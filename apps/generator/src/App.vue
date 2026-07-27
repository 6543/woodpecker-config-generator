<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useConfigStore } from './stores/config';

const { t } = useI18n();
const config = useConfigStore();
</script>

<template>
  <div class="flex h-screen flex-col bg-white text-slate-900">
    <header class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
      <h1 class="text-sm font-semibold">{{ t('app.title') }}</h1>
      <p class="text-xs text-slate-500">{{ t('app.tagline') }}</p>
    </header>

    <!-- Split view, both panes always visible. Showing the generated YAML at
         all times is a teaching choice: the tool should make itself
         unnecessary (spec 6.1). -->
    <main class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
      <section class="min-h-0 overflow-auto border-slate-200 p-4 md:border-r">
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {{ t('panel.form') }}
        </h2>
        <p class="text-sm text-slate-500">{{ t('scaffold.notice') }}</p>
      </section>

      <section class="flex min-h-0 flex-col p-4">
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {{ t('panel.yaml') }}
        </h2>
        <!-- Placeholder for the CodeMirror 6 pane. The editor is real, not a
             read-only preview: edits flow back into the AST. -->
        <textarea
          v-model="config.source"
          class="min-h-0 flex-1 resize-none rounded border border-slate-200 p-2 font-mono text-sm"
          spellcheck="false"
        ></textarea>
      </section>
    </main>

    <footer class="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
      {{ t('panel.diagnostics') }}
    </footer>
  </div>
</template>
