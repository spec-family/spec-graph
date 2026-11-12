# Registers: many specifications in one file

One file per decision is the MADR, KEP and RFC layout, and it is what most
repositories do. Plenty keep a register instead — one document holding dozens of
decisions. **A specification is a region of a file, not a file**, so both work:

```md
## ADR-0007: Shard the write path

**Status:** Superseded by ADR-0012

Shard by tenant id.
```

Each section with an identifier *and* a status - a `**Status:**` line or a
`### Status` section under its heading - becomes a
specification in its own right, with its own lifecycle, its own obligations and
its own relations — resolvable from anywhere in the corpus as `ADR-0007`,
whether it lives in a register or in its own file. Moving it out later breaks
no citation.

A register kept as a table works the same way, with relations typed by the column
header you wrote:

```md
| ID       | Title          | Status     | Depends on | Superseded by |
| :------- | :------------- | :--------- | :--------- | :------------ |
| ADR-0001 | Use one writer | Superseded | -          | ADR-0003      |
| ADR-0002 | Cache eviction | Accepted   | ADR-0001   | -             |
```

A relation cell is a list, split at `,`, `;` and `and`: identifiers, paths
and links, each as deliberate as front matter. A sentence there is prose,
not a list — `Finalization of ADR-032`, `Nothing — implementable now`. The
text between semicolons is a clause, and it is prose when any piece between
its commas is neither an identifier nor a word with a digit, a dot or a slash
in it, as a file's name or a path has. Prose relates the row to the
identifiers written in it, `ADR-032` there, or else to the document the
whole clause names, and is reported only where prose would be.

Findings point at the declaring cell, not at the file. A cell that is empty or
holds only a placeholder — `-`, `—`, `n/a`, `none`, `nil`, `TBD` — says nothing.
A status cell is read as a status line under a heading is, so
`Superseded by ADR-0003` there names the row's successor.

A row is named by its ID column, and a title is only a title:

- A row whose ID cell names nothing — empty, a placeholder, or a `?` nobody has
  numbered yet — is not a specification.
- An identifier a title opens with belongs to the document the row is *about* —
  an issue reading `| OI-V-05 | ADR-040's enforcement point has no browser test |`
  is filed under `OI-V-05`, and citations of `ADR-040` still reach `ADR-040`.

The same holds for a whole file, whose H1 is a name only when nothing else gave
one: see [References](references.md).

The register itself stays in the graph as the thing that holds them, so
`spec-graph query 'document[id=register] -contains-> document'` lists what is
inside it.

A register can be held to a status vocabulary of its own, and a row cited by
its key as an anchor, `[refund-limit](review.md#refund-limit)`:

```json
{
  "registers": {
    "files": ["docs/review.md"],
    "resolution": "Proposed resolution",
    "statuses": {
      "open": {},
      "proposed": { "needs": ["resolution"] },
      "done": { "closes": true, "needs": ["citation", "commit"] }
    }
  }
}
```

- A row's status is the word its status cell opens with, `done` of
  `done: the refund rules (commit "...")`. A word the configuration does not
  name is `unknown-register-status`.
- `needs` is what a status asks for: `resolution`, text in the column
  `resolution` names; `citation`, a reference in the status cell to what
  changed; `commit`, the commit that changed it, looked for in git
  ([commits](claims-and-evidence.md#commits-looked-for-in-git)). A row that lacks one is
  `incomplete-register-row`.
- A key given to two rows is `duplicate-key`, at the second.
- The rows still open, every status without `closes`, are counted per
  register in the report, listed under `--verbose`, and in JSON as
  `registers`.
- A link to a register with a row's key as the anchor reaches the row, in any
  register, configured or not; a key written in prose is no citation. See
  [ADR-0027](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0027-a-register-row-is-held-to-its-status.md).

Both forms need **two** signals, and that is deliberate: `## Q3 2026 Roadmap`
parses as family `Q`, number 3, and `## v1.2.0` in a changelog parses as family
`v`, number 1. Neither declares a status, so neither is a specification. A table
of identifiers and prose is a citation list, not a register. See
[ADR-0009](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0009-a-specification-is-a-region.md).
