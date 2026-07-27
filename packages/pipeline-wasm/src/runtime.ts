/**
 * Instantiation and the call protocol. Shared by the worker-backed and the
 * synchronous entry points so there is one place that knows how the Go side
 * behaves.
 */
import type {
  Axis,
  Diagnostic,
  DiagnosticSource,
  JSONSchema7,
  Linter,
  LinterOptions,
  MatchResult,
  Metadata,
  ParseResult,
  StageResult,
  VersionInfo,
  WorkflowFile,
} from './types.js';

/** The method names the Go module installs on globalThis. */
export type Method = 'parse' | 'lint' | 'match' | 'matrix' | 'stages' | 'schema' | 'version';

interface GoApi extends Record<Method, (payload: string) => string> {
  dispose: () => void;
}

const GLOBAL_NAME = '__woodpeckerPipeline';

interface GoRuntime {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

type GoConstructor = new () => GoRuntime;

/**
 * Load the toolchain's `wasm_exec.js`, which sits beside the artifact.
 *
 * It is imported by URL rather than by a relative source path because it is a
 * build output: `scripts/build-wasm.sh` copies it from GOROOT and appends an ES
 * module re-export. It must match the compiler that produced the `.wasm`, which
 * is exactly why it is not vendored into source control.
 */
async function loadGo(wasmUrl: string): Promise<GoConstructor> {
  const existing = (globalThis as { Go?: GoConstructor }).Go;
  if (existing) return existing;

  const shimUrl = new URL('./wasm-exec.js', wasmUrl).href;
  const shim = (await import(/* @vite-ignore */ shimUrl)) as { Go?: GoConstructor };

  const Go = shim.Go ?? (globalThis as { Go?: GoConstructor }).Go;
  if (!Go) throw new Error(`wasm-exec.js at ${shimUrl} did not provide a Go runtime`);
  return Go;
}

/** Upstream defaults, used when the instance configuration is unknown. */
export const UPSTREAM_DEFAULTS = {
  trusted: { network: false, volumes: false, security: false },
  privilegedPlugins: [] as string[],
  trustedClonePlugins: ['docker.io/woodpeckerci/plugin-git:2.9.2'],
} as const;

/**
 * Assembled rather than written as a literal on purpose.
 *
 * Bundlers statically analyse `new URL('./literal', import.meta.url)` and emit
 * the target as an asset. For a 21 MB artifact that means every consumer ships
 * a hashed copy whether or not they point at their own, which is how the
 * generator ended up emitting it twice. Callers that want the bundler to manage
 * the asset should pass their own `wasmUrl`.
 */
const ARTIFACT = ['.', 'woodpecker.wasm'].join('/');

function defaultWasmUrl(): string {
  return new URL(ARTIFACT, import.meta.url).href;
}

async function loadWasm(url: string): Promise<BufferSource> {
  const isNode = typeof process !== 'undefined' && process.versions?.node !== undefined;

  if (isNode && (url.startsWith('file:') || url.startsWith('/'))) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const path = url.startsWith('file:') ? fileURLToPath(url) : url;
    const buffer = await readFile(path);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
  return response.arrayBuffer();
}

/**
 * Start the module and hand back its raw API.
 *
 * `go.run` never resolves: `main` blocks until `dispose` is called, which is
 * what keeps the exported functions alive. Awaiting it would hang.
 */
export async function instantiate(wasmUrl?: string): Promise<GoApi> {
  const url = wasmUrl ?? defaultWasmUrl();
  const Go = await loadGo(url);

  const go = new Go();
  const module = await WebAssembly.instantiate(await loadWasm(url), go.importObject);

  void go.run(module.instance);

  const api = (globalThis as Record<string, unknown>)[GLOBAL_NAME] as GoApi | undefined;
  if (!api) throw new Error(`${GLOBAL_NAME} was not installed; wrong or corrupt wasm artifact`);
  return api;
}

/** Every call returns JSON. An `error` key means the Go side refused. */
export function unwrap<T>(raw: string, method: Method): T {
  const parsed: unknown = JSON.parse(raw);
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const error = (parsed as { error?: unknown }).error;
    // `match` and `stages` report recoverable problems in their own `error`
    // field, so only a bare `{error}` payload is a hard failure.
    if (typeof error === 'string' && Object.keys(parsed).length === 1) {
      throw new Error(`${method}: ${error}`);
    }
  }
  return parsed as T;
}

export interface Callable {
  call(method: Method, payload: string): Promise<string>;
  release(): void;
}

/**
 * Build the public Linter over any transport. `schema` and `version` are
 * fetched once during construction so they can stay synchronous.
 */
export async function createLinterOver(
  transport: Callable,
  options: LinterOptions = {},
): Promise<Linter> {
  const lintOptions = {
    trusted: { ...UPSTREAM_DEFAULTS.trusted, ...options.trusted },
    privilegedPlugins: options.privilegedPlugins ?? [...UPSTREAM_DEFAULTS.privilegedPlugins],
    trustedClonePlugins: options.trustedClonePlugins ?? [...UPSTREAM_DEFAULTS.trustedClonePlugins],
  };

  const schema = unwrap<JSONSchema7>(await transport.call('schema', ''), 'schema');
  const version = unwrap<{ woodpecker: string }>(await transport.call('version', ''), 'version');

  const call = async <T>(method: Method, payload: unknown): Promise<T> =>
    unwrap<T>(
      await transport.call(method, typeof payload === 'string' ? payload : JSON.stringify(payload)),
      method,
    );

  return {
    parse: (src) => call<ParseResult>('parse', src),
    lint: (files: WorkflowFile[]) => call<Diagnostic[]>('lint', { files, ...lintOptions }),
    match: (src, metadata: Metadata, axis: Axis = {}) =>
      call<MatchResult>('match', { src, metadata, axis }),
    matrix: (src) => call<Axis[]>('matrix', src),
    stages: (src, metadata: Metadata, axis: Axis = {}) =>
      call<StageResult>('stages', { src, metadata, axis }),
    schema: () => schema,
    version: () => ({ woodpecker: version.woodpecker, pkg: PKG_VERSION }),
    dispose: () => transport.release(),
  };
}

/** Replaced at build time is overkill for one string; keep it in one place. */
const PKG_VERSION = '3.16.0-0';

export type { DiagnosticSource, VersionInfo };
