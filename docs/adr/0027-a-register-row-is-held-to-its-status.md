---
status: accepted
date: 2026-11-07
---

# ADR-0027: A register row is held to its status

## Context

A register kept as a table, one row per decision, is read row by row: each
row with a key and a status is a specification named by its key
([ADR-0009](0009-a-specification-is-a-region.md)). A register whose key is a
slug rather than a numbered identifier is read the same way:

```md
| Key | Problem | Proposed resolution | Status |
| :--- | :--- | :--- | :--- |
| `refund-limit` | Refunds can exceed the capture. | Refuse them. | done: [refunds](spec/refunds.md) (commit "Refuse a refund over its capture") |
| `refund-reason` | No reason is kept. | Keep one. | proposed |
| `refund-fee` | Fees are not decided. | | open |
```

What the register says of each row was held to nothing. A key given to two
rows kept the first and dropped the second, said only under `--verbose`. A
status word nobody defined read as a status, a `proposed` row with no
resolution as a proposal, a `done` row that named neither what it changed nor
the commit as done. And a document that cites a row by its key had no form
that resolved: `[refund-limit](review.md#refund-limit)` was a broken anchor,
since a table row renders as no heading.

## Decision

**A register the configuration names is held to a status vocabulary: its
keys are unique, each status is a configured word, a row has what its status
asks for, and the rows still open are listed. A row is cited by a link to its
register with its key as the anchor.**

```json
{
  "registers": {
    "files": ["docs/review.md"],
    "resolution": "Proposed resolution",
    "statuses": {
      "open": {},
      "proposed": { "needs": ["resolution"] },
      "decided": { "needs": ["resolution"] },
      "done": { "closes": true, "needs": ["citation", "commit"] }
    }
  }
}
```

<!-- @spec-edge kind="depends-on" to="ADR-0009" reason="a register row is the specification it holds to its status" -->
<!-- @spec-edge kind="depends-on" to="ADR-0025" reason="a done row's commit is looked for in git" -->

- **A row's status is the word its status cell opens with**, in any case:
  `done` of `done: the refund rules (commit "...")`. The configuration names
  each word and what it asks for: `resolution`, the cell under the column
  `resolution` names holds text and no placeholder; `citation`, the status
  cell cites what the row changed, by a link or any reference, resolved or
  not, since a broken one is `broken-reference`'s; `commit`, the row names
  the commit that changed it, looked for in git
  ([ADR-0025](0025-commits-are-read-from-git.md)). `closes` says the status
  settles the row.
- **`unknown-register-status`**, an error: a row with no status, or one no
  configured word names, at its status cell.
- **`incomplete-register-row`**, an error: a row that lacks what its status
  asks for, naming each thing it lacks.
- **`duplicate-key`**, an error: a key a second row of a configured register
  gives, at the second row, which the graph leaves out; the first keeps the
  key and every citation of it.
- **The rows still open**, every row whose status does not close it, an
  unknown one included, are counted by status in the report, one line per
  register, listed under `--verbose`, and in JSON as `registers`, each with
  its file, its rows by status and the open ones by key, status and line.
- **A row is cited by its key as an anchor**: `[refund-limit](review.md#refund-limit)`
  reaches the row. This holds in any register, configured or not, and for a
  specification a heading declares inside a file: an anchor that names one
  read as broken before. A wiki link, `[[refund-limit]]`, already reached it.
  A key written in prose, `` `refund-limit` ``, is not read as a citation: a
  slug is not an identifier of a family, and reading every code span that
  looks like one would read code as citations
  ([ADR-0004](0004-reference-resolution.md),
  [ADR-0006](0006-false-positives-cost-more.md)).
- **Only rows of a table.** A specification a heading declares inside a
  register file has no cells to hold to a vocabulary, and is read as before.

## Consequences

A repository that configures no `registers` sees one change: a link to a
specification inside a file, by its id as the anchor, resolves where it was
reported broken. One that configures a register sees each row held to its
status, and its open rows counted where every run can read them.
