---
status: accepted
date: 2026-11-08
---

# ADR-0029: An orientation document names what exists

## Context

Some documents orient a reader rather than decide anything: an agent's
switchboard, `CLAUDE.md`, or a brief handed to the next session. They name
files, directories and commits:

```md
Start from `src/refunds/limits.ts`; the rules are in `refunds.md`, and the
tooling plan is `docs/tooling-plan.md`. The limit landed in commit "Refuse a
refund over its capture".
```

Agents write these documents too, and they name things that do not exist: a
plan named before it was written, a file renamed since, a commit subject
remembered wrongly. Nothing checked them. A link to a missing document is a
`broken-reference`, but these names are code spans, which spec-graph reads as
code and never as citations ([ADR-0004](0004-reference-resolution.md)), and a
link to a source file is spec-guard's to check, not spec-graph's.

The same documents backtick commands, `npm run lint`, error codes, `E0310`,
and code, `.to<U>()`, none of which name a path, and reading them as paths
would be the false positive [ADR-0006](0006-false-positives-cost-more.md)
exists to prevent.

## Decision

**In a document `orientation` names, a code span that reads as a repository
path names a file or a directory the repository holds, unless the document
marks it as created by its work or as another repository's, and a commit it
names is in the history.**

```json
{ "orientation": { "files": ["CLAUDE.md", "docs/*-brief.md"], "extensions": [".md", ".ts"], "roots": ["spec"] } }
```

<!-- @spec-edge kind="depends-on" to="ADR-0025" reason="a commit an orientation document names is looked for in git" -->

- **A path is a token that reads as one**: a code span of letters, digits
  and `. _ - / + @ ~` alone, with a letter, holding a `/` or ending in one of
  `extensions`, and not opening with `-`, `@` or `~` (an option, a package
  scope, a home directory). A space, a scheme, a glob character or a bracket
  makes no path, so a command, an error code and code are passed over. An
  `#anchor` or a `:42` after it names a place in it and is left off.
- **Where it is looked for**: from the document's directory, from the
  repository root, and, for a bare file name, under each of `roots`, since
  a document names a specification by its file name alone. A path that
  leaves the repository is held by none. A file and a directory alike hold.
- **`missing-path`**, an error, at the code span: a path found under none of
  them.
- **Marked, never guessed.** `<!-- @spec-path created="docs/tooling-plan.md" -->`
  says the document's work creates the path, and `external="dist/cli.js"`
  that it is another repository's; each takes a list. The mark is written in
  the document that names the path, so it goes when the document is next
  rewritten, and it renders as nothing.
- **A commit it names**, `commit "Subject"` or `commit 1a2b3c4`, is looked
  for in git as a checklist's is ([ADR-0025](0025-commits-are-read-from-git.md)),
  `unknown-commit` where it is not there.
- **Read where the repository is**: `analyse` looks with the files it can
  see; `analyseSources`, given no way to look, refuses to run where an
  orientation document names a path.

## Not this round

- **A mapping table held to fields in other documents**, such as a table of
  modules against each specification's `Governs:` line. That is a
  repository's own rule ([ADR-0016](0016-a-query-needs-a-sentence.md)).

## Consequences

A repository that configures no `orientation` sees nothing change. One that
does sees each path and commit its orienting documents name held to the
repository, and marks in those documents what is planned or elsewhere.
