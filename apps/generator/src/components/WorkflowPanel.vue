<script setup lang="ts">
import { computed } from 'vue';
import { useConfigStore } from '../stores/config';
import StageGraph from './StageGraph.vue';

const config = useConfigStore();

const stepNames = computed(() => Object.keys(config.match?.steps ?? {}));

const workflowExcluded = computed(() => config.match !== null && !config.match.workflow);
</script>

<template>
  <div class="min-h-0 overflow-auto">
    <section class="border-b border-slate-200 px-4 py-3">
      <h2 class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Workflow</h2>
      <p class="mt-1 text-sm text-slate-700">{{ config.workflowProse }}</p>
    </section>

    <StageGraph />

    <section class="border-b border-slate-200 px-4 py-3">
      <h2 class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Steps</h2>

      <!-- One explanation beats N confusing per-step messages. -->
      <p v-if="workflowExcluded" class="mt-2 rounded bg-slate-100 p-2 text-sm text-slate-700">
        The workflow filter excludes this event, so no step runs. Change the simulated event above
        to see the steps that would run.
      </p>

      <ul class="mt-2 space-y-2">
        <li v-for="name in stepNames" :key="name">
          <div class="flex items-center gap-2">
            <span
              class="h-2 w-2 shrink-0 rounded-full"
              :class="config.match?.effective[name] ? 'bg-emerald-500' : 'bg-slate-300'"
            />
            <span
              class="text-sm font-medium"
              :class="config.match?.effective[name] ? 'text-slate-900' : 'text-slate-400'"
            >
              {{ name }}
            </span>
            <span class="text-xs text-slate-400">
              {{ config.match?.effective[name] ? 'runs' : 'skipped' }}
            </span>
          </div>
          <p class="mt-0.5 ml-4 text-xs text-slate-600">{{ config.stepProse(name) }}</p>
        </li>
      </ul>
    </section>

    <section v-if="config.axes.length > 1" class="border-b border-slate-200 px-4 py-3">
      <h2 class="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Matrix, {{ config.axes.length }} jobs
      </h2>
      <p class="mt-1 text-xs text-slate-600">
        Each combination is a separate job. Pick one to see what it runs.
      </p>
      <div class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="(entry, index) in config.axes"
          :key="index"
          type="button"
          class="rounded border px-2 py-0.5 text-xs"
          :class="
            index === config.axisIndex
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 text-slate-700'
          "
          @click="config.axisIndex = index"
        >
          {{
            Object.entries(entry)
              .map(([k, v]) => `${k}=${v}`)
              .join(' ')
          }}
        </button>
      </div>
    </section>

    <section v-if="config.checklist.length" class="px-4 py-3">
      <h2 class="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Before this pipeline can run
      </h2>
      <ul class="mt-2 space-y-1 text-sm text-slate-700">
        <li v-for="item in config.checklist" :key="item.kind + item.subject">
          <template v-if="item.kind === 'secret'">
            Create secret <code>{{ item.subject }}</code
            >, used by
            {{ item.usedBy.length > 1 ? 'steps' : 'step' }}
            <code>{{ item.usedBy.join('</code>, <code>') }}</code>
          </template>
          <template v-else>
            Plugin <code>{{ item.plugin }}</code> requires <code>{{ item.subject }}</code
            >, currently unset
          </template>
        </li>
      </ul>
    </section>
  </div>
</template>
