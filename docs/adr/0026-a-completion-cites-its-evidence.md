---
status: accepted
date: 2026-11-07
---

# ADR-0026: A completion cites its evidence

## Context

A roadmap's checkbox is read as satisfied whatever stands behind it
([ADR-0003](0003-item-state-signals.md)), so a box can be ticked, and a phase
reported as nearly done, with nothing behind it. A status ledger can say a
feature is implemented while the claims it summarises are still `Specified`.
Both say more than the documents they summarise, and every tool passes.

With claims in the graph, open or closed by their labels
([ADR-0024](0024-a-claims-label-is-its-state.md)), and commits looked for in
git ([ADR-0025](0025-commits-are-read-from-git.md)), what a done item cites
can be held to what it says.

## Decision

**In a checklist, an item marked done cites a claim or names a commit. In a
checklist or a status ledger, an item marked done cites no claim whose label
leaves work open.**

```json
{ "checklists": ["ROADMAP.md"], "ledgers": ["docs/STATUS.md"] }
```

<!-- @spec-edge kind="depends-on" to="ADR-0024" reason="a cited claim is open or closed by its label" -->

- **Done is `satisfied`**, by any signal: `[x]`, `Done:`, a status cell that
  reads `done` or `Implemented`. An item rejected, obviated or accepted as
  debt is closed without saying anything was built, and is held to nothing.
- **`unevidenced-completion`**, an error: an item a checklist marks done that
  cites no claim and names no commit. A claim is cited by a link that reaches
  it, `[refund limits](spec/refunds.md#refund-limit)`; a commit is named as
  `commit "Subject"` or `commit 1a2b3c4`. A test is not cited from here: it is
  named under the claim it shows, where spec-guard holds it, and the item
  cites the claim.
- **`premature-completion`**, an error: an item marked done, in a checklist
  or a ledger, that cites a claim not `satisfied`, with each such claim as a
  related location. A claim lowered after the box was ticked is found the
  same way, at the head, since the label is read where it stands. One defect
  is one finding: an item that cites a claim still open is premature and not
  also unevidenced, and one that names a commit the history does not hold is
  `unknown-commit`'s.
- **A ledger's row is an item.** In a table with a status column, as a
  register's is, that is no register, each row whose status cell reads as a
  state by its first word, a `state=` word or a marker, is an item: open or
  closed by that word, its links its own. A row whose status says no state,
  `planned` or `n/a`, says nothing of how far it holds and is no item. A row
  that cites no claim is not held: a ledger may say what no claim covers.
- **A claim is not held here.** It answers for its own evidence to
  spec-guard.

## Not this round

- **A generated region of label totals** in a ledger, checked for staleness
  like a snapshot. Totals are in the report and JSON of spec-guard's
  `claims`, and a count written into a document is one more thing to go
  stale.
- **`state-conflict` for a ticked item citing an open claim.** That rule
  means one item's own signals disagree, and defaults to `warn`; a done item
  citing an open claim is a defect in what the item says, and fails as an
  error whatever `--strict` says.

## Consequences

A repository that names no `checklists` or `ledgers` sees nothing change. One
that does sees every done item held to what it cites, and its ledgers' rows
read as items, counted among its obligations where their status leaves work
open.
