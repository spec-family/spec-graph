---
status: accepted
date: 2026-11-07
---

# ADR-0025: Commits are read from git

## Context

A checklist item ticked as done can name the commit that did it, and a
register row that is done names the commit that applied it:

```md
- [x] Refunds are held to the captured amount (commit "Refuse a refund over its capture").
```

Nothing checked that the commit exists. A subject reworded when a branch was
squashed, a commit never pushed, a hash copied from another repository: each
reads as evidence, and every tool passes.

spec-graph was a pure function of text with I/O at its edges: `glob.ts` walks,
`runner.ts` reads, `config.ts` loads configuration, and nothing starts a
process. [ADR-0020](0020-a-diff-names-what-it-can-tell-apart.md) kept git out
of `diff` on purpose: the diff compares two exports CI makes, and "process
control underneath a pipeline that is a pure function of text" was the thing
it declined. A commit's existence is not in any text the run reads. It is in
the history, and only git reads that.

## Decision

**A run reads the history of one ref, with git, when a document a check holds
to its commits names one, and fails a commit the history does not hold.**

<!-- @spec-edge kind="amends" to="ADR-0020" reason="git is read for the commits a document names; diff still compares exports" -->

- **Which words name a commit is spec-core's reading** (`findCommitReferences`,
  its ADR-0004): the word `commit`, then on its line a subject between quotes
  or a hash of 7 to 40 hexadecimal digits, never in code, a comment or front
  matter. The same reading serves every tool that holds a document to its
  commits.
- **Only documents a check holds to their commits** are read for them: a
  checklist and a ledger ([ADR-0026](0026-a-completion-cites-its-evidence.md)),
  and the registers a later ADR adds. A commit named anywhere else is prose,
  so a repository that configures none of them sees nothing change and runs
  no git.
- **`git.ts` is the edge**, the one module that starts a process: `git -C
  <root> rev-parse --is-shallow-repository`, `rev-parse --verify` of the ref,
  and one `log --format=%H%x1f%s <ref> --`. No shell; the root and the ref are
  arguments as they are. `history.ts` reads the log and answers whether a
  commit is in it, purely, so `analyseSources` takes a history as it takes
  sources, and a test writes one by hand.
- **Once, and only when needed.** `analyse` extracts every document first,
  and reads the history only if a checked document names a commit.
- **A subject is matched exactly; a hash as the start of an id.** A prefix
  two commits share names commits the history holds, so it is held: git would
  ask which, and neither is missing.
- **The ref is `gitRef`**, `HEAD` unless the configuration says otherwise,
  such as `origin/main` for a check that a commit was merged and not only
  made. One that opens with a dash is refused when the configuration is read,
  since git would read it as an option.
- **What cannot be looked for stops the run with exit 2**, never a pass: no
  git on `PATH`, a root in no repository, a ref the repository does not have,
  and a shallow clone, whose history holds only its newest commits, so that a
  commit missing from it may be in the repository's. `actions/checkout`
  clones one commit deep unless told `fetch-depth: 0`, and the message says
  so.
- **`unknown-commit`**, an error, is a commit named in a checked document that
  the history does not hold, at the words that name it.

## Consequences

The run that names no commit where a check looks is as it was, and runs no
process. One that does needs git and the whole history of its ref, which a CI
job gets with `fetch-depth: 0`. `diff` still compares two exports, as ADR-0020
decided; what changed is that a check may now ask git one question about the
tree it runs in.
