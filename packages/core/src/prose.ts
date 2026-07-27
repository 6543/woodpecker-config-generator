/**
 * The "runs when..." prose generator (spec 6.4).
 *
 * Deterministic TypeScript, not an LLM. It is a pure function of the `when`
 * AST, it must be testable, and it must never state something the matcher would
 * contradict. Every generated sentence is cross-checked against `wp.match()`
 * over a metadata grid in tests. Prose that can lie is worse than no prose.
 *
 * Semantics it has to honour, all from spec 2.5:
 *   - list form is OR, map form is AND
 *   - `path:` applies to push and pull-request events only
 *   - `branch:` is skipped entirely when the event is `tag`
 *   - `cron:` applies only to cron events
 *   - `matrix:` is a step-level filter only
 *   - `evaluate:` is rendered raw in backticks, never paraphrased
 *   - an empty `when` matches every event
 */
import { NotImplementedError } from './not-implemented.js';

export type WhenLevel = 'workflow' | 'step';

/** The raw `when` value, either a map (AND) or a list of maps (OR). */
export type WhenAST = Record<string, unknown> | Record<string, unknown>[];

export interface DescribeContext {
  level: WhenLevel;
  /**
   * The workflow-level `when`, when describing a step. Workflow and step gates
   * are evaluated independently upstream and must be composed by the caller
   * (spec 2.5). Presenting them separately without composing them misleads.
   */
  workflowWhen?: WhenAST | undefined;
}

export function describeWhen(_when: WhenAST | undefined, _ctx: DescribeContext): string {
  throw new NotImplementedError('describeWhen');
}
