/**
 * The "runs when..." prose generator (spec 6.4).
 *
 * Deterministic TypeScript, not an LLM. It is a pure function of the `when`
 * AST, it must be testable, and it must never state something the matcher would
 * contradict. Sentences are rendered from `analyzeWhen`, so every claim they
 * make is also available as data and can be checked against the real matcher.
 */
import {
  analyzeWhen,
  EVENTS,
  branchApplies,
  pathApplies,
  type WhenAST,
  type WhenAnalysis,
  type WhenClause,
} from './analyze.js';

export type { WhenAST } from './analyze.js';

export type WhenLevel = 'workflow' | 'step';

export interface DescribeContext {
  level: WhenLevel;
  /**
   * The workflow-level `when`, when describing a step. Workflow and step gates
   * are evaluated independently and must be composed by the caller. Presenting
   * them separately without saying so misleads.
   */
  workflowWhen?: WhenAST | undefined;
}

const EVENT_LABELS: Record<string, string> = {
  push: 'pushes',
  pull_request: 'pull requests',
  pull_request_closed: 'closed pull requests',
  pull_request_metadata: 'pull request metadata changes',
  tag: 'tags',
  release: 'releases',
  deployment: 'deployments',
  cron: 'cron runs',
  manual: 'manual runs',
};

const code = (value: string): string => `\`${value}\``;

function list(items: string[], conjunction: 'and' | 'or'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`;
}

/**
 * Clauses are joined with a comma before `or`, unlike short item lists. A
 * clause can be a whole phrase, and `pull requests or pushes on branch main`
 * reads as one condition without it.
 */
function joinClauses(clauses: string[]): string {
  if (clauses.length === 0) return '';
  if (clauses.length === 1) return clauses[0] ?? '';
  return `${clauses.slice(0, -1).join(', ')}, or ${clauses[clauses.length - 1]}`;
}

function eventPhrase(clause: WhenClause): string {
  if (clause.anyEvent) return 'any event';
  if (clause.events.length === 0) return 'no event';
  return list(
    clause.events.map((event) => EVENT_LABELS[event] ?? event),
    'or',
  );
}

/**
 * Qualifiers are stated, not silently dropped. A `branch:` next to a tag event
 * looks like it filters and does not, and that is precisely the confusion the
 * tool exists to remove.
 */
function describeClause(clause: WhenClause, level: WhenLevel): string {
  const parts: string[] = [eventPhrase(clause)];

  if (clause.branches.length > 0) {
    const branches = list(clause.branches.map(code), 'or');
    const events = clause.anyEvent ? [...EVENTS] : clause.events;
    const applies = events.filter(branchApplies).length;

    if (applies === 0) {
      parts.push(
        `on branch ${branches}, which has no effect because branch filters are skipped for tag events`,
      );
    } else if (applies < events.length) {
      parts.push(`on branch ${branches}, which is skipped for tag events`);
    } else {
      parts.push(`on branch ${branches}`);
    }
  }

  if (clause.tags.length > 0) {
    parts.push(`with tag ${list(clause.tags.map(code), 'or')}`);
  }

  if (clause.paths.length > 0) {
    const paths = list(clause.paths.map(code), 'or');
    const events = clause.anyEvent ? [...EVENTS] : clause.events;
    const applies = events.filter(pathApplies).length;

    if (applies === 0) {
      parts.push(
        `touching ${paths}, which has no effect because path filters apply only to push and pull request events`,
      );
    } else if (applies < events.length) {
      // Only worth saying when some admitted event ignores the filter. Adding
      // it to a push-only clause is noise that trains people to skim.
      parts.push(`touching ${paths}, on push and pull request events only`);
    } else {
      parts.push(`touching ${paths}`);
    }
  }

  if (clause.crons.length > 0) {
    parts.push(`from cron schedule ${list(clause.crons.map(code), 'or')}`);
  }

  if (clause.status.length > 0) {
    parts.push(`when previous steps ended in ${list(clause.status.map(code), 'or')}`);
  }

  if (Object.keys(clause.matrix).length > 0) {
    const pairs = Object.entries(clause.matrix).map(([key, value]) => code(`${key}=${value}`));
    parts.push(
      level === 'workflow'
        ? `for matrix ${list(pairs, 'and')}, which has no effect because matrix filters are step-level only`
        : `for matrix ${list(pairs, 'and')}`,
    );
  }

  if (clause.evaluate !== null) {
    // Rendered raw. Paraphrasing an expression is where prose starts lying.
    parts.push(`where ${code(clause.evaluate)} evaluates true`);
  }

  if (clause.unknown.length > 0) {
    parts.push(`with ${list(clause.unknown.map(code), 'and')} also applied`);
  }

  return parts.join(' ');
}

function describeAnalysis(analysis: WhenAnalysis, level: WhenLevel): string {
  if (analysis.unconstrained) return 'Runs for every event.';
  const clauses = analysis.clauses.map((clause) => describeClause(clause, level));
  return `Runs on ${joinClauses(clauses)}.`;
}

/**
 * A plain-language sentence for a workflow or a step.
 *
 * At step level the workflow gate is appended rather than merged: the two are
 * evaluated independently upstream, and a step whose own filter matches still
 * does not run when the workflow filter excludes the event.
 */
export function describeWhen(when: WhenAST | undefined, ctx: DescribeContext): string {
  const sentence = describeAnalysis(analyzeWhen(when), ctx.level);

  if (ctx.level !== 'step' || ctx.workflowWhen === undefined) return sentence;

  const workflow = analyzeWhen(ctx.workflowWhen);
  if (workflow.unconstrained) return sentence;

  return `${sentence} The workflow filter also applies: ${describeAnalysis(workflow, 'workflow').replace(/^Runs on /, 'it runs on ')}`;
}
