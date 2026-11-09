# spec-graph reference

Everything spec-graph reads, checks, takes and writes, a topic to a page. The
[README](../../README.md) is the front page. How to start, how to adopt the
family on a repository that has a history, and the terms the spec-* tools
share are spec-core's guides: the
[tutorial](https://github.com/spec-family/spec-core/blob/main/docs/tutorial.md),
[adopting](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md)
and the [glossary](https://github.com/spec-family/spec-core/blob/main/docs/concepts.md).

Where these pages write the command alone, as in `spec-graph query ...`, it is
what a `package.json` script holds - npm fetches nothing for a script - and
what follows `npx --no-install @spec-family/` at a prompt. The README's
[Names](../../README.md#names) says why the full name.

## What it checks

- [Rules](rules.md): every rule, its default severity and the decision behind
  it; overriding one with `--rule`, and what `--strict` raises.

## How it reads your documents

- [Lifecycle, normalised](lifecycle.md): every status word, where a status is
  looked for, and the four phases it is read as.
- [Obligations, with real state](obligations.md): checkboxes, markers and the
  headings that hold open work, and the seven dispositions.
- [References, resolved forgivingly and validated strictly](references.md):
  what reaches a document, what is never a citation, how a document is named,
  wiki links, and a gap that is deliberate.
- [Relations](relations.md): front-matter keys, the phrases beside a link, and
  which relations carry weight.
- [Registers: many specifications in one file](registers.md): a section or a
  row as a specification, and a register held to its statuses.
- [Spec Kit, OpenSpec and Kiro](sdd-layouts.md): the layouts read with no
  configuration.
- [Claims and their evidence](claims-and-evidence.md): claims, checklists,
  ledgers, measurement protocols, figures and the commits they name.
- [Orientation documents, naming what exists](orientation.md): the paths and
  commands an agent's instructions name, held to the repository.
- [Directives](directives.md): the comments that override any inference.
- [Journals, changelogs and minutes](journals.md): files that log decisions
  rather than make them.

## Using it

- [The query language](query-language.md): the grammar the rules are written
  in, and a rule of your own.
- [Adopting this on a repository that predates it](baseline.md): a baseline,
  and the ratchet.
- [Configuration](configuration.md): the file, every key, patterns and family
  rules.
- [CLI](cli.md): the commands, every option, exit codes, what is refused,
  colour and glyphs, and the graph export.
- [In CI](ci.md): SARIF, annotations, GitLab Code Quality, a summary for
  reviewers, JSON, and what a pull request changed.
- [Programmatic API](api.md): the package as a library.

## Decisions

Thirty-one ADRs, which `spec-graph` validates on every CI run:

- [ADR-0001 — A hand-written Markdown scanner](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0001-hand-written-markdown-scanner.md)
- [ADR-0002 — A four-phase lifecycle lattice](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0002-lifecycle-lattice.md)
- [ADR-0003 — Item state is resolved from competing signals](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0003-item-state-signals.md)
- [ADR-0004 — Reference resolution is deliberately asymmetric](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0004-reference-resolution.md)
- [ADR-0005 — The rules and the query language share one engine](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0005-rules-are-queries.md)
- [ADR-0006 — False positives cost more than misses](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0006-false-positives-cost-more.md)
- [ADR-0007 — Mutation testing, and what the score actually means](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0007-mutation-testing.md)
- [ADR-0008 — A wiki link carries a name, not a path](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0008-wiki-links-carry-no-path.md)
- [ADR-0009 — A specification is a region of a file, not a file](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0009-a-specification-is-a-region.md)
- [ADR-0010 — Configuration belongs to the repository](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0010-configuration-belongs-to-the-repository.md)
- [ADR-0011 — A historical record is not a specification](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0011-a-record-is-not-a-specification.md)
- [ADR-0012 — A baseline is a ratchet, keyed on identity](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0012-a-baseline-is-a-ratchet.md)
- [ADR-0013 — When the scanner is unsure, it hands back prose](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0013-the-scanner-hands-back-prose.md)
- [ADR-0014 — A relation is spelled in both directions](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0014-a-relation-is-spelled-both-ways.md)
- [ADR-0015 — Feedback goes where the tools already look](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0015-feedback-goes-where-the-tools-already-look.md)
- [ADR-0016 — A query needs a sentence before it is a rule](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0016-a-query-needs-a-sentence.md)
- [ADR-0017 — A predicate must finish](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0017-a-predicate-must-finish.md)
- [ADR-0018 — The configuration file is the root](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0018-the-configuration-file-is-the-root.md)
- [ADR-0019 — The sweep runs in shards](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0019-the-sweep-runs-in-shards.md)
- [ADR-0020 — A diff names only what it can tell apart](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0020-a-diff-names-what-it-can-tell-apart.md)
- [ADR-0021 — Releases are published by CI, with provenance](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0021-releases-are-published-by-ci.md)
- [ADR-0022 — Globs are the family's path dialect](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0022-globs-are-the-family-path-dialect.md)
- [ADR-0023 — The scanner is the family's](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0023-the-scanner-is-the-familys.md)
- [ADR-0024 — A claim's label is its state](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0024-a-claims-label-is-its-state.md)
- [ADR-0025 — Commits are read from git](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0025-commits-are-read-from-git.md)
- [ADR-0026 — A completion cites its evidence](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0026-a-completion-cites-its-evidence.md)
- [ADR-0027 — A register row is held to its status](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0027-a-register-row-is-held-to-its-status.md)
- [ADR-0028 — A figure rests on a record](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0028-a-figure-rests-on-a-record.md)
- [ADR-0029 — An orientation document names what exists](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0029-an-orientation-document-names-what-exists.md)
- [ADR-0030 — A template's file name names nothing](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0030-a-templates-file-name-names-nothing.md)
- [ADR-0031 — Spec-driven-development layouts are read as written](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0031-sdd-layouts-are-read-as-written.md)
