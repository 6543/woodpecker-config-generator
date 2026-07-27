import {
  buildChecklist,
  describeWhen,
  parseDocument,
  resolveRange,
  type ChecklistItem,
  type TextRange,
  type WhenAST,
} from '@woodpecker-ci/config-core';
import type { Axis, Diagnostic, MatchResult, StageResult } from '@woodpecker-ci/pipeline-wasm';
import { defineStore } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';
import { useEngine } from '../composables/useEngine';
import { useSimulation } from '../composables/useSimulation';
import { DEFAULT_TEMPLATE } from '../data/templates';

const FILENAME = '.woodpecker.yaml';

/**
 * Holds the edited config and everything derived from it.
 *
 * The YAML text is what the editor binds to; the AST is the model. Both panes
 * read from here, which keeps form edits and text edits in sync without a round
 * trip through a plain object that would lose comments.
 */
export const useConfigStore = defineStore('config', () => {
  const { engine, loading, failure, load } = useEngine();
  const simulation = useSimulation();

  const source = ref(DEFAULT_TEMPLATE.source);
  const filename = ref(FILENAME);
  const started = ref(false);

  const diagnostics = shallowRef<Diagnostic[]>([]);
  const match = shallowRef<MatchResult | null>(null);
  const stages = shallowRef<StageResult | null>(null);
  const axes = shallowRef<Axis[]>([]);
  const axisIndex = ref(0);
  const analysing = ref(false);

  /**
   * Substitution happens per matrix job, so everything downstream needs one
   * combination. Without it `image: golang:${VERSION}` expands to a trailing
   * colon and the config stops being valid YAML.
   */
  const axis = computed<Axis>(() => axes.value[axisIndex.value] ?? {});

  const document = computed(() => {
    try {
      return parseDocument(source.value);
    } catch {
      return null;
    }
  });

  const parseError = computed(() => {
    const doc = document.value;
    if (!doc) return 'This file could not be parsed.';
    return doc.errors[0]?.message ?? null;
  });

  const checklist = computed<ChecklistItem[]>(() => {
    const doc = document.value;
    if (!doc || doc.errors.length > 0) return [];
    try {
      return buildChecklist(doc);
    } catch {
      return [];
    }
  });

  const plain = computed<Record<string, unknown> | null>(() => {
    const doc = document.value;
    if (!doc || doc.errors.length > 0) return null;
    const value: unknown = doc.toJS();
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  });

  const workflowWhen = computed<WhenAST | undefined>(
    () => plain.value?.when as WhenAST | undefined,
  );

  const workflowProse = computed(() => describeWhen(workflowWhen.value, { level: 'workflow' }));

  function stepWhen(name: string): WhenAST | undefined {
    const steps = plain.value?.steps;

    if (Array.isArray(steps)) {
      const entry = steps.find(
        (item): item is { name?: string; when?: WhenAST } =>
          item !== null && typeof item === 'object' && (item as { name?: string }).name === name,
      );
      return entry?.when;
    }
    if (steps !== null && typeof steps === 'object' && steps !== undefined) {
      return (steps as Record<string, { when?: WhenAST } | null>)[name]?.when;
    }
    return undefined;
  }

  function stepProse(name: string): string {
    return describeWhen(stepWhen(name), { level: 'step', workflowWhen: workflowWhen.value });
  }

  /** Where a diagnostic points in the text, if it points anywhere. */
  function rangeFor(diagnostic: Diagnostic): TextRange | null {
    const doc = document.value;
    if (!doc || diagnostic.field === '') return null;
    return resolveRange(doc, diagnostic.field);
  }

  async function analyse(): Promise<void> {
    const linter = await load();
    analysing.value = true;
    try {
      const files = [{ name: filename.value, data: source.value }];

      const nextAxes = await linter.matrix(source.value);
      axes.value = nextAxes;
      if (axisIndex.value >= nextAxes.length) axisIndex.value = 0;
      const selected = nextAxes[axisIndex.value] ?? {};

      const [nextDiagnostics, nextMatch, nextStages] = await Promise.all([
        linter.lint(files),
        linter.match(source.value, simulation.metadata.value, selected),
        linter.stages(source.value, simulation.metadata.value, selected),
      ]);
      diagnostics.value = nextDiagnostics;
      match.value = nextMatch;
      stages.value = nextStages;
    } finally {
      analysing.value = false;
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(
    [source, simulation.metadata, axisIndex],
    () => {
      if (!started.value) return;
      clearTimeout(timer);
      timer = setTimeout(() => void analyse().catch(() => undefined), 250);
    },
    { deep: true },
  );

  function start(next: string): void {
    source.value = next;
    started.value = true;
    void analyse().catch(() => undefined);
  }

  const errorCount = computed(() => diagnostics.value.filter((d) => d.severity === 'error').length);
  const warningCount = computed(
    () => diagnostics.value.filter((d) => d.severity === 'warning').length,
  );

  return {
    source,
    filename,
    started,
    document,
    parseError,
    diagnostics,
    errorCount,
    warningCount,
    match,
    stages,
    axes,
    axisIndex,
    axis,
    checklist,
    workflowProse,
    stepProse,
    rangeFor,
    analyse,
    analysing,
    start,
    engine,
    engineLoading: loading,
    engineFailure: failure,
    simulation,
  };
});
