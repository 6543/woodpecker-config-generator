#!/usr/bin/env bash
# Build the Woodpecker pipeline frontend to WebAssembly.
#
# The Go entry point lives in ../wasm as its own module that imports
# go.woodpecker-ci.org/woodpecker/v3 as an ordinary dependency, so there is no
# upstream checkout to point at and no patches to apply: the pinned module in
# wasm/go.mod is the single source of the engine version.
#
# Usage: ./scripts/build-wasm.sh
#   SCHEMA_URL=<url>   override where the workflow JSON schema is fetched from.
set -euo pipefail

PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$PKG_DIR/dist"
WASM_SRC="$PKG_DIR/wasm"

# The workflow JSON schema is not embedded in the wasm. It is fetched at build
# time and shipped beside the artifact, so the runtime stays offline: the linter
# emits its own diagnostics, and this copy only feeds editor completion/hover.
SCHEMA_URL="${SCHEMA_URL:-https://raw.githubusercontent.com/woodpecker-ci/woodpecker/refs/heads/main/pipeline/frontend/yaml/linter/schema/schema.json}"

mkdir -p "$OUT_DIR"

# Keep the toolchain fixed to the one on PATH (the flake pins go 1.26); never
# let the go directive trigger a toolchain download mid-build.
export GOTOOLCHAIN="${GOTOOLCHAIN:-local}"

GO_VERSION="$(awk '/^go /{print $2; exit}' "$WASM_SRC/go.mod")"
echo "wasm/go.mod declares go $GO_VERSION; building with $(go version | awk '{print $3}')"

( cd "$WASM_SRC" && GOOS=js GOARCH=wasm go build -o "$OUT_DIR/woodpecker.wasm" . )

# wasm_exec.js ships with the toolchain and must match the compiler exactly.
# It is a classic script that assigns globalThis.Go from inside an IIFE, so a
# one-line re-export turns it into an ES module without patching the body.
{
  cat "$(go env GOROOT)/lib/wasm/wasm_exec.js"
  echo
  echo "export const Go = globalThis.Go;"
} > "$OUT_DIR/wasm-exec.js"

echo "fetching workflow schema from $SCHEMA_URL"
curl -fsSL "$SCHEMA_URL" -o "$OUT_DIR/schema.json"

HASH="$(sha256sum "$OUT_DIR/woodpecker.wasm" | cut -c1-6 | tr 'a-f' 'A-F')"
mv "$OUT_DIR/woodpecker.wasm" "$OUT_DIR/woodpecker-$HASH.wasm"
ln -sf "woodpecker-$HASH.wasm" "$OUT_DIR/woodpecker.wasm"

# -ldflags="-s -w" saves under 3% on Go WASM, so it is not used.
# Measure with brotli, not gzip: the difference is material (spec appendix A).
if command -v brotli >/dev/null; then
  brotli -q 11 -f -k "$OUT_DIR/woodpecker-$HASH.wasm"
  ls -l "$OUT_DIR/woodpecker-$HASH.wasm" "$OUT_DIR/woodpecker-$HASH.wasm.br"
else
  echo "brotli not installed, skipping transfer-size measurement" >&2
  ls -l "$OUT_DIR/woodpecker-$HASH.wasm"
fi
