<script setup lang="ts">
import { importFromUrl } from '@woodpecker-ci/config-core';
import { ref } from 'vue';
import { TEMPLATES, type Template } from '../data/templates';

const emit = defineEmits<{
  pick: [template: Template];
  load: [payload: { filename: string; source: string }];
}>();

const url = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

async function load() {
  if (url.value.trim() === '') return;
  busy.value = true;
  error.value = null;

  const result = await importFromUrl(url.value.trim());
  busy.value = false;

  if (result.ok) emit('load', { filename: result.filename, source: result.source });
  else error.value = result.reason;
}
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
    <h1 class="text-2xl font-semibold text-slate-900">Start a Woodpecker pipeline</h1>
    <p class="mt-2 text-sm text-slate-600">
      Pick something close to what you need. You can edit everything afterwards, and the panel on
      the left will tell you what runs before you push.
    </p>

    <ul class="mt-8 grid gap-3">
      <li v-for="template in TEMPLATES" :key="template.id">
        <button
          type="button"
          class="w-full rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:outline-none"
          @click="$emit('pick', template)"
        >
          <span class="block text-sm font-medium text-slate-900">{{ template.name }}</span>
          <span class="mt-1 block text-sm text-slate-600">{{ template.summary }}</span>
        </button>
      </li>
    </ul>

    <div class="mt-8 border-t border-slate-200 pt-6">
      <h2 class="text-sm font-medium text-slate-900">Or open one you already have</h2>
      <p class="mt-1 text-sm text-slate-600">
        Paste a link to a raw config. Nothing is uploaded and no credentials are sent.
      </p>

      <div class="mt-3 flex gap-2">
        <input
          v-model="url"
          type="url"
          inputmode="url"
          placeholder="https://codeberg.org/owner/repo/raw/branch/main/.woodpecker.yaml"
          class="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          @keyup.enter="load"
        />
        <button
          type="button"
          class="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          :disabled="busy"
          @click="load"
        >
          {{ busy ? 'Opening' : 'Open' }}
        </button>
      </div>

      <p v-if="error" class="mt-2 text-sm text-red-700">{{ error }}</p>
    </div>
  </div>
</template>
