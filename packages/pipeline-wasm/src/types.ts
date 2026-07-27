/**
 * Public types for `@woodpecker-ci/pipeline-wasm`.
 *
 * These mirror the Go types in the Woodpecker pipeline frontend. Anything that
 * crosses the WASM boundary is JSON, one call one payload (spec 4.3).
 */

/** Severity of a diagnostic. Maps to `PipelineError.IsWarning` upstream. */
export type Severity = 'error' | 'warning';

/**
 * Which pass produced a diagnostic.
 *
 * These are upstream's own `PipelineErrorType` values, passed through verbatim
 * rather than reclassified, so the wrapper cannot invent a category the server
 * would not report. `generic` covers parse failures, which carry no field path.
 */
export type DiagnosticSource = 'linter' | 'deprecation' | 'compiler' | 'generic' | 'bad_habit';

export interface Diagnostic {
  message: string;
  /**
   * YAML path, e.g. `steps.build`. NOT a line or column: upstream carries no
   * position information. Resolving this to a text range is the host's job,
   * see `resolveRange` in `@woodpecker-ci/config-core` (spec 4.4).
   */
  field: string;
  file: string;
  severity: Severity;
  source: DiagnosticSource;
}

/** One workflow file. `name` is the filename for multi-workflow configs. */
export interface WorkflowFile {
  name: string;
  data: string;
}

export interface ParseResult {
  ok: boolean;
  /** Populated when `ok` is false. Parse errors carry no field path. */
  error?: string;
}

export interface MatchResult {
  /** Workflow-level `when`. */
  workflow: boolean;
  /** Step-level `when`, per step name. */
  steps: Record<string, boolean>;
  /**
   * `workflow && step`. Use this for UI. It exists so consumers cannot show a
   * step as running while the workflow gate excludes it (spec 2.5).
   */
  effective: Record<string, boolean>;
  /** e.g. a bad `evaluate:` expression. */
  error?: string;
}

export type ExecutionMode = 'sequential' | 'dag';

export interface StageResult {
  mode: ExecutionMode;
  /** Parallel groups, in execution order. */
  stages: string[][];
  /** Steps Woodpecker adds implicitly, e.g. `clone`. */
  injected: string[];
  /** e.g. `cycle detected: [a b]`. */
  error?: string;
}

/** One matrix axis combination, already expanded. */
export type Axis = Record<string, string>;

/**
 * Instance-specific configuration (spec 2.11). A standalone app cannot know
 * these, so they default to upstream defaults and any diagnostic derived from
 * them must be labelled instance-dependent rather than absolute.
 */
export interface TrustedConfiguration {
  network: boolean;
  volumes: boolean;
  security: boolean;
}

export interface LinterOptions {
  /** Defaults to the bundled asset URL. */
  wasmUrl?: string;
  trusted?: Partial<TrustedConfiguration>;
  privilegedPlugins?: string[];
  trustedClonePlugins?: string[];
}

/**
 * Pipeline metadata, the simulator input. Round-trips with the
 * `*-metadata.json` downloaded from the Pipeline -> Debug page (spec 2.7), so
 * the shape must stay assignable from that file.
 */
export interface Metadata {
  repo?: Record<string, unknown>;
  curr?: Record<string, unknown>;
  prev?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
  step?: Record<string, unknown>;
  sys?: Record<string, unknown>;
  forge?: Record<string, unknown>;
  [key: string]: unknown;
}

/** JSON Schema draft-07, as embedded in the Woodpecker linter. */
export type JSONSchema7 = Record<string, unknown>;

export interface VersionInfo {
  /** Upstream Woodpecker version the WASM was built from. */
  woodpecker: string;
  /** This package's version, `<upstream>-<pkg-patch>`. */
  pkg: string;
}

export interface Linter {
  parse(src: string): Promise<ParseResult>;
  lint(files: WorkflowFile[]): Promise<Diagnostic[]>;
  match(src: string, metadata: Metadata): Promise<MatchResult>;
  matrix(src: string): Promise<Axis[]>;
  stages(src: string): Promise<StageResult>;
  /** The embedded `schema.json`. Synchronous once the linter exists. */
  schema(): JSONSchema7;
  version(): VersionInfo;
  dispose(): void;
}
