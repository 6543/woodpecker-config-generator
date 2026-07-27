<script setup lang="ts">
import { encodeState } from '@woodpecker-ci/config-core';
import { ref } from 'vue';
import { useConfigStore } from '../stores/config';

const config = useConfigStore();
const textarea = ref<HTMLTextAreaElement | null>(null);
const notice = ref<string | null>(null);

/**
 * Selecting the offending text is what the path-to-range mapping is for. A
 * diagnostic carries a YAML path and no line number, so without it the panel
 * could only ever be a list.
 */
function reveal(range: { start: number; end: number } | null) {
  const element = textarea.value;
  if (!element || !range) return;
  element.focus();
  element.setSelectionRange(range.start, range.end);
}

defineExpose({ reveal });

function download() {
  const blob = new Blob([config.source], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = config.filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function share() {
  const fragment = encodeState({ files: { [config.filename]: config.source } });
  const url = `${location.origin}${location.pathname}#${fragment}`;
  history.replaceState(null, '', `#${fragment}`);
  try {
    await navigator.clipboard.writeText(url);
    notice.value = 'Link copied.';
  } catch {
    notice.value = 'Link is in the address bar.';
  }
  setTimeout(() => (notice.value = null), 2500);
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
      <h2 class="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {{ config.filename }}
      </h2>
      <span class="text-[11px] text-slate-400">
        Place this at the repository root. Use <code>.woodpecker/name.yaml</code> for several
        workflows.
      </span>
      <div class="ml-auto flex items-center gap-2">
        <span v-if="notice" class="text-[11px] text-slate-500">{{ notice }}</span>
        <button type="button" class="text-xs text-slate-900 underline" @click="share">Share</button>
        <button type="button" class="text-xs text-slate-900 underline" @click="download">
          Download
        </button>
      </div>
    </div>

    <textarea
      ref="textarea"
      v-model="config.source"
      spellcheck="false"
      autocapitalize="off"
      autocorrect="off"
      class="min-h-0 flex-1 resize-none p-4 font-mono text-sm leading-relaxed text-slate-800 focus:outline-none"
    ></textarea>
  </div>
</template>
