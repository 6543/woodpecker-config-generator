# Generator app

Vue 3, Vite, Tailwind. Static build, no backend, no account, no server-side
state.

## Running it

The engine artifact is not committed. Build it from the in-repo Go module, then
copy it in:

```sh
pnpm --filter @woodpecker-ci/pipeline-wasm build:wasm
pnpm --filter @woodpecker-ci/config-generator-app sync:wasm
pnpm dev
```

`build:wasm` needs no upstream checkout: it compiles `packages/pipeline-wasm/wasm`,
which imports `go.woodpecker-ci.org/woodpecker/v3`. `sync:wasm` copies
`woodpecker.wasm`, `wasm-exec.js` and `schema.json` into `public/`, so they keep
stable names and the bundler does not emit a second hashed copy of a 21 MB file.

## What it does

- **Template picker** instead of a blank page. Every template is checked against
  the real engine in `data/templates.test.ts`: it must parse, lint without
  errors, resolve to stages, and run at least one step on a push. A template
  that does not lint is worse than no template.
- **Split view**, both panes always visible. Showing the YAML at all times is a
  teaching choice: the tool should make itself unnecessary.
- **Prose** for the workflow and every step, from `@woodpecker-ci/config-core`.
- **Execution view** showing sequential or DAG mode, the parallel groups, the
  implicit clone marked as added automatically, and a warning for the mixed case
  where only some steps declare `depends_on`.
- **Simulator**, either dropdowns or a real `metadata.json` dragged in from the
  Pipeline to Debug page. Steps that would not run grey out. When the workflow
  gate excludes the event, one explanation replaces N per-step messages.
- **Matrix preview**, one button per expanded job.
- **Setup checklist** derived from the config rather than from comments.
- **Import by URL** on the picker, for a config you already have. Refuses
  anything but public https, sends no credentials, and refuses redirects.
- **Share** compresses the config into the URL fragment, which never reaches a
  server.
- **Version affordance** showing 3.x only. 1.x and 2.x differ materially
  (`pipeline:` to `steps:`, `platform:` to `labels:`), and supporting them means
  one artifact per version.

## Known gaps

The YAML pane is a textarea, not CodeMirror. Clicking a diagnostic selects the
offending range, so the path-to-range mapping is exercised, but there are no
inline squiggles yet. That is the next piece of UI work.

Plugin settings forms are not wired up. They need a plugin catalog fetched from
the index, which the design defers past MVP.
