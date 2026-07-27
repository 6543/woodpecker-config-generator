# Upstream patches

Two commits against `woodpecker-ci/woodpecker`, to be applied with `git am`:

```sh
git am /path/to/upstream-patches/*.patch
```

- `0001` exports the embedded workflow JSON schema, so a frontend can offer
  completion and hover documentation without shipping a second copy.
- `0002` adds `cmd/pipeline-wasm`, the `GOOS=js GOARCH=wasm` entry point that
  `@woodpecker-ci/pipeline-wasm` wraps.

The Go source lives upstream rather than here so it cannot drift from the
server. Build the artifact with:

```sh
WOODPECKER_SRC=/path/to/woodpecker pnpm --filter @woodpecker-ci/pipeline-wasm build:wasm
```

Verified against `main` at `d2251fe` with Go 1.26.5 (`go.mod` declares 1.26.0).
`GOOS=js GOARCH=wasm go vet` and `gofmt` are clean. Output: 20.1 MB raw,
4.61 MB gzip, 3.30 MB brotli.
