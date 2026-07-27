# Decisions

Resolutions for the open questions in section 10 of the spec. Where the spec
made a recommendation, it was taken.

## 1. Enum representation: inline

Enum values live inline in the Type cell as `enum(a,b,c)`. Keeps the v1 table at
five columns and keeps it scannable. A separate `Allowed` column parses more
cleanly but widens an already wide table.

Encoded in `packages/plugin-schema/src/types.ts` as
`{ kind: 'enum'; values: string[] }`. Still worth flagging in the upstream
discussion before v1 is frozen, since changing it later is a format break.

## 2. Bundle budget: keep the compiler

Ship one module including the compiler, roughly 3.27 MB brotli, lazy-loaded on
first edit. Dropping the compiler saves about 1.2 MB but costs the DAG view,
which is a top-three feature.

Splitting into two modules is a false economy: each Go WASM module carries its
own ~2 MB runtime baseline, so two modules cost more than one.

## 3. Hosting: unresolved, blocked upstream

Subpath on the Docusaurus site versus a separate artifact under the same domain.
Needs upstream input before the deploy pipeline is written.

Until then `apps/generator` builds with `base: './'`, which works either way.

## 4. WASM source location: in-tree upstream

The Go entry point lives in `woodpecker-ci/woodpecker` under
`cmd/pipeline-wasm`, published by the existing release pipeline. Guaranteed in
sync, at the cost of adding a JS release axis to the Go repo. A sibling repo
would be cleaner separation but invites drift, and drift here means the browser
disagreeing with the server about what runs.

Consequence for this repo: `packages/pipeline-wasm` holds only the JavaScript
wrapper. `scripts/build-wasm.sh` builds the artifact from an upstream checkout,
and the artifact is gitignored. The package is deliberately shaped so it can
move upstream unchanged.

## 5. Settings-table lint: warn-only

The plugin-index CI validates v1 tables (column set present, types in
vocabulary, `Required` in {yes, no}) and warns. Not blocking, including for
verified plugins.

Authors opt into v1 per plugin. Making the lint blocking on day one would
punish the plugins that adopt the format first, which is backwards.

## Stack pinning

The app tracks Woodpecker's own frontend stack (Vue 3.5, Vite 8, Tailwind 4,
Pinia, vue-i18n, Vitest, TypeScript 6) so the eventual in-app merge is
mechanical. TypeScript 7 is available but upstream is on 6, so this repo stays
on 6 until upstream moves.
