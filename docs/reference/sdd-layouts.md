# Spec Kit, OpenSpec and Kiro

The layouts spec-driven-development tools write are read as they are, with
no configuration:

- **Spec Kit.** Each file of `specs/<NNN-feature>/` - `spec.md`, `plan.md`,
  `tasks.md`, `research.md`, `data-model.md`, `quickstart.md`, and each one
  under `checklists/` and `contracts/` - is a document of its own, named by its
  path, `specs/001-login/spec`, so a link from one feature to another is a
  link. `**Status**: Draft` in the header block is the status, and the
  checkboxes of `tasks.md` are that feature's open work.
  `.specify/memory/constitution.md` is read too.
- **OpenSpec.** `openspec/specs/<capability>/spec.md` and each file of
  `openspec/changes/<change>/`, the change's own `specs/` included, are
  documents of their own. A change under `openspec/changes/archive/` is a
  record: its unticked tasks are what was left, and citing it is normal.
- **Kiro.** Each of `.kiro/specs/<feature>/requirements.md`, `design.md` and
  `tasks.md`.

Their agents' instructions are orientation documents, held to the paths and
commands they name once named:

```json
{ "orientation": { "files": ["CLAUDE.md", "AGENTS.md", ".kiro/steering/*.md"], "extensions": [".md", ".ts"] } }
```

See [ADR-0031](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0031-sdd-layouts-are-read-as-written.md).
