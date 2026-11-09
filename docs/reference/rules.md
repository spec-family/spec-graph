# Rules

Every rule spec-graph checks, the severity it has unless told otherwise, and
the decision record that says why it exists. `spec-graph rules --explain`
prints the same pointer beside the selector each rule is.

| Rule | Default | What it catches | Decision |
| --- | --- | --- | --- |
| `ghost-handover` | error | An open obligation handed to a document that can no longer absorb it | [ADR-0002](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0002-lifecycle-lattice.md) |
| `stale-premise` | error | A live document resting on a decision that was retired or obviated | [ADR-0002](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0002-lifecycle-lattice.md) |
| `broken-reference` | error | A citation naming a document or anchor that does not exist | [ADR-0004](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0004-reference-resolution.md) |
| `circular-delegation` | error | Obligations in a cycle, so none can ever land, or supersessions in a cycle - not a loop that takes one of each to close, such as a superseded document handing its question to what replaced it | [ADR-0005](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0005-rules-are-queries.md) |
| `orphaned-obligation` | error | A retired or frozen document still holding open work - not a question it delegated to a document still taking work | [ADR-0003](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0003-item-state-signals.md) |
| `live-supersession` | error | A superseded document still presenting itself as current | [ADR-0002](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0002-lifecycle-lattice.md) |
| `reference-outside-corpus` | warn | A citation naming a real document the include patterns did not reach | [ADR-0004](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0004-reference-resolution.md) |
| `ambiguous-reference` | warn | A citation matching more than one document | [ADR-0004](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0004-reference-resolution.md) |
| `unreciprocated-supersession` | warn | A retired document that never says what replaced it | [ADR-0006](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0006-false-positives-cost-more.md) |
| `state-conflict` | warn | An item whose two state signals disagree about whether work remains | [ADR-0003](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0003-item-state-signals.md) |
| `unknown-relation-key` | warn | A front-matter key one edit from a relation, carrying what looks like a citation | [ADR-0014](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0014-a-relation-is-spelled-both-ways.md) |
| `self-reference` | info | A document delegating to, or depending on, itself | [ADR-0006](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0006-false-positives-cost-more.md) |
| `unevidenced-completion` | error | An item a checklist marks done that cites no claim and names no commit, where `checklists` is configured | [ADR-0026](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0026-a-completion-cites-its-evidence.md) |
| `premature-completion` | error | An item marked done that cites a claim whose label leaves work open, where `checklists` or `ledgers` is configured | [ADR-0026](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0026-a-completion-cites-its-evidence.md) |
| `unknown-commit` | error | A checklist, a ledger or a register naming a commit the history of its ref does not hold | [ADR-0025](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0025-commits-are-read-from-git.md) |
| `duplicate-key` | error | A key a configured register gives to a second row, which the graph leaves out | [ADR-0027](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0027-a-register-row-is-held-to-its-status.md) |
| `unknown-register-status` | error | A row of a configured register with no status, or one the configuration does not know | [ADR-0027](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0027-a-register-row-is-held-to-its-status.md) |
| `incomplete-register-row` | error | A row of a configured register that lacks what its status asks for | [ADR-0027](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0027-a-register-row-is-held-to-its-status.md) |
| `incomplete-protocol` | error | A measurement protocol that lacks a field the configuration asks of it | [ADR-0028](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0028-a-figure-rests-on-a-record.md) |
| `undated-result` | error | A measurement protocol whose result names no date and does not say none yet | [ADR-0028](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0028-a-figure-rests-on-a-record.md) |
| `target-without-protocol` | error | A claim whose label asks for a measurement and cites no protocol | [ADR-0028](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0028-a-figure-rests-on-a-record.md) |
| `unrecorded-figure` | error | A figure marked `@spec-figure` that names no record, or one with no dated result | [ADR-0028](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0028-a-figure-rests-on-a-record.md) |
| `missing-path` | error | A path an orientation document names in a code span that the repository does not hold | [ADR-0029](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0029-an-orientation-document-names-what-exists.md) |
| `missing-command` | error | A script, target or recipe an orientation document runs in a code span that its `package.json`, Makefile or justfile does not declare | [ADR-0029](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0029-an-orientation-document-names-what-exists.md) |

Override any of them:

```bash
spec-graph --rule self-reference=off --rule state-conflict=error
```

Once a repository is clean, `--strict` raises every warning to an error so the
build stops tolerating them:

```bash
spec-graph --strict
```

```text
✖ docs/adr/0001-single-writer.md:2:9  unreciprocated-supersession (strict: warn -> error)
    ADR-0001 is retired but never says that ADR-0002 replaced it
    ↳ docs/adr/0002-multi-writer.md:3:13  only ADR-0002 records the relationship
    → add "superseded-by: ADR-0002" to docs/adr/0001-single-writer.md so a reader who lands there is redirected

2 errors · 20.73ms · 2 raised by --strict
```

Every escalated finding says so, so you can always tell what the build would do
without the flag. Two deliberate limits:

- Strict leaves `info` rules alone. Those are advisory by design, and promoting
  them would reintroduce exactly the noise the defaults avoid.
- An explicit `--rule` always wins, so `--strict --rule state-conflict=warn`
  turns strict on and exempts one rule rather than making you choose between
  all of it and none.
