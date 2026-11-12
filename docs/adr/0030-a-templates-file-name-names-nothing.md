---
status: accepted
date: 2026-11-08
---

# ADR-0030: A template's file name names nothing

## Context

A document is named by a declaration, then by its file name, then by its
title ([ADR-0004](0004-reference-resolution.md)). The file name works where
every document has its own: `docs/adr/0007-sharding.md` is ADR-0007, and
`sharding.md` is `sharding`.

The layouts spec-driven-development tools write give every document of a
kind the same file name and tell them apart by their directory:

```text
specs/001-login/spec.md              Spec Kit
specs/001-login/plan.md
specs/002-audit/spec.md
openspec/specs/auth/spec.md          OpenSpec
openspec/changes/add-mfa/tasks.md
.kiro/specs/user-auth/design.md      Kiro
```

Run over such a repository on 2026-11-08, 0.23.1 named both features' specs
`spec`. The second was a duplicate document id and left out of the graph,
and a link from `specs/002-audit/spec.md` to `../001-login/spec.md`, which
resolved by its path to the id the first had taken, was reported as a
`self-reference`: the document it named was in no finding at all, and the one
that named it was told it depended on itself. That is a false positive and a
miss in one ([ADR-0006](0006-false-positives-cost-more.md)).

A README already took its directory's name: `docs/adr/0007-sharding/README.md`
is ADR-0007, and a KEP's `keps/sig-auth/1234-token-rotation/README.md` is
KEP-1234. The directory alone cannot name the rest: `spec.md`, `plan.md` and
`tasks.md` of one feature share it. Nor can the directory and the name
together: OpenSpec's change writes its own `specs/auth/spec.md` beside the
capability's, and Spec Kit writes `checklists/requirements.md` in every
feature.

## Decision

**A file name a template gives every document of its kind names none of
them: such a file is named by its path, less the extension.**
`specs/001-login/spec.md` is `specs/001-login/spec`.

- **The names are a table**, `TEMPLATE_NAMES` in `src/identity.ts`: `spec`,
  `specification`, `plan`, `tasks`, `design`, `proposal`, `requirements`,
  `research`, `data-model` and `quickstart`, in any case. They are the names
  Spec Kit, OpenSpec and Kiro write. A layout that adds one is a line there.
- **Only where nothing else names the file.** A declared id and a number in
  the file name or its directory still name it, as ADR-0004 ranks them. An
  identifier a title opens with did too, until the amendment below. A README and an index keep their directory's
  name.
- **Always, not only where two collide.** A path named only once a second
  feature arrived would rename the first feature's documents on that day, and
  every baseline entry keyed on the old name with them
  ([ADR-0012](0012-a-baseline-is-a-ratchet.md)).
- **The name still reaches it.** A file answers to its path, its path less the
  extension and its name, as before, so a link and a `[[design]]` that bound
  to it still do, and a name two files answer to is ambiguous, as any is.
- **At the root**, `plan.md`'s path is its name, and it is `plan`, as it was.

*Amended 2026-11-08.* **A file directly in a directory a template fills
is named by its path too.** Spec Kit writes `specs/<feature>/checklists/`
and `contracts/` for each feature, with files named for what each holds,
`ux.md` or `albums-api.md`, in every feature alike: two features with a
UX checklist were one id, and the later left the graph. The directories are
a table beside the names, `TEMPLATE_DIRECTORIES` in `src/identity.ts`:
`checklists` and `contracts`, in any case, holding the file directly. A
declaration, a number and a title's identifier still name such a file, as
above.

*Amended 2026-11-12.* **A title names no file a template named.** The
template writes the title as well as the name: Spec Kit's `research.md`
opens with `# Phase 0 Research` in every feature, so the identifier the
title opened with was the same in each, PHASE-0, and every feature after
the first left the graph, three of four `research.md` on one repository.
A declared id and a number in the file name or its directory still name
such a file; its title does not, whatever identifier it opens with.

## Consequences

Each feature of a Spec Kit, OpenSpec or Kiro repository is its own document,
and a link between two is a link. A repository whose lone `docs/design.md` was
`design` sees it named `docs/design`, in findings, exports and a baseline's
entries. A baseline recorded before keys that document's findings on the old
name, so they read as new and its entries as no longer occurring: record it
again once.

Grouping a feature's documents into one, so that its `tasks.md` holds the
open work of its `spec.md`, is not decided here.
