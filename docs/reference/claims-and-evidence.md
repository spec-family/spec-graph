# Claims and their evidence

What a specification says is done, and what stands behind it: claims and
their labels, checklists and ledgers, measurement protocols and the figures
that rest on them, and the commits they name. Each is read only where the
configuration names the files that hold it.

## Claims, with their labels

A specification can mark each thing it says with how far it holds, and
`claims` in the configuration makes each such claim an item whose state is
its label:

```md
- `Implemented`: a refund over the captured amount is refused.
- `Specified`: a partial refund carries a reason.
```

```json
{
  "claims": {
    "files": ["spec/*.md"],
    "labels": { "Implemented": "done", "Specified": "open", "Target": "open", "Hypothesis": "open" }
  }
}
```

- A claim is a list item whose text opens with a label as a code span, after
  a checkbox where there is one, exact in case: the reading spec-guard holds
  a claim to its evidence by.
- What a label means is a `state=` word, as `@spec-item` takes one, so the
  repository says which labels leave work open. A word that names no state
  stops the run with exit `2`.
- The label outranks every other signal but a directive, and a checkbox or
  marker that disagrees with it about whether work remains is a
  `state-conflict`.
- `<!-- @spec-item id="refund-limit" -->` names a claim, and
  `[refund limits](spec/refunds.md#refund-limit)` cites it.
- `item[label=Specified]` selects claims by label, and the graph export and a
  query's JSON give each claim its `label`.
- `claims.files` that match no file the run reads stop the run with exit `2`.

See [ADR-0024](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0024-a-claims-label-is-its-state.md).

## Checklists and ledgers, held to what they cite

A ticked box is read as done whatever stands behind it, and a ledger can say a
feature is implemented while its claims are still `Specified`. Name them, and
what a done item cites is held to what it says:

```json
{ "checklists": ["ROADMAP.md"], "ledgers": ["docs/STATUS.md"] }
```

```md
- [x] Refunds are held to the capture ([refund limits](spec/refunds.md#refund-limit)).
- [x] Partial refunds (commit "Refund part of a capture").
- [x] Retries.
```

- In a checklist, an item marked done cites a claim, by a link that reaches
  it, or names a commit; the third item above is `unevidenced-completion`.
- In a checklist or a ledger, an item marked done may not cite a claim its
  label leaves open: `premature-completion`, which also finds a claim lowered
  after its box was ticked.
- A ledger's table with a status column, as a register's, is read row by row:
  a row whose status cell reads as a state, `done`, `Implemented`,
  `in progress`, is an item, and its links are its own. A row that cites no
  claim is not held.
- Done is `satisfied`; an item rejected, obviated or accepted as debt is held
  to nothing.

See [ADR-0026](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0026-a-completion-cites-its-evidence.md).

## Figures, resting on a record

A figure says how it was measured only if something links it to the
measurement. Name where protocols are written, and what each must say:

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

```md
## Measurement protocols

### Refund latency

- **Method**: 1,000 refunds after 100 warm-up runs; the median.
- **Last result** (2026-11-05): a median of 4 ms.
```

- Each section one level under `heading` is a protocol, its fields the lines
  written as `**Name**: value`. It is an item, named by its heading's anchor,
  closed by a result that names an ISO date and open while it says none yet.
- A protocol that lacks the result or a field `fields` asks of it, under `*`
  for every protocol or under its anchor, is `incomplete-protocol`; a result
  with no date that does not say none yet is `undated-result`.
- A claim whose label `claims` lists cites a protocol, or is
  `target-without-protocol`.
- A figure is marked, never found: `<!-- @spec-figure record="ROADMAP.md#refund-latency" -->`
  before it names its record, and `unrecorded-figure` fails one with no
  record, a record that is no protocol, or a protocol with no dated result.
  A number nobody marked is not read.

See [ADR-0028](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0028-a-figure-rests-on-a-record.md).

## Commits, looked for in git

A commit a checklist, a ledger, a register or an orientation document names,
`commit "Subject"` or `commit 1a2b3c4`, must be in the history of `gitRef`, `HEAD` unless set:
`unknown-commit` otherwise. A subject is matched as written, a hash as the
start of an id.

- git runs only when a checked document names a commit, once, and nowhere
  else: `git.ts` is the one place a run starts a process.
- No git, no repository, a ref the repository lacks, or a shallow clone stops
  the run with exit `2`. A shallow clone holds only its newest commits, and
  `actions/checkout` makes one unless given `fetch-depth: 0`.
- `"gitRef": "origin/main"` asks that a commit was merged, not only made. A
  ref that opens with `-` is refused.

See [ADR-0025](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0025-commits-are-read-from-git.md).
