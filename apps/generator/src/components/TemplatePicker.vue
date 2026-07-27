<script setup lang="ts">
import { TEMPLATES, type Template } from '../data/templates';

defineEmits<{ pick: [template: Template] }>();
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
  </div>
</template>
