# Directives

Inference covers almost everything, but inference you cannot override is a trap.
Directives are ordinary HTML comments — invisible in every Markdown renderer:

```md
<!-- @spec-node id="ADR-0007" status="accepted" aliases="sharding, adr-7" -->
<!-- @spec-item id="shard-key" state="narrowed" -->
<!-- @spec-edge kind="delegates-to" to="ADR-0011#scope" -->
<!-- @spec-ignore -->
<!-- @spec-history -->
<!-- @spec-figure record="ROADMAP.md#refund-latency" -->
<!-- @spec-path created="docs/plan.md" -->
<!-- @spec-command created="bench" -->
```

Each takes these attributes. Any other is a parse problem, listed by
`--verbose`, and the directive still applies:

| directive | attributes |
| --- | --- |
| `@spec-node` | `id`, `status`, `title`, `aliases`, `kind` |
| `@spec-item` | `id`, `state`, `title`, `owner`, `note` |
| `@spec-edge` | `kind`, `to`, `from`, `reason` |
| `@spec-ignore` | `reason` |
| `@spec-history` | none |
| `@spec-figure` | `record`, `reason` |
| `@spec-path` | `created`, `external`, `reason` |
| `@spec-command` | `created`, `absent`, `reason` |

- `reason`, `note`, `owner` and a node's `kind` are for whoever reads the
  source; spec-graph reads nothing from them.
- An edge's `kind` is one of the relations a selector steps along. Any other
  word is a parse problem too, and the edge is read as `references`.
- `aliases` splits at commas, semicolons and spaces.
- A value is quoted with either quote mark, or bare when it holds no space or
  quote, and an attribute with no value is a flag.
- A directive is the first thing in its comment, so a comment that only
  mentions one is a comment.

A directive always wins, and the report says the state came from a directive, so
an override is visible rather than mysterious.

A `@spec-item` annotates one item: the one directly below it, with nothing but
blank lines or other comments between, or else the one it is written on or
indented under. An id that two items end up with is a parse problem, listed by
`--verbose`, and the first item keeps it.
