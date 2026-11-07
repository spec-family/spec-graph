---
status: accepted
date: 2026-11-07
---

# ADR-0028: A figure rests on a record

## Context

A specification states targets and a report states figures: a projection
under a tenth of a millisecond, a speed-up over another language. Nothing
linked a figure to how it was measured, so a number produced by a stand-in
benchmark read like a measured one, and a target with no way to measure it
read like a target.

A repository can already write how it measures: a section per protocol, each
with what is timed, on which corpus, by which method, on which machine, and
its latest result. Its fields differ by kind of measurement. A timing has a
machine; a benchmark of an agent has a model, its version and a harness; a
count of annotations has neither. And no tool can find the numbers in a
document's prose without guessing which are figures, which this family does
not do ([ADR-0006](0006-false-positives-cost-more.md)).

## Decision

**A measurement protocol is a section the configuration names, held to the
fields it asks for and to a result that names a date or says none yet. A
claim whose label asks for a measurement cites a protocol, and a figure a
document marks rests on a protocol with a dated result.**

```json
{
  "protocols": {
    "files": ["ROADMAP.md"],
    "heading": "Measurement protocols",
    "result": "Last result",
    "fields": { "*": ["Method"], "agent-pass-rate": ["Agent", "Tasks"] },
    "claims": ["Target"]
  }
}
```

<!-- @spec-edge kind="depends-on" to="ADR-0024" reason="a claim's label is what asks for a protocol" -->

- **A protocol is each section one level under `heading`** in a document
  `files` names. Its fields are the lines it writes as `**Name**: value`, as a
  list item or a line of its own. It is an item, named by its heading's
  anchor, so `[the protocol](ROADMAP.md#view-projection)` reaches it: closed
  where its result names an ISO date, open where it says none yet or nothing.
- **`incomplete-protocol`**, an error: a protocol that lacks the result field
  or a field `fields` asks of every protocol, under `*`, or of this one, under
  its anchor. The fields are configured per protocol, since a timing, an
  agent's benchmark and a count write different ones.
- **`undated-result`**, an error: a result that names no date and does not
  open with "none yet".
- **`target-without-protocol`**, an error: a claim whose label `claims` lists
  that cites no protocol.
- **A figure is marked, never found.** `<!-- @spec-figure record="ROADMAP.md#view-projection" -->`,
  written before the figure, marks it and names its record. The record is a
  citation like any other: one that does not resolve is a `broken-reference`.
  **`unrecorded-figure`**, an error: a marked figure that names no record, a
  record that is no protocol, or a protocol with no dated result. A number in
  prose that nobody marked is not read: finding one would be a guess.

## Not this round

- **A report that may state a figure only with a record.** Without reading
  numbers out of prose, a report's unmarked figures are invisible, and a rule
  that holds only the marked ones holds them anywhere, report or not. A
  document declared a report waits for a reading of figures that does not
  guess.
- **A record's history of results.** A protocol's latest result is held; a
  log of earlier ones is the repository's to keep.

## Consequences

A repository that configures no `protocols` and marks no figure sees nothing
change. A figure is held wherever it is marked, protocols configured or not:
marked where none are, its record is no protocol, so a repository that marks
figures says where its protocols are written.
