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

Measured on the built artifact: 20.06 MB raw, 4.61 MB gzip, 3.30 MB brotli.
Close enough to the 3.27 MB estimate that the decision stands unchanged, and it
confirms brotli is the number to quote: gzip is 1.3 MB worse for the same
bytes.

## 3. Hosting: unresolved, blocked upstream

Raised as question 4 in `upstream-patches/DISCUSSION.md`.

Subpath on the Docusaurus site versus a separate artifact under the same domain.
Needs upstream input before the deploy pipeline is written.

Until then `apps/generator` builds with `base: './'`, which works either way.

## 4. WASM source location: in-repo module importing `v3`

The Go entry point lives here, in `packages/pipeline-wasm/wasm/`, as its own
module that imports `go.woodpecker-ci.org/woodpecker/v3` as an ordinary
dependency. No upstream checkout, no patches: `wasm/go.mod` pins the engine
version, so the browser and the server can only disagree when that pin is bumped
deliberately. The schema is not embedded; `build:wasm` fetches it from
`SCHEMA_URL` (default: `woodpecker-ci/woodpecker` `main`) and ships it beside the
artifact. Upstreaming the entry point into the release pipeline stays an option
later, but is no longer a prerequisite for building.

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
