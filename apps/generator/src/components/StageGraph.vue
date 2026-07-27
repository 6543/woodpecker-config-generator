<script setup lang="ts">
import { computed } from 'vue';
import { useConfigStore } from '../stores/config';

const config = useConfigStore();

const stages = computed(() => config.stages);

/**
 * The mixed case is the classic footgun: some steps carry depends_on and some
 * do not, so the ones without stop waiting for the steps above them.
 */
const mixed = computed(() => {
  const plain = config.document?.toJS() as { steps?: unknown } | null;
  const steps = plain?.steps;
  const entries = Array.isArray(steps)
    ? steps
    : steps !== null && typeof steps === 'object'
      ? Object.values(steps as Record<string, unknown>)
      : [];

  const withDeps = entries.filter(
    (step) => step !== null && typeof step === 'object' && 'depends_on' in step,
  );
  return withDeps.length > 0 && withDeps.length < entries.length;
});
</script>

<template>
  <section v-if="stages" class="border-b border-slate-200 px-4 py-3">
    <div class="flex items-center gap-2">
      <h2 class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Execution</h2>
      <span
        class="rounded px-1.5 py-0.5 text-[11px] font-medium"
        :class="
          stages.mode === 'dag' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'
        "
      >
        {{ stages.mode === 'dag' ? 'DAG' : 'Sequential' }}
      </span>
    </div>

    <p class="mt-1 text-sm text-slate-600">
      {{
        stages.mode === 'dag'
          ? 'Steps run in parallel where dependencies allow. Order is determined only by depends_on.'
          : 'Steps run one after another, top to bottom.'
      }}
    </p>

    <p v-if="mixed" class="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900">
      Some steps declare <code>depends_on</code> and some do not. The ones without it no longer wait
      for the steps above them.
    </p>

    <p v-if="stages.error" class="mt-2 rounded bg-red-50 p-2 text-sm text-red-800">
      {{ stages.error }}
    </p>

    <ol v-else class="mt-3 space-y-1">
      <li v-for="(group, index) in stages.stages" :key="index" class="flex flex-wrap gap-1">
        <span
          v-for="name in group"
          :key="name"
          class="rounded px-2 py-0.5 text-xs"
          :class="
            stages.injected.includes(name)
              ? 'border border-dashed border-slate-300 text-slate-500'
              : 'bg-slate-100 text-slate-800'
          "
          :title="stages.injected.includes(name) ? 'Added automatically' : undefined"
        >
          {{ name }}
        </span>
      </li>
    </ol>
  </section>
</template>
