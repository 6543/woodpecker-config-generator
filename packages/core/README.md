# @woodpecker-ci/config-core

Framework-neutral core for the configuration generator. No Vue, no React, no
bundler assumptions, so it can move into Woodpecker's own `web/src` unchanged.

Everything the design calls for is implemented: the YAML AST layer,
path-to-range resolution, the prose generator, the setup checklist and the
shareable state codec.

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

## Prose

```ts
describeWhen({ event: 'tag' }, { level: 'step', workflowWhen: { event: 'push', branch: 'main' } });
// "Runs on tags. The workflow filter also applies: it runs on pushes on branch `main`."
```

Deterministic TypeScript, never a model. Sentences render from `analyzeWhen`,
which turns a `when` block into structured facts, so every claim a sentence
makes is also available as data and can be checked against the real engine.

Qualifiers the matcher applies silently are stated, because they are the whole
reason the feature exists:

- `Runs on tags on branch `main`, which has no effect because branch filters are
skipped for tag events.`
- `Runs on deployments touching `docs/**`, which has no effect because path
filters apply only to push and pull request events.`
- `Runs on any event for matrix `GO=1.26`, which has no effect because matrix
filters are step-level only.`

The qualifier appears only when some admitted event ignores the filter. Adding
it to a push-only clause is noise that trains people to skim.

`evaluate:` is rendered raw in backticks. Paraphrasing an expression is where
prose starts lying.

Step-level `when` never merges the workflow gate into one sentence: the two are
evaluated independently upstream, and a step whose own filter matches still does
not run when the workflow filter excludes the event.

### Cross-check

`prose.test.ts` runs twelve `when` blocks through the real WASM matcher across
all nine webhook events and asserts the events a sentence claims are exactly the
events the engine admits. It skips where the artifact is absent, so build it
before trusting a green run:

```sh
WOODPECKER_SRC=/path/to/woodpecker pnpm --filter @woodpecker-ci/pipeline-wasm build:wasm
```

## Setup checklist

```ts
buildChecklist(doc, plugins); // plugins keyed by image, without tag or digest
```

Derived, never authored. Every `from_secret:` in a step becomes an item naming
the steps that need it, and any required plugin setting left unset becomes
another. The Hugo example in the corpus documents its two secrets only in a
header comment, which is exactly the knowledge that disappears on copy-paste;
the checklist recovers both from the config itself.

## Importing an existing config

```ts
const result = await importFromUrl('https://codeberg.org/o/r/raw/branch/main/.woodpecker.yaml');
```

Read-only, public-only, stateless. Refuses anything but https, refuses URLs
carrying credentials, and refuses loopback, RFC1918, `.local`, `.internal` and
169.254.169.254, which is the cloud metadata endpoint and the reason the list is
not optional.

Redirects are refused rather than followed. A browser cannot see where a
redirect leads, so following one would make the address check meaningless.

Size is capped both by the declared `content-length` and again after reading,
because the header can lie. A cross-origin failure comes back as a message
pointing at pasting instead: many forges do not send permissive CORS headers on
raw endpoints, and that is not something the app can fix.

## Shareable state

```ts
const fragment = encodeState({ files }); // no leading '#'
const state = decodeState(location.hash); // null for anything unparseable
```

Deflate then base64url, behind a version prefix so a format change invalidates
old links rather than misreading them. Synchronous on purpose: `CompressionStream`
exists in both targets but is async, and an async codec would push a promise
through every caller that only wants to update the address bar.

## Tests

Corpus-driven, vendored from `codeberg.org/codeberg-ci/examples` under
`src/fixtures/corpus`. 28 of those configs use map-form steps and 7 use list
form, so both paths are exercised by real files rather than by invented ones.
