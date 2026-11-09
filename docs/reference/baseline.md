# Adopting this on a repository that predates it

Fifty findings on day one is not a report, it is a decision to be ignored. So
record what is already wrong, and check only what happens next:

```bash
spec-graph check --record-baseline .spec-graph-baseline.json
git add .spec-graph-baseline.json
```

```json
{
  "version": 1,
  "findings": [
    { "rule": "broken-reference", "document": "ADR-0004", "subject": "docs/plans/x.md", "count": 1 }
  ]
}
```

A recording writes every finding down and judges none, so the options that
judge, show or colour a report are refused beside it, exit `2`: `--ratchet`,
`--strict`, `--max`, `--max-warnings`, `--color`, `--no-ascii`, and `--format`
`sarif`, `github` or `gitlab`, each a report of findings, of which a recording
makes none. `--format json` writes what was recorded as a document,

```json
{ "version": 1, "recorded": { "file": ".spec-graph-baseline.json", "findings": 2, "entries": 2 } }
```

and `--format markdown` the line, which reads as Markdown already. The options
that choose what is found, `--rule` among them, are read by a recording as by a
check.

CI is green from the first commit, every specification written afterwards is
checked in full, and a new finding fails the build. When debt is paid, the run
says so:

```text
16ms · 2 accepted by .spec-graph-baseline.json
1 baseline entry no longer occurs - tighten it: spec-graph check --record-baseline ...
```

**It is keyed on the specification and the citation, never on a line number.**
A baseline that expires when somebody reformats a paragraph is worse than none,
so the entry survives edits, reordering, and the file being renamed — because
`ADR-0004` is the decision's name, not its location. Repeats are counted rather
than told apart, which is the deliberate cost of a key with no position in it.

By default that line is a note and the build stays green: failing because
somebody fixed something is a strange way to encourage them. But a note in CI
is a line that scrolls past, and an exemption nobody strikes outlives the defect
it was written for. A team that has decided its debt only moves one way turns on
the other side of the ratchet:

```bash
spec-graph check --baseline .spec-graph-baseline.json --ratchet
```

Now an undeclared finding fails **and** a declared one that no longer occurs
fails, each named, with `--record-baseline` as the fix — and the diff of that
file is the record of what was paid off.

**A `--baseline` you typed has to be there.** A path that reads nothing accepts
nothing, reports every accepted finding as new, and passes `--ratchet` with
nothing left to be stale about, so a typo in it looks exactly like a regression
nobody introduced: it exits `2` instead. A `"baseline"` in the configuration is
the other case and stays optional, because a repository declares the path before
the first run records the file — `--verbose` says when it read nothing. Either
may be absolute. See [ADR-0012](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0012-a-baseline-is-a-ratchet.md).
