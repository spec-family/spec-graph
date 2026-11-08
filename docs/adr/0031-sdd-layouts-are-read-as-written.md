---
status: accepted
date: 2026-11-08
---

# ADR-0031: Spec-driven-development layouts are read as written

## Context

Spec-driven-development tools write their specifications into layouts of
their own, and their users rarely write a configuration for a linter before
they have seen what it says:

```text
specs/001-login/spec.md, plan.md, tasks.md     Spec Kit
.specify/memory/constitution.md
openspec/specs/auth/spec.md                    OpenSpec
openspec/changes/add-mfa/proposal.md, tasks.md
openspec/changes/archive/2026-10-01-add-login/
.kiro/specs/user-auth/requirements.md          Kiro
```

Run over samples of each on 2026-11-08, spec-graph read Spec Kit's `specs/`
and nothing of OpenSpec's, Kiro's or Spec Kit's `.specify/memory/` without a
pattern naming them. Given one, it named every feature's spec `spec`, which
[ADR-0030](0030-a-templates-file-name-names-nothing.md) settled, and two more
things were wrong:

- **An applied OpenSpec change was retired.** OpenSpec moves a change it has
  applied to `openspec/changes/archive/<date>-<change>/`, and an `archive/`
  directory retires what it holds ([ADR-0002](0002-lifecycle-lattice.md)), so
  a task left unticked there was an `orphaned-obligation`. A change applied is
  what was done, as a brief spec-brief archives is: its unticked boxes are
  nobody's work, and a capability's spec citing the change that made it is
  normal ([ADR-0011](0011-a-record-is-not-a-specification.md)).
- **Two features' checklists were one id.** Spec Kit writes
  `checklists/ux.md` in each feature that has one.

## Decision

**The layouts Spec Kit, OpenSpec and Kiro write are read with no
configuration, and read as their tools mean them.**

- **The patterns read when none are given** add `.specify/memory/*.md`,
  `openspec/**/*.md` and `.kiro/specs/**/*.md` to those that already read
  `specs/`. A template under `.specify/templates/`, an agent's steering under
  `.kiro/steering/` and `openspec/config.yaml` are not read: a template's
  placeholders are not a specification, and steering is an orientation
  document ([ADR-0029](0029-an-orientation-document-names-what-exists.md)),
  read once named there.
- **A directory that holds a layout's records**, by the directory it sits
  in, makes what is under it a record: `archive` directly inside `changes`,
  the table `RECORD_DIRECTORIES` in `src/lifecycle.ts`. It is read before the
  directories that retire, whose `archive` it also is, so `docs/adr/archive/`
  still retires. A status a document declares still decides, as it does over
  a retiring directory.
- **A file directly in `checklists/` or `contracts/` is named by its path**,
  as ADR-0030's amendment of the same day records.
- **Nothing is grouped.** Each file of a feature is a document of its own,
  and a link between two is a link.

## Not this round

- **A feature as one document.** Spec Kit's `tasks.md` is the open work of
  its `spec.md`, and Kiro's and OpenSpec's alike, but each file is a document
  here: a feature whose spec is superseded while its tasks stay open is not
  an `orphaned-obligation`, because the tasks are in another document with no
  status. Grouping a feature's files would change what a document is, which
  ids a feature's files answer to and what a finding names as the place to
  fix. The maintainer chose, on 2026-11-08, to build it in a later round,
  behind a configuration switch that is off by default: from the first
  release after round 27, JSON fields and exit codes stay unchanged for two
  minors, and a new behaviour ships opt-in first (spec-core's
  [ADR-0009](https://github.com/spec-family/spec-core/blob/main/docs/adr/0009-versions-before-1-0.md),
  amended in round 27).
- **A repository's own template names.** A name a layout gives every
  document that is not in the table, and that two files share, is still a
  duplicate document id, and the later file is left out of the graph. A key
  that adds names to the table waits for a repository that needs one. No id
  is decided by which other files the corpus holds: one that moved when a
  second file of the same name was added would read, in a diff and against a
  baseline, as a document removed and another added, by a change that touched
  neither ([ADR-0006](0006-false-positives-cost-more.md)).

## Consequences

A repository of any of the three layouts gets its graph with no
configuration. A run with no patterns over a repository that keeps one of
those directories for something else reads it too, and a finding there is
new; a pattern of its own leaves that run as it was.
