#!/usr/bin/env bash
# Build the Woodpecker pipeline frontend to WebAssembly.
#
# The Go source lives upstream in woodpecker-ci/woodpecker under
# cmd/pipeline-wasm (spec 10.4). This script builds it from a checkout and
# drops the artifact into dist/, content-hashed.
#
# Usage: WOODPECKER_SRC=/path/to/woodpecker ./scripts/build-wasm.sh
set -euo pipefail

SRC="${WOODPECKER_SRC:-}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/dist"

if [ -z "$SRC" ]; then
  echo "WOODPECKER_SRC is unset. Point it at a woodpecker-ci/woodpecker checkout." >&2
  exit 1
fi
if [ ! -d "$SRC/cmd/pipeline-wasm" ]; then
  echo "$SRC/cmd/pipeline-wasm not found. The WASM entry point is not in this checkout." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Use at least the Go version go.mod declares.
GO_VERSION="$(awk '/^go /{print $2; exit}' "$SRC/go.mod")"
echo "go.mod declares go $GO_VERSION"

( cd "$SRC" && GOOS=js GOARCH=wasm go build -o "$OUT_DIR/woodpecker.wasm" ./cmd/pipeline-wasm )

# wasm_exec.js ships with the toolchain and must match the compiler exactly.
# It is a classic script that assigns globalThis.Go from inside an IIFE, so a
# one-line re-export turns it into an ES module without patching the body.
{
  cat "$(go env GOROOT)/lib/wasm/wasm_exec.js"
  echo
  echo "export const Go = globalThis.Go;"
} > "$OUT_DIR/wasm-exec.js"

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
