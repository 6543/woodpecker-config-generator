# Woodpecker interactive configuration generator

Monorepo for three deliverables described in the pre-RFC spec:

1. `@woodpecker-ci/pipeline-wasm`, the Woodpecker pipeline frontend compiled to
   WebAssembly and wrapped for JavaScript.
2. `@woodpecker-ci/plugin-schema`, a parser for machine-readable plugin settings
   tables (`woodpecker-plugin-settings v1`).
3. A standalone webapp that builds a `.woodpecker.yaml` and shows what would run.

**Status: working.** All three packages and the app are implemented and tested
against the real engine. The YAML pane is still a textarea rather than
CodeMirror, and plugin settings forms are not wired up.

The Go side of the WASM module lives upstream, not here. `upstream-patches/`
holds the two commits to apply to `woodpecker-ci/woodpecker`, plus
`DISCUSSION.md`, the draft post covering the plugin settings format and the
remaining open questions.

## Layout

```
packages/pipeline-wasm/   published npm package, WASM wrapper
packages/plugin-schema/   settings-table parser
packages/core/            AST ops, path-to-range, prose, checklist, state codec
apps/generator/           Vue 3 standalone app
```

`core` depends on `pipeline-wasm` and `plugin-schema` and imports no framework.
`apps/generator` is a shell. When the time comes to embed this in Woodpecker's
own UI, `core` moves in unchanged.

## Requirements

- Node 22 or newer
- pnpm 11 (`corepack enable`)
- Go, only for `pnpm --filter @woodpecker-ci/pipeline-wasm build:wasm`, and only
  against a `woodpecker-ci/woodpecker` checkout

## Commands

```sh
pnpm install
pnpm check        # format:check, lint, typecheck, test
pnpm dev          # generator app on Vite
pnpm build        # packages, then the app
```

The WASM artifact is not committed. Build it from an upstream checkout:

```sh
WOODPECKER_SRC=../woodpecker pnpm --filter @woodpecker-ci/pipeline-wasm build:wasm
```

## Two invariants worth knowing before contributing

**One engine, many renderers.** Diagnostics, the run simulator, the DAG view and
the prose generator all derive from the same WASM calls. There is never a second
`when` matcher. Reimplementing the semantics in TypeScript would guarantee
drift.

**The AST is the model.** Not a plain JS object. Round-tripping through a plain
object destroys comments and key order, and importing an existing config is an
MVP feature. Woodpecker also parses with a YAML dialect that supports sequence
merge keys, which the `yaml` npm package does not implement, so the JS AST is
for editing and range mapping only. Where the two disagree, WASM wins.

## Licence

Apache-2.0, matching upstream.
