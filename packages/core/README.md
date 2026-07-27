# @woodpecker-ci/config-core

Framework-neutral core for the configuration generator. No Vue, no React, no
bundler assumptions, so it can move into Woodpecker's own `web/src` unchanged.

Implemented: the YAML AST layer and path-to-range resolution. Prose generation,
the setup checklist and the shareable state codec are still stubs, and prose in
particular stays stubbed until the WASM matcher exists to cross-check it against.

## The AST is the model

```ts
import { parseDocument, serialize, resolveRange, isFormHostile } from '@woodpecker-ci/config-core';

const doc = parseDocument(source);
doc.setIn(['steps', 'build', 'image'], 'golang:1.26');
const next = serialize(doc); // comments, key order and flow style intact
```

Round-tripping through a plain JS object destroys comments and key order.
Importing an existing config is an MVP feature, so the document stays an AST from
parse to serialize.

Two stringify options carry that promise, and neither is cosmetic:

- `lineWidth: 0` disables folding. Without it, long `commands:` entries wrap and
  the file stops matching what the user wrote.
- `flowCollectionPadding: false` keeps `[push, pull_request]` from becoming
  `[ push, pull_request ]`.

With both, all 35 configs in the vendored corpus reserialise byte for byte.
Without them, 7 do.

## Path to range

WASM diagnostics carry a YAML path such as `steps.build` and no line or column,
so mapping the path to a text range is the host's job.

```ts
resolveRange(doc, 'steps.build'); // { start, end } or null
```

- Prefers the key node's range, so a squiggle lands on the identifier.
- Resolves `steps.<name>` in both shapes: `steps: {build: ...}` by key, and
  `steps: [{name: build}]` by the `name` field. A numeric segment indexes a
  sequence.
- Falls back to the nearest resolvable ancestor.
- Returns null when nothing resolves. The caller then shows the diagnostic in
  the panel without an editor anchor and never drops it.

A quoted key keeps its quotes inside the range, because the quotes are part of
the token to underline. The corpus contains a real case: `'Check package':`.

## Form-hostile blocks

```ts
isFormHostile(doc, 'steps.dryrun'); // true when anchors, aliases or merge keys are involved
```

Those blocks do not map to a form. The UI marks them read-only and points at the
text pane while the AST preserves them byte for byte. Rewriting a merge key
would be a correctness bug: Woodpecker parses with a dialect that supports
sequence merge keys, and the `yaml` npm package does not.

## Tests

Corpus-driven, vendored from `codeberg.org/codeberg-ci/examples` under
`src/fixtures/corpus`. 28 of those configs use map-form steps and 7 use list
form, so both paths are exercised by real files rather than by invented ones.
