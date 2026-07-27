# Woodpecker CI — Interactive Configuration Generator

**Status:** Draft spec / pre-RFC
**Date:** 2026-07-26
**Scope:** Three deliverables — a reusable WASM linter package, a machine-readable plugin settings format, and a standalone webapp.

---

## 1. Goals

Reduce time-to-first-green-pipeline for new Woodpecker users.

The concrete onboarding failures this targets, all observed in real configs (see §2.6):

1. **Blank page.** User does not know what a minimal `.woodpecker.yaml` looks like.
2. **`when:` is opaque.** Users cannot predict which steps run for a given event. Two syntaxes (map = AND, list = OR) compound this.
3. **Execution order is invisible.** Sequential vs DAG mode is implicit and flips on a subtle trigger (§2.4).
4. **Out-of-band setup is undocumented at the point of use.** `from_secret: codeberg_token` tells the user nothing about which token, which scopes, or where to put it. Today this lives in YAML comments, if at all.
5. **Plugin settings are prose.** No machine-readable types, so no form UI and no validation.

### Non-goals (MVP)

- Writing to a user's repository. A commit/fork/push bot is explicitly deferred (§8.2).
- Any server-side state, account, or session. The app is static.
- Replacing the YAML editor. The generator must remain a *bidirectional* aid, not a walled garden.

---

## 2. Research findings

Everything in this section was verified against `woodpecker-ci/woodpecker` at `main` (Go 1.26.0) by compiling and executing the real packages, not by reading alone. Evidence is reproducible from §2.1.

### 2.1 The Go pipeline frontend compiles to WASM and runs in a browser runtime

Built with the standard Go toolchain (`GOOS=js GOARCH=wasm`), executed under Node with `wasm_exec.js`. The following packages are all WASM-safe — no filesystem, network, or syscall dependencies in the relevant paths:

| Package | Purpose | Status |
|---|---|---|
| `pipeline/frontend/yaml` | parse | works |
| `pipeline/frontend/yaml/linter` | lint (incl. embedded JSON schema) | works |
| `pipeline/frontend/yaml/constraint` | `when` matching | works |
| `pipeline/frontend/yaml/matrix` | matrix expansion | works |
| `pipeline/frontend/yaml/compiler` | stage/DAG resolution | works |
| `pipeline/frontend/metadata` | metadata types | works |

Observed runtime output from the probe:

```
== LINT (bad config) ==
[{"message":"Invalid or missing image","field":"steps.bad","warning":false},
 {"message":"Cannot configure both `commands` and `settings`","field":"steps.bad","warning":false},
 {"message":"image is required","field":"steps.bad","warning":true},
 {"message":"Additional property settings is not allowed","field":"steps.bad","warning":true},
 {"message":"Consider adding a `when` block with an `event` filter ...","field":"","warning":true}]

== MATCH event=push  branch=main   == {"_workflow":true, "build":true,"deploy":true, "notify":false}
== MATCH event=push  branch=feat/x == {"_workflow":false,"build":true,"deploy":false,"notify":false}
== MATCH event=pull_request        == {"_workflow":true, "build":true,"deploy":false,"notify":false}
== MATCH event=tag   branch=main   == {"_workflow":false,"build":true,"deploy":false,"notify":true}

== MATRIX == [{"GO":"1.24","OS":"linux"},{"GO":"1.24","OS":"darwin"},
              {"GO":"1.25","OS":"linux"},{"GO":"1.25","OS":"darwin"}]

SEQUENTIAL   -> [["clone"],["a"],["b"],["c"]]
DAG (dep []) -> [["clone"],["a","b"],["c"]]
CYCLE        -> {"error":"cycle detected: [a b]"}
```

**Consequence:** the prose generator, the run simulator, and the DAG view are three renderers over *one* engine, and that engine is the production engine. Reimplementing `when` semantics in TypeScript is unnecessary and would guarantee drift.

### 2.2 Bundle size

Measured, brotli quality 11 (the realistic CDN transfer size):

| Contents | Raw | Brotli |
|---|---|---|
| parse + lint + match + matrix | 11.2 MB | **2.03 MB** |
| the above + compiler (stages/DAG) | 20.0 MB | **3.27 MB** |

`-ldflags="-s -w"` saves under 3%; Go WASM does not strip meaningfully.

TinyGo is **not** an option: the YAML and JSON-schema paths depend on heavy reflection.

**Decision:** ship one module including the compiler (3.27 MB br), lazy-loaded on demand. Splitting into two modules is a false economy — each Go WASM module carries its own ~2 MB runtime baseline, so two modules cost more than one. Loading is deferred until the user's first edit, so it never blocks first paint. Revisit if the compiler proves unnecessary.

### 2.3 Diagnostics carry a YAML path, not a line number

`linter` emits `pipeline_errors.PipelineError`:

```go
type PipelineError struct {
    Type      PipelineErrorType   // "linter"
    Message   string
    Data      any                 // *LinterErrorData{File, Field}
    IsWarning bool
}
```

`Field` is a YAML path such as `steps.bad`. There is no line or column.

**Consequence:** the host application is responsible for mapping path → text range. The JS-side YAML AST already holds this; see §4.4. This is a hard requirement for inline editor diagnostics, and it is the single most fiddly part of the integration.

### 2.4 Sequential vs DAG — exact rule

From `pipeline/frontend/yaml/compiler/dag.go`:

```go
func (c dagCompiler) isDAG() bool {
    for _, v := range c.steps {
        if !v.dependsOn.IsZero() { return true }
    }
    return false
}
```

and from `constraint/depends_on.go`:

```go
func (d DependsOn) IsZero() bool { return d == nil }
```

Therefore:

- `depends_on` **absent** → nil → not DAG.
- `depends_on: []` → non-nil empty slice → **DAG mode for the entire workflow**, and that step has zero dependencies so it starts immediately.

Confirmed by an upstream test comment: *"no dependencies => enable dag mode & all steps are executed in parallel"*.

This is a global mode flip triggered by a single step, and `[]` vs absent is invisible to most readers. It is the highest-value thing the UI can teach.

`depends_on` accepts four shapes: `"a"`, `["a","b"]`, `[{name: a, optional: true}]`, and mixed. Optional dependencies are silently dropped when the target is absent; non-optional missing targets are a hard error (`ErrStepMissingDependency`). Cycles are detected by DFS and reported as `cycle detected: [a b]`.

### 2.5 `when` semantics — exact rule

From `constraint.Constraint.Match`:

- A `when:` **list** is OR across entries; a `when:` **map** is AND across keys.
- An **empty** `when` is evaluated against a default (empty) constraint, not skipped.
- `matrix:` is a **step-level filter only** — gated behind the `global bool` parameter.
- `path:` is evaluated **only** for `push` and pull-request events; ignored otherwise.
- `branch:` is skipped entirely when the event is `tag`.
- `cron:` is only applied when the event is `cron`.
- `evaluate:` is a `expr-lang/expr` expression over the environment.
- `status:` — `failure` must be listed explicitly; `success` is presumed present unless the list exists and omits it.

Workflow-level and step-level `when` are evaluated **independently** and must be composed by the caller. In the probe above, `event=tag` produced `{"_workflow": false, "notify": true}` — the step matches but the workflow gate does not, so nothing runs. Presenting these separately without composing them would actively mislead.

### 2.6 Corpus survey (`codeberg.org/codeberg-ci/examples`, 26 configs)

| Feature | Files | Implication |
|---|---|---|
| `settings:` (plugins) | 13 / 26 | Plugin support is core, not an extra |
| `when:` blocks | 35 | Primary complexity surface |
| `environment:` + `from_secret:` | many | Secrets are first-class |
| `matrix:` | 4 | Needed, with `${VAR}` interpolation |
| `depends_on:` | 5 | Needed |
| YAML anchors + `variables:` | 1 | Form-hostile; needs an escape hatch (§6.6) |
| `clone:` override | 1 | Edge case |

Two file layouts are both in active use: a single `.woodpecker.yaml`, or a `.woodpecker/` directory of workflow files that chain via top-level `depends_on` referencing *filenames*. The generator needs a "workflow" concept above "step" and multi-file export.

Both the map form (`steps: {build: {...}}`) and list form (`steps: [{name: build, ...}]`) appear, at both workflow and step level, for both `steps:` and `when:`.

The dominant use case by far is **build a static site, push to a Pages branch** (Hugo, Jekyll, 11ty, mdBook, Zola, pdoc). All share one shape: a build step, a git-push step, and a forge token secret. The real setup pain in these files lives in header comments explaining which token and which scopes.

### 2.7 Woodpecker already has a debug/metadata flow

`web/src/views/repo/pipeline/PipelineDebug.vue` (route `repo-pipeline-debug`, gated on `push` permission) downloads a `*-metadata.json` and tells the user to run:

```
woodpecker-cli exec --metadata-file <file>
```

`metadata.Metadata` has full JSON tags and round-trips cleanly.

**Consequence:** the simulator is the browser-native form of an existing, sanctioned workflow, and this page is the natural home for the eventual in-app integration. This is not a new concept being introduced — it is an existing concept getting a UI.

### 2.8 Frontend stack (for later in-app integration)

Vue 3.5, Vite 8, Tailwind 4, Pinia, `vue-i18n`, Vitest, TypeScript 6. No YAML editor component exists today (`prismjs` is present for read-only highlighting).

### 2.9 YAML dialect caveat

Woodpecker parses with `codeberg.org/6543/xyaml/v2`, which supports **sequence merge keys** — an extension the `yaml` npm package does not implement.

**Consequence:** the JS AST is for editing and range mapping only. It must never be the source of truth for semantics. All validation goes through WASM. Where the two disagree, WASM wins.

### 2.10 Plugin index today

`docs/plugins/woodpecker-plugins/plugins.json` — 68 plugins, 22 verified:

```json
{ "name": "Docker Buildx",
  "docs": "https://codeberg.org/woodpecker-plugins/docker-buildx/raw/branch/main/docs.md",
  "verified": true }
```

Each `docs.md` has YAML frontmatter (`name`, `icon`, `description`, `author`, `tags`, `containerImage`, `containerImageUrl`, `url`) plus a markdown body. `creating-plugins.md` specifies the frontmatter but **specifies nothing for settings**.

A de-facto convention exists and is near-universal: a `## Settings` heading followed by a table with columns `Settings Name | Default | Description`. It is unenforced and lacks type, requiredness, and secret-ness — exactly the three things a form generator needs.

The docs site strips single-line HTML comments before rendering (`markdown.ts`: `.replace(/<!--(.*?)-->/gm, '')`, no `s` flag). **A single-line HTML comment is therefore invisible to human readers but present in the raw `.md`.** This is the basis for §5.

### 2.11 Instance-specific configuration the standalone app cannot know

`linter.New()` accepts `WithTrusted(TrustedConfiguration{Network, Volumes, Security})`, `PrivilegedPlugins([]string)`, and `WithTrustedClonePlugins([]string)`. These come from server env vars (`WOODPECKER_PLUGINS_PRIVILEGED`, `WOODPECKER_PLUGINS_TRUSTED_CLONE`, `WOODPECKER_DEFAULT_CLONE_PLUGIN`). Default clone plugin is currently `docker.io/woodpeckerci/plugin-git:2.9.2`.

**Consequence:** results are instance-dependent. The app must default to upstream defaults, expose them under Advanced, and label trust-related diagnostics as instance-dependent rather than absolute.

### 2.12 Limits

`matrix`: max 10 tags, max 25 axes (`limitTags`, `limitAxis`). The UI should enforce and explain these rather than letting a config fail server-side.

---

## 3. Architecture

```
                       ┌──────────────────────────────┐
   form edits ───────► │      YAML Document AST       │ ◄─────── text edits
                       │   (yaml npm, comment- and    │
                       │    order-preserving)         │
                       └──────────────┬───────────────┘
                                      │ serialize
                                      ▼
                       ┌──────────────────────────────┐
                       │  @woodpecker-ci/pipeline-wasm │
                       │  lint · match · matrix ·      │
                       │  stages · schema              │
                       └──────────────┬───────────────┘
                                      │
              ┌───────────────┬───────┴────────┬────────────────┐
              ▼               ▼                ▼                ▼
        diagnostics      run preview      stage graph      prose ("runs when…")
      (path → range)     (grey-out)      (DAG/sequential)   (deterministic, TS)
```

Three rules:

1. **The AST is the model.** Not a plain JS object. Round-tripping through a plain object destroys comments and key order, which makes the tool useless for editing an existing config — and §8.1 makes editing existing configs an MVP feature.
2. **One engine, many renderers.** Diagnostics, simulation, and the graph all derive from the same WASM calls. Never a second matcher.
3. **Framework-neutral core.** All logic sits in a package with zero Vue imports, so the eventual in-app integration is a thin shell.

### 3.1 Repository layout

```
packages/pipeline-wasm/   # published npm package, §4
packages/plugin-schema/   # settings-table parser, §5
packages/core/            # AST ops, prose gen, form model, state codec. Zero framework
apps/generator/           # Vue 3 standalone app, §6
```

`core` depends on `pipeline-wasm` and `plugin-schema`. `apps/generator` is a shell. When the time comes to embed in Woodpecker's own UI, `core` moves in unchanged.

---

## 4. Deliverable 1 — `@woodpecker-ci/pipeline-wasm`

A framework-agnostic npm package wrapping the Woodpecker pipeline frontend. Usable by any JS project: the generator, the Woodpecker UI, editor extensions, pre-commit tooling, CI dashboards.

### 4.1 Design constraints

- **No framework dependency.** No Vue, no React, no bundler assumptions.
- **Lazy by default.** The WASM is fetched on first call, never at import.
- **Runs off the main thread.** A Web Worker wrapper ships as the default entry point; a synchronous entry is available for Node.
- **Deterministic.** Same input, same output. No network, no clock, no ambient state.
- **Versioned against Woodpecker.** The package version encodes the upstream version it was built from.

### 4.2 Public API

```ts
import { createLinter } from '@woodpecker-ci/pipeline-wasm';

const wp = await createLinter({
  // optional; defaults to the bundled asset URL
  wasmUrl: '/assets/woodpecker-CE7A1F.wasm',
  // §2.11 — instance-specific, defaults to upstream defaults
  trusted: { network: false, volumes: false, security: false },
  privilegedPlugins: ['docker.io/woodpeckerci/plugin-docker-buildx'],
  trustedClonePlugins: ['docker.io/woodpeckerci/plugin-git:2.9.2'],
});

await wp.parse(src): ParseResult
await wp.lint(files: WorkflowFile[]): Diagnostic[]
await wp.match(src, metadata: Metadata): MatchResult
await wp.matrix(src): Axis[]
await wp.stages(src): StageResult
wp.schema(): JSONSchema7          // the embedded schema.json, sync after init
wp.version(): { woodpecker: string; pkg: string }
wp.dispose(): void
```

Types:

```ts
interface Diagnostic {
  message: string;
  field: string;        // YAML path, e.g. "steps.build" — NOT a line. See §4.4
  file: string;
  severity: 'error' | 'warning';
  source: 'schema' | 'linter' | 'deprecation' | 'bad-habit' | 'trusted';
}

interface MatchResult {
  workflow: boolean;                  // workflow-level `when`
  steps: Record<string, boolean>;     // step-level `when`
  effective: Record<string, boolean>; // workflow && step — use this for UI
  error?: string;                     // e.g. a bad `evaluate:` expression
}

interface StageResult {
  mode: 'sequential' | 'dag';
  stages: string[][];                 // parallel groups, in execution order
  injected: string[];                 // implicitly added steps, e.g. "clone"
  error?: string;                     // e.g. "cycle detected: [a b]"
}
```

`effective` exists specifically so consumers cannot make the §2.5 mistake of showing a step as running when the workflow gate excludes it. `injected` exists so the UI can visually distinguish steps Woodpecker adds for you (the implicit clone) from steps the user wrote.

`source` is a package-level addition: upstream returns a flat error list, and the classification is derived from which lint pass produced it. It drives diagnostic grouping in the UI and is best-effort.

### 4.3 Go side

A new `cmd/pipeline-wasm` (or a separate repo tracking upstream) exporting the above via `syscall/js`.

Rules:

- Marshal across the boundary as **JSON strings**, one call, one payload. Chatty `js.Value` traversal is the main performance trap in Go WASM.
- Never `panic` across the boundary. `lintFile` dereferences `config.Workflow` without a nil check, so **parse must succeed before lint is called** — the probe hit exactly this nil-pointer panic. The wrapper parses first and returns a parse diagnostic on failure.
- Keep `main` alive with `select {}`; expose an explicit `dispose`.
- Build reproducibly, content-hash the artifact, serve immutable with `Cache-Control: immutable` and `Content-Encoding: br`.

### 4.4 Path → range mapping (host responsibility)

WASM returns `field: "steps.build"`. To place a squiggle, the host resolves that path against its own YAML AST:

```ts
// packages/core
resolveRange(doc: Document, field: string): { start: number; end: number } | null
```

Rules, in order:

1. Split on `.`, walk the AST, prefer the **key** node's range over the value's.
2. `steps.<name>` resolves in both map form and list form (match on the `name` field).
3. On failure, fall back to the nearest resolvable ancestor.
4. On total failure, surface the diagnostic in the panel without an editor anchor. Never drop it silently.

This is the most error-prone piece in the whole design and must be covered by tests over the full example corpus (§9).

### 4.5 Distribution

```
@woodpecker-ci/pipeline-wasm
├── dist/index.js          # worker-backed, default
├── dist/sync.js           # direct, for Node
├── dist/woodpecker.wasm   # content-hashed
└── dist/index.d.ts
```

Apache-2.0, matching upstream. Version scheme `<upstream-version>-<pkg-patch>`, e.g. `3.16.0-1`, so consumers can pin to a Woodpecker release.

---

## 5. Deliverable 2 — machine-readable plugin settings (`woodpecker-plugin-settings v1`)

### 5.1 Rationale

The settings table already exists in nearly every `docs.md` and already *is* the human documentation. Adding a second machine-readable block (JSON, a separate schema file) creates two sources of truth that will drift within one release.

So: make the existing table the machine source. One artifact, both audiences.

### 5.2 Format

A single-line HTML comment sentinel immediately preceding a table with a fixed column set:

```markdown
<!-- woodpecker-plugin-settings v1 -->

| Name           | Type           | Required | Default     | Description                  |
| -------------- | -------------- | -------- | ----------- | ---------------------------- |
| `dry_run`      | `bool`         | no       | `false`     | disables docker push         |
| `repo`         | `list<string>` | yes      | _none_      | image repo name(s)           |
| `password`     | `secret`       | no       | _none_      | registry password / token    |
| `registry`     | `string`       | no       | `docker.io` | registry to authenticate with|
| `tag`/`tags`   | `string`       | no       | _none_      | image tags                   |
| `logins`       | `object`       | no       | _none_      | see example; nested map      |
```

The sentinel is stripped before human rendering (§2.10), so it is invisible on the docs site while remaining present in the raw file.

**Why a sentinel rather than "find the `## Settings` heading":** headings get renamed (`Settings`, `Configuration`, `Options`), translated, or duplicated, and plugins can have several tables. The sentinel is an unambiguous anchor *and* carries the schema version, so the format can evolve without breaking parsers.

### 5.3 Cell rules

Deterministic so a ~40-line parser suffices:

| Column | Rule |
|---|---|
| `Name` | Backticked. Aliases split on `/`: `` `tag`/`tags` `` → `["tag","tags"]`, first is canonical |
| `Type` | Closed vocabulary (below) |
| `Required` | `yes` \| `no` |
| `Default` | Backticked literal, or `${CI_*}`, or `_none_` |
| `Description` | Last column. Free markdown |

Type vocabulary:

```
string | bool | int | duration | secret | object
list<string> | list<int>
enum(a,b,c)
```

- `secret` — renders a secret picker and emits `from_secret:` wiring. This is the type that makes the setup checklist (§6.5) possible.
- `object` — the deliberate escape hatch for structures a table cannot express (e.g. buildx `logins:`, a list of maps). The parser marks it opaque; the form renders a raw-YAML field. This keeps the promise "a markdown table parser is enough" honest for the ~90% without pretending a table is JSON Schema.

Commas need no escaping — table cells split on `|`, not `,`.

**Open question (blocking v1 freeze):** enum values inline as `enum(a,b,c)` in the Type cell, versus a separate `Allowed` column. Inline keeps five columns and stays scannable; a separate column parses more cleanly but widens an already-wide table. Recommend inline; flag for upstream discussion.

### 5.4 Parser package — `@woodpecker-ci/plugin-schema`

```ts
parsePluginDoc(markdown: string): PluginDoc

interface PluginDoc {
  meta: PluginFrontmatter;        // existing frontmatter, unchanged
  settings: PluginSetting[];
  schemaVersion: 1 | null;        // null = legacy, best-effort
  warnings: string[];             // e.g. "type `strng` not in vocabulary"
}

interface PluginSetting {
  name: string;
  aliases: string[];
  type: SettingType;              // 'unknown' for legacy docs
  required: boolean;
  default: string | null;
  description: string;            // markdown
  opaque: boolean;                // type === 'object'
}
```

**Primary input is the raw `.md`.** The index already provides raw URLs, the sentinel survives, and there is no HTML to fight. A rendered-HTML fallback (locate the `<table>` after the settings heading) is possible but brittle against Docusaurus and DOMPurify wrapping; use only when raw is unreachable.

### 5.5 Backward compatibility

Version-gated, so nothing breaks on day one:

- **No sentinel** → legacy path. Best-effort parse of the old `Name | Default | Description` table, `type: 'unknown'`, `schemaVersion: null`. The form renders free-text fields with the description as help text. This is still better than nothing, and it is what all 68 plugins get for free.
- **Sentinel `v1`** → strict typed parse, full form generation.

Authors opt in per plugin. The 22 verified plugins migrating first gives the generator a solid typed catalog at launch while the long tail degrades gracefully.

### 5.6 Upstream change

Additive to `docs/docs/20-usage/51-plugins/20-creating-plugins.md`, as a new subsection under **Metadata**:

- Define the sentinel and the v1 column set.
- Define the type vocabulary.
- Note that the sentinel is invisible in rendered docs.
- Update the Best practices bullet ("Add a `docs.md` file, listing all your settings") to point at the format.

Optionally, a lint in the plugin-index CI that validates v1 tables: column set present, types in vocabulary, `Required` ∈ {yes, no}. Warn-only at first.

Non-breaking: the sentinel is stripped in render, the table still displays exactly as today.

---

## 6. Deliverable 3 — the webapp

Vue 3 + Vite + Tailwind, matching the upstream stack (§2.8) so the eventual merge is mechanical. Static build, no backend, deployable as a subpath artifact on `woodpecker-ci.org`.

### 6.1 Layout

Persistent split view. Form on the left, YAML on the right, **both always visible**. The YAML pane is a real editor (CodeMirror 6), not a read-only preview — edits flow back into the AST.

Showing the generated YAML at all times is a deliberate teaching choice: the tool should make itself unnecessary.

```
┌──────────────────────────────────────────────────────────────┐
│ [version ▾]  [event: push ▾] [branch: main] [import metadata]│  simulate bar
├──────────────────────────┬───────────────────────────────────┤
│  Workflow                │  .woodpecker.yaml                 │
│  ├ when: push, PR        │  when:                            │
│  │  "Runs on push to any │    - event: pull_request          │
│  │   branch, and on PRs" │    - event: push                  │
│  ├ Steps      [DAG ⓘ]    │      branch: main                 │
│  │  ▸ build   ● runs     │  steps:                           │
│  │  ▸ deploy  ○ skipped  │    build:                         │
│  │  ▸ notify  ○ skipped  │      image: golang                │
│  └ + Add step            │      ...                          │
├──────────────────────────┴───────────────────────────────────┤
│ ⚠ 2 warnings   ✕ 0 errors                    [Export ▾]      │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Entry — template picker

Kills the blank page. Templates are derived from the corpus (§2.6), with **Static site → Pages** as the headline given its dominance.

Each template ships with the setup checklist (§6.5) pre-populated, which is the part that currently lives in header comments and gets lost on copy-paste.

### 6.3 Execution model view (DAG vs sequential)

A persistent badge showing the current mode, with the trigger made explicit.

- **Sequential** — "Steps run one after another, top to bottom."
- **DAG** — "Steps run in parallel where dependencies allow. Order is determined **only** by `depends_on`."

On the seq → DAG transition, an inline explanation fires once: *"Adding `depends_on` to any step switches the whole workflow to DAG mode. Steps without `depends_on` will no longer wait for the steps above them."*

The **mixed case** — some steps with `depends_on`, some without — is the classic footgun and gets a dedicated warning naming the affected steps.

`depends_on: []` gets a distinct hint, since `[]` and absent look identical to most readers but mean opposite things (§2.4): *"`depends_on: []` means no dependencies — this step starts immediately, in parallel."*

Stage rendering comes straight from `wp.stages()`. Each `string[]` is a parallel lane. Injected steps (`clone`) render visually distinct and non-editable, labelled "added automatically". Cycles render as an error with the reported path.

### 6.4 Prose generator ("runs when…")

A plain-language sentence for every workflow and step.

**Deterministic TypeScript, not an LLM.** It is a pure function of the `when` AST, it must be testable, and it must never state something the matcher would contradict.

```ts
describeWhen(when: WhenAST, ctx: { level: 'workflow' | 'step' }): string
```

Correctness requirements, all from §2.5:

- List form → "…or…"; map form → "…and…".
- `path:` gets the qualifier "on push and pull request events only".
- `branch:` is annotated as not applying to tag events.
- `cron:` only applies to cron events.
- `matrix:` only at step level.
- `evaluate:` is rendered raw in backticks; no attempt to paraphrase an expression.
- Empty `when` → "Runs for every event."

Examples:

> "Runs on pull requests, or on pushes to `main`."
> "Runs on tag events. The workflow's own filter also applies — it excludes tags, so this step will not run."

That second form is the composition point from §2.5 and is exactly the confusion the tool exists to remove.

**Verification:** every generated sentence is cross-checked in tests against `wp.match()` over a generated metadata grid. If the prose says "runs on push to main" and the matcher disagrees for `{push, main}`, the test fails. Prose that can lie is worse than no prose.

### 6.5 Setup checklist

Derived automatically, not authored. Scan the config for `from_secret:` references and, via §5, plugin settings typed `secret` or `required`. Emit a checklist:

> **Before this pipeline can run:**
> - Create secret `codeberg_token` — used by step `publish`
> - Create secret `mail` — used by step `publish`
> - Plugin `docker-buildx` requires `repo` (currently unset)

This surfaces knowledge the generator already has and that today only exists as YAML comments. It directly targets failure mode 4 (§1).

### 6.6 Progressive disclosure

Default step form shows five fields: `image`, `commands`, `when.event`, `when.branch`, secrets. Everything else (`clone`, `backend_options`, `privileged`, `failure`, `detach`, `directory`, …) sits behind **Advanced**.

Overwhelm is the metric being optimized. The full field set is available but not in the way.

**Anchors and `variables:`** do not map to a form. When a block uses anchors or merge keys, the form marks it read-only and directs the user to the text pane; the AST preserves it byte-for-byte. Same fallback as `object`-typed plugin settings (§5.3). This is a deliberate, visible limit rather than a silent mangling — and given §2.9, silently rewriting a merge key would be a correctness bug.

### 6.7 Simulator

Feeds the same `wp.match()` used everywhere else.

Two input paths, as specified:

1. **Dropdowns** — event, branch, tag, PR target, status, cron, changed files. Fast exploration.
2. **`metadata.json` import** — drag the file downloaded from the existing Pipeline → Debug page (§2.7). Reproduces a real pipeline exactly.

Non-matching steps grey out. The workflow gate is applied first: if the workflow does not match, everything greys out with a single explanation at the top rather than N confusing per-step messages.

The simulator's honest framing is "this is what `woodpecker-cli exec --metadata-file` would select" — it is the browser form of an existing sanctioned workflow, not a new source of truth.

### 6.8 Matrix preview

`wp.matrix()` expands to concrete axes. The UI lists the resulting jobs with `${VAR}` substituted into image and commands, and runs each combination through the matcher so per-job `when: matrix:` greying is correct.

Enforce and explain the limits from §2.12 (10 tags, 25 axes) in the UI rather than letting the config fail server-side.

### 6.9 Import (MVP form of the commit bot)

A field accepting a public HTTP(S) URL to a raw config. Fetch, parse, load into the AST with comments preserved, lint, done.

Constraints: HTTPS only, size cap, no credentials, no redirects to private ranges, and a clear CORS-failure message with a paste fallback (many forges do not send permissive CORS headers on raw endpoints). Read-only, public-only, stateless.

### 6.10 Export

- Download `.woodpecker.yaml`, or a `.woodpecker/` directory as a zip for multi-workflow configs.
- Copy to clipboard.
- **Placement hint**, always shown: root `.woodpecker.yaml` for a single workflow, `.woodpecker/<name>.yaml` for multiple. Users get this wrong; the examples repo lists it as a rule for a reason.

### 6.11 Shareable state URL

Full config compressed into the URL fragment. Fragment, not query — it never reaches a server, which keeps the "no state, no telemetry" property literally true.

Turns support threads into "here is my exact config" links. Cheap to build, and it matches how this community actually helps newcomers.

### 6.12 Version selector

Woodpecker 1.x, 2.x, and 3.x differ materially (`pipeline:` → `steps:`, `platform:` → `labels:`, `branches:` folded into `when:`).

MVP: **latest major only**, stated plainly in the UI. Multi-version means one WASM per version at 3.3 MB each; defer until there is demand. The version selector appears in the UI from day one with a single option so the affordance exists before it is needed.

---

## 7. Later — in-app integration

`packages/core` moves into `web/src`, and the standalone shell is replaced by a Vue view. Natural home: the existing **Pipeline → Debug** page (§2.7), which already has the metadata download and the `push`-permission gate.

In-app, the app gains what the standalone cannot have: the instance's real trust configuration (§2.11), the repo's real secret names, and the actual `metadata.json` without a download round-trip. The standalone remains valuable for people who do not yet have a Woodpecker instance — which is precisely the onboarding audience.

---

## 8. Deferred

### 8.1 Not deferred, to be explicit
Importing an existing config by URL (§6.9) is **in MVP**. It is what makes the AST-not-object decision (§3) load-bearing.

### 8.2 Commit bot
Fork-and-push to Codeberg/GitHub via a microservice. Requires OAuth, rate limiting, and abuse controls, and it breaks the static-app property. Deferred deliberately. When built: stateless, API-only, no persisted tokens, per-user rate limits.

### 8.3 Plugin catalog with live registry data
Searchable catalog with typed settings forms from §5, plus image tag lookup and `@sha256:` pinning. Depends on the index and a registry query; higher cost, high value. Post-MVP.

### 8.4 Inline micro-docs
Hover on a field pulls the relevant line from the Woodpecker docs, so the docs tab stays closed.

### 8.5 Multi-version support
See §6.12.

---

## 9. Testing

Per project convention, TDD for meaningful behavior. Test logic, regressions, contracts, and edge cases — not wiring or third-party behavior.

| Area | Approach |
|---|---|
| Prose generator | Cross-checked against `wp.match()` over a generated metadata grid. Prose and matcher must never disagree |
| Path → range (§4.4) | Table-driven over the full 26-config corpus, both map and list forms |
| AST round-trip | Parse → mutate → serialize preserves comments, key order, anchors. Corpus-wide |
| Settings parser | Fixtures for v1, legacy, and malformed; assert graceful degradation, never a throw |
| DAG semantics | `depends_on` absent vs `[]` vs populated; mixed mode; cycles; optional missing deps |
| WASM boundary | Parse failure must not panic (§4.3). Fuzz with the corpus plus mutations |

Upstream already has fuzz tests for `constraint`, `matrix`, `metadata`, and `schema`; the WASM wrapper should reuse those corpora.

---

## 10. Open questions

1. **Enum representation** (§5.3) — inline `enum(a,b,c)` or a separate `Allowed` column. Blocks freezing v1.
2. **Bundle budget** — is 3.27 MB brotli acceptable for a lazy-loaded module, or should the compiler be dropped to reach 2.03 MB at the cost of the DAG view? Recommend keeping it; the DAG view is a top-three feature.
3. **Hosting** — subpath on the Docusaurus site, or a separate artifact under the same domain? Needs upstream input before the deploy pipeline is written.
4. **WASM repo location** — inside `woodpecker-ci/woodpecker` (guaranteed in sync, adds a JS release axis to the Go repo) or a sibling repo tracking releases (cleaner separation, drift risk). Recommend in-tree under `cmd/`, published by the existing release pipeline.
5. **Settings-table lint** — warn-only in plugin-index CI, or blocking for verified plugins?

---

## 11. Suggested sequence

1. Open an upstream discussion covering §5 (settings format) and §10.3 (hosting). Both need buy-in before code has a home.
2. `@woodpecker-ci/pipeline-wasm` + `cmd/pipeline-wasm`. Independently useful, unblocks everything else.
3. `@woodpecker-ci/plugin-schema` + the `creating-plugins.md` docs change. Migrate the 22 verified plugins.
4. `packages/core` — AST, path→range, prose generator. This is where the tests live.
5. `apps/generator` — templates, split view, simulator, DAG view, export.
6. Ship, gather feedback, then reassess §8.

---

## Appendix A — reproducing the WASM validation

```bash
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/woodpecker-ci/woodpecker.git wp
cd wp && git sparse-checkout set pipeline cmd shared web

# go.mod declares go 1.26.0
mkdir -p cmd/wasmpoc   # main.go exporting lint/match/matrix/stages via syscall/js
GOOS=js GOARCH=wasm go build -o /tmp/wp.wasm ./cmd/wasmpoc

cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" /tmp/
node /tmp/run.cjs      # instantiate + call
```

Two gotchas found the hard way:

- `linter.Lint` dereferences `config.Workflow`. Passing only `RawConfig` panics with a nil-pointer dereference. Always `yaml.ParseString` first and pass the result.
- Measure with brotli, not gzip. The difference is material: 2.8 MB gzip versus 2.03 MB brotli for the same artifact.
