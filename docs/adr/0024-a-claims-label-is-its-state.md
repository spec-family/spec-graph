---
status: accepted
date: 2026-11-07
---

# ADR-0024: A claim's label is its state

## Context

A specification can mark each thing it says with how far it holds:

```md
- `Implemented`: a refund over the captured amount is refused.
- `Specified`: a partial refund carries a reason.
- `Hypothesis`: retries cut failed captures. Criterion: the failure rate.
```

spec-guard holds each such claim to its evidence: a label that asks for a test
fails where no directive under the claim names one that can fail (spec-guard's
ADR-0020). What it cannot see is the other direction. A roadmap item ticked as
done, or a status ledger's row that says a feature is implemented, can cite a
claim that is still `Specified`, and every tool passes. The documents that
summarise claims say more than the claims do.

Holding them to it needs the claims in the graph: the checklist item and the
ledger row are already items and documents here, and a link from one to a
claim is already a reference. spec-graph read none of it. A bullet in a
specification is no obligation unless it has a checkbox, a directive or an
obligation heading over it (ADR-0003), so a claim was an item only when
someone had written `@spec-item` above it, and then an open one, whatever its
label said.

## Decision

**A claim is an item whose state is its label. `claims` in the configuration
names the documents that hold claims and what each label means for work.**

```json
{
  "claims": {
    "files": ["spec/*.md"],
    "labels": { "Implemented": "done", "Specified": "open", "Target": "open", "Hypothesis": "open" }
  }
}
```

<!-- @spec-edge kind="depends-on" to="ADR-0003" reason="a label is one more state signal, ranked with the others" -->

- **Which item is a claim is spec-core's reading** (`findClaims`, its
  ADR-0004): a list item whose text opens with a label as a code span, after a
  checkbox where there is one, exact in case. It is the reading spec-guard
  holds a claim's evidence by, so the two tools never disagree about which
  item says what. Prose, emphasis or a span the vocabulary lacks makes no
  claim.
- **What a label means is a `state=` word**, the vocabulary `@spec-item`
  takes: `done` and `satisfied` close a claim, `open` and `todo` leave it
  open, and so on. spec-graph does not decide that `Specified` is work left;
  the repository does, in the words it already uses for an item's state. A
  label given a word that names no state, a label with space around it, or a
  `claims` missing either part stops the run with exit 2 before anything is
  read.
- **The label is a state signal, ranked under a directive and over every
  other.** It is the author's statement of how far the claim holds, more
  specific than a marker in its prose or a checkbox before it, and a
  `@spec-item state=` written over it still wins, as a directive always does.
  A signal that disagrees about openness is a conflict, as it is for any item:
  `` - [x] `Specified`: ... `` is a `state-conflict`.
- **Every claim is an item**, named by its section and position like any
  other, or by `@spec-item id`, which is how another document cites it:
  `[refund limits](spec/refunds.md#refund-limit)` reaches the claim
  `<!-- @spec-item id="refund-limit" -->` names.
- **`[label]` in a selector** answers a claim's label, and nothing for an item
  that is no claim: `spec-graph query 'item[label=Specified]'`. The graph
  export and a query's JSON give a claim its `label`, and an item that is no
  claim none, so an export of a repository without claims is as it was.
- **`claims.files` that match no file the run reads stop the run** with exit
  2: a claim in a document the patterns leave out is no item, and a checklist
  citing it would read as citing nothing. Nothing measured is not clean.

## Not this round

- **Holding a ticked item or a ledger row to the claims it cites** is the
  next ADR's, built on this one.
- **A label raised between two refs.** `diff` (ADR-0020) compares two
  exports, and the export carries each claim's label now, so a later round
  can list what was raised.
- **An `assumes` edge from a claim to the claims it rests on**, which waits
  for a repository that writes one.

## Consequences

A repository that names no `claims` sees nothing change: no bullet becomes an
item, no export gains a field. One that does sees every claim as an item, open
or closed by its label, counted among the open obligations where its label
leaves it open, and selectable by label.
