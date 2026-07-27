/**
 * Structured analysis of a `when` block.
 *
 * The prose generator renders from this rather than walking the AST directly,
 * so the claims a sentence makes are available as data and can be checked
 * against the real matcher in tests. A sentence that can lie is worse than no
 * sentence.
 *
 * Everything here follows the semantics in `constraint.Constraint.Match`:
 *   - a list `when` is OR across entries, a map `when` is AND across keys
 *   - an empty `when` matches every event
 *   - `path:` is evaluated only for push and pull-request events
 *   - `branch:` is skipped entirely when the event is a tag
 *   - `cron:` applies only to cron events
 *   - `matrix:` is a step-level filter only
 *   - `evaluate:` is an expression over the environment
 */

/** Every webhook event Woodpecker can report. */
export const EVENTS = [
  'push',
  'pull_request',
  'pull_request_closed',
  'pull_request_metadata',
  'tag',
  'release',
  'deployment',
  'cron',
  'manual',
] as const;

export type Event = (typeof EVENTS)[number];

/** Events for which `path:` is evaluated at all. */
const PATH_EVENTS = new Set<string>([
  'push',
  'pull_request',
  'pull_request_closed',
  'pull_request_metadata',
]);

/** The raw `when` value: a map (AND) or a list of maps (OR). */
export type WhenAST = Record<string, unknown> | Record<string, unknown>[];

/** One AND-ed entry of a `when` block. */
export interface WhenClause {
  /** Events this clause admits. Absent `event:` means all of them. */
  events: Event[];
  /** True when the clause named no `event:` and therefore admits everything. */
  anyEvent: boolean;
  branches: string[];
  tags: string[];
  paths: string[];
  crons: string[];
  /** Raw expression, never paraphrased. */
  evaluate: string | null;
  status: string[];
  matrix: Record<string, string>;
  /** Keys present that this analysis has no opinion about. */
  unknown: string[];
}

export interface WhenAnalysis {
  clauses: WhenClause[];
  /** Union across clauses. Empty `when` yields every event. */
  events: Event[];
  /** True when nothing constrains the block at all. */
  unconstrained: boolean;
}

const KNOWN_KEYS = new Set([
  'event',
  'branch',
  'tag',
  'path',
  'cron',
  'evaluate',
  'status',
  'matrix',
  'repo',
  'ref',
  'instance',
  'platform',
  'environment',
]);

/** `path:` accepts a bare list or a map with `include`, `exclude`, `ignore_message`. */
function toStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(toStringList);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [...toStringList(record.include), ...toStringList(record.exclude)];
  }
  return [];
}

function toEvents(value: unknown): Event[] {
  return toStringList(value).filter((entry): entry is Event =>
    (EVENTS as readonly string[]).includes(entry),
  );
}

function toMatrix(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry)]),
  );
}

function analyzeClause(raw: Record<string, unknown>): WhenClause {
  const events = toEvents(raw.event);
  const declaredEvents = raw.event !== undefined && raw.event !== null;

  return {
    events: declaredEvents ? events : [...EVENTS],
    anyEvent: !declaredEvents,
    branches: toStringList(raw.branch),
    tags: toStringList(raw.tag),
    paths: toStringList(raw.path),
    crons: toStringList(raw.cron),
    evaluate: typeof raw.evaluate === 'string' ? raw.evaluate : null,
    status: toStringList(raw.status),
    matrix: toMatrix(raw.matrix),
    unknown: Object.keys(raw).filter((key) => !KNOWN_KEYS.has(key)),
  };
}

function isEmptyClause(clause: WhenClause): boolean {
  return (
    clause.anyEvent &&
    clause.branches.length === 0 &&
    clause.tags.length === 0 &&
    clause.paths.length === 0 &&
    clause.crons.length === 0 &&
    clause.evaluate === null &&
    clause.status.length === 0 &&
    Object.keys(clause.matrix).length === 0 &&
    clause.unknown.length === 0
  );
}

/**
 * Narrow a clause's admissible events by the keys that gate on the event type.
 *
 * `cron:` only applies to cron events, so a clause naming a cron cannot match
 * anything else. This is the one place where a key other than `event:`
 * determines which events are possible.
 */
function admissibleEvents(clause: WhenClause): Event[] {
  if (clause.crons.length > 0) {
    return clause.events.includes('cron') ? ['cron'] : [];
  }
  return clause.events;
}

export function analyzeWhen(when: WhenAST | undefined): WhenAnalysis {
  if (when === undefined || when === null) {
    return { clauses: [], events: [...EVENTS], unconstrained: true };
  }

  const raw = Array.isArray(when) ? when : [when];
  const clauses = raw
    .filter(
      (entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object',
    )
    .map(analyzeClause);

  if (clauses.length === 0) {
    return { clauses: [], events: [...EVENTS], unconstrained: true };
  }

  const events = new Set<Event>();
  for (const clause of clauses) {
    for (const event of admissibleEvents(clause)) events.add(event);
  }

  return {
    clauses,
    events: EVENTS.filter((event) => events.has(event)),
    unconstrained: clauses.every(isEmptyClause),
  };
}

/** True when `path:` in this clause has any effect on the given event. */
export function pathApplies(event: string): boolean {
  return PATH_EVENTS.has(event);
}

/** True when `branch:` in this clause has any effect on the given event. */
export function branchApplies(event: string): boolean {
  return event !== 'tag';
}
