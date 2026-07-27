# Discussion: a browser-side pipeline frontend, and machine-readable plugin settings

Draft for an upstream discussion on `woodpecker-ci/woodpecker`. Two proposals
and three questions. Everything below was measured against `main` at `d2251fe`
with Go 1.26.5, not estimated.

## Why

New users hit the same five walls, all visible in the published examples:

1. They do not know what a minimal `.woodpecker.yaml` looks like.
2. They cannot predict which steps run for a given event. Two `when` syntaxes,
   map for AND and list for OR, compound this.
3. Sequential versus DAG is implicit and flips on `depends_on` appearing
   anywhere, including as an empty list.
4. Out-of-band setup is undocumented at the point of use. `from_secret:
codeberg_token` says nothing about which token or which scopes. Today that
   lives in a header comment, which is the first thing lost on copy-paste.
5. Plugin settings are prose, so no form and no validation is possible.

A working prototype covering all five exists. The parts that need upstream are
below.

## Proposal 1: `cmd/pipeline-wasm`

The pipeline frontend compiles to `GOOS=js GOARCH=wasm` and runs in a browser
unchanged. `pipeline/frontend/yaml`, its `linter`, `constraint`, `matrix` and
`compiler` subpackages, and `pipeline/frontend/metadata` are all WASM-safe.

That makes a browser-side linter, run simulator and DAG view three renderers
over one engine, and that engine is the production engine. A second
implementation of `when` matching in TypeScript would drift, and a tool that
disagrees with the server about what runs is worse than no tool.

Two patches are attached: one exporting the embedded JSON schema, one adding the
command.

**Measured:** 20.06 MB raw, 4.61 MB gzip, **3.30 MB brotli**. Brotli is the
number worth quoting, gzip is 1.3 MB worse for the same bytes. `-ldflags="-s
-w"` saves under 3%. TinyGo is not an option, the YAML and JSON-schema paths
depend on heavy reflection.

Four things the implementation has to get right, each found by running real
configs through it rather than by reading the code:

**Logging deadlocks the module.** Not a crash, a hang. A write to stderr from
inside a synchronous `js.Func` callback goes through `syscall.Write`, which uses
an async `fsCall` that cannot complete while the callback is still on the stack.
The Go runtime reports "all goroutines are asleep" and `recover()` does not
help. `Metadata.Environ` logs at trace level when it filters an empty variable,
so this is reachable on the happy path with no error involved. The command
disables logging outright. Worth knowing before anyone adds a log line to a hot
path in the frontend packages.

**`Lint` dereferences `config.Workflow` without a nil check.** Passing only
`RawConfig` panics. The command parses first and reports a parse failure as a
diagnostic. Happy to send a nil check separately if that is wanted.

**Substitution has to happen before parsing**, as `builder.go` does. Without it a
`when` block filtering on `${CI_REPO_DEFAULT_BRANCH}` matches nothing, which
reads as a broken config rather than a missing step. Substitution also needs a
matrix axis: `image: golang:${GO_VERSION}` with no axis expands to a trailing
colon and stops being valid YAML.

**The compiler resolves `from_secret` while compiling** and fails on an unknown
name, so a config using any secret cannot be graphed in a browser at all. The
command declares the referenced names with empty values. A value cannot change
the shape of the graph.

### Question 1: where should the command live?

In tree under `cmd/`, published by the existing release pipeline, guarantees the
browser cannot drift from the server, at the cost of adding a JavaScript release
axis to a Go repository. A sibling repository is cleaner separation but invites
exactly the drift the whole design is trying to avoid.

Preference is in tree. Wanted: a second opinion.

## Proposal 2: `woodpecker-plugin-settings v1`

`docs/plugins/woodpecker-plugins/plugins.json` lists 68 plugins, 22 verified.
Each `docs.md` has frontmatter that `creating-plugins.md` specifies, and a
settings table that it does not specify at all.

A de facto convention exists and is near universal: a heading followed by a
table of `Settings Name | Default | Description`. It lacks type, requiredness
and secret-ness, which are exactly the three things a form generator needs.

**Measured against the published docs.** Of the 68 entries, 45 `docs.md` files
were reachable. A parser for the legacy convention recovers settings from 35 of
them. The other 10 contain no table at all: they document parameters as
definition lists or prose, and no parser recovers types from that.

Two things that surprised me and are worth encoding:

- `Parameter Reference` is a more common heading than `Settings`. Also seen:
  `Configuration`, `Options`.
- Several plugins have multiple tables, so an unbounded search for "the table
  after the heading" picks up `Template Reference` instead.

Both are arguments for an explicit anchor rather than a heading heuristic.

### The format

A single-line HTML comment sentinel immediately before a five-column table:

```markdown
<!-- woodpecker-plugin-settings v1 -->

| Name         | Type           | Required | Default | Description               |
| ------------ | -------------- | -------- | ------- | ------------------------- |
| `dry_run`    | `bool`         | no       | `false` | disables docker push      |
| `repo`       | `list<string>` | yes      | _none_  | image repo name(s)        |
| `password`   | `secret`       | no       | _none_  | registry password / token |
| `tag`/`tags` | `string`       | no       | _none_  | image tags                |
| `logins`     | `object`       | no       | _none_  | see example; nested map   |
```

Type vocabulary:

```
string | bool | int | duration | secret | object
list<string> | list<int>
enum(a,b,c)
```

The docs site strips single-line HTML comments before rendering
(`markdown.ts`), so the sentinel is invisible to readers while present in the
raw file. The table renders exactly as it does today. Nothing breaks on day one.

The key property is that the settings table already **is** the human
documentation. Adding a separate JSON file or schema next to it creates two
sources of truth that will drift within a release. This makes the existing table
the machine source: one artifact, both audiences.

`secret` is what makes the setup checklist possible: the generator can then say
"create secret `codeberg_token`, used by step `publish`" without the author
writing that down anywhere. `object` is a deliberate escape hatch for what a
table cannot express, such as buildx `logins:`. The parser marks it opaque and
the form falls back to a raw YAML field, which keeps "a markdown table parser is
enough" honest for the rest without pretending a table is JSON Schema.

Adoption is per plugin and version gated. No sentinel means the legacy
best-effort parse, every type `unknown`, free-text form fields with the
description as help. That is what all 68 get for free.

### Question 2: enum inline, or a separate column?

`enum(a,b,c)` in the Type cell keeps five columns and stays scannable. A
separate `Allowed` column parses more cleanly but widens an already wide table.

Preference is inline. This one blocks freezing v1, since changing it later is a
format break.

### Question 3: should the plugin-index CI validate v1 tables?

Column set present, types in vocabulary, `Required` in {yes, no}.

Preference is warn-only, including for verified plugins. Making it blocking on
day one punishes the plugins that adopt the format first, which is backwards.

## Question 4: hosting

If a standalone generator ships, does it live as a subpath on the Docusaurus
site or as a separate artifact under the same domain? It is a static build with
no backend, no account and no server-side state, so either works. This needs an
answer before a deploy pipeline can be written.

## What is deliberately not proposed

- **A commit bot.** Fork and push via a microservice needs OAuth, rate limiting
  and abuse controls, and it breaks the static-app property. Importing a config
  by public URL covers the useful half with none of that.
- **Multi-version support.** 1.x, 2.x and 3.x differ materially and each needs
  its own artifact at 3.3 MB. Latest major only, stated plainly in the UI.
- **A plugin catalog with registry data.** Depends on this proposal landing
  first.
