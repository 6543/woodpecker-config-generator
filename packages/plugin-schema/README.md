# @woodpecker-ci/plugin-schema

Parser for `woodpecker-plugin-settings v1`, the machine-readable settings table
in a Woodpecker plugin's `docs.md`.

```ts
import { parsePluginDoc } from '@woodpecker-ci/plugin-schema';

const doc = parsePluginDoc(await (await fetch(entry.docs)).text());
// doc.schemaVersion === 1, doc.settings, doc.warnings
```

`parsePluginDoc` never throws. Everything it cannot make sense of lands in
`warnings`, so one badly formatted plugin cannot break a catalog.

## The format

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

The docs site strips single-line HTML comments before rendering, so the sentinel
is invisible to readers while present in the raw file. The table renders exactly
as it does today.

A sentinel rather than a `## Settings` heading, because headings get renamed,
translated and duplicated, and plugins can have several tables. The sentinel is
an unambiguous anchor and carries the version, so the format can evolve.

### Cell rules

| Column      | Rule                                                   |
| ----------- | ------------------------------------------------------ |
| Name        | Backticked. Aliases split on `/`, first is canonical   |
| Type        | Closed vocabulary, see below                           |
| Required    | `yes` or `no`                                          |
| Default     | Backticked literal, a `${CI_*}` reference, or `_none_` |
| Description | Last column, free markdown                             |

Type vocabulary:

```
string | bool | int | duration | secret | object
list<string> | list<int>
enum(a,b,c)
```

`secret` is what lets the generator render a secret picker, emit `from_secret:`
wiring, and derive the setup checklist. `object` is the deliberate escape hatch
for structures a table cannot express; the setting comes back `opaque: true` and
the form falls back to a raw YAML field.

Enum values are inline in the Type cell. Commas need no escaping, since cells
split on `|` and not `,`. A literal pipe inside a cell is written `\|`, per GFM.

## Legacy documents

No sentinel means the legacy path: a best-effort read of the old
`Name | Default | Description` table under a settings-ish heading, with
`schemaVersion: null` and every type `unknown`. The form renders free-text
fields with the description as help text. Authors opt into v1 per plugin.

Heading detection accepts `Settings`, `Configuration`, `Options` and
`Parameter Reference`. The search is bounded by the next heading of the same or
higher level, so a section that documents parameters as a definition list does
not pick up an unrelated table further down.

## Measured against the published plugins

Run over the `docs.md` files reachable from `plugins.json` (45 of 68 fetched):

- 35 yield settings through the legacy path
- 10 yield nothing, because they contain no table at all

Those 10 document their parameters as definition lists or prose. No parser can
recover types from that, which is the argument for v1.
