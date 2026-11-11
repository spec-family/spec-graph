# Lifecycle, normalised

Every ecosystem invented its own status vocabulary. `spec-graph` maps all of them
onto four phases, chosen so one question can be answered from the phase alone:
**can this document still absorb new work?**

| Phase | Recognised from | Absorbs work? |
| --- | --- | --- |
| `draft` | `proposed`, `provisional`, `wip`, `in-review`, `experimental`, … | yes |
| `active` | `accepted`, `implementable`, `implemented`, `merged`, `adopted`, … | yes |
| `frozen` | `final`, `ratified`, `locked`, `published`, … | **no** |
| `retired` | `superseded`, `deprecated`, `rejected`, `withdrawn`, … | **no** |

The status is found wherever your team writes it, and however it is dressed
(`**Accepted** (2026-03-01) ✅`). A document may be written in any language; its
status is read in English (`status: superseded`):

- front matter: `status:`, `state:`, `stage:`
- a `## Status` section
- a `| Status | Accepted |` table at the top
- a `Status: Draft` or `**Status**: Draft` line under the title, as spec-guard
  reads one
- a `docs/adr/archive/` directory

`Accepted, later superseded by ADR-0009` is retired: retirement is terminal, so
a retirement word anywhere wins.

Front matter is read as YAML reads it, and a value YAML would not read -
`status: Superseded by ADR-9: see notes`, where a plain value cannot hold `: ` -
is left out rather than guessed at. Every run says how many statuses, ids and
relations it left out that way, and `--verbose` says where and why: quote the
value and it is read.

<details>
<summary>Every status word, and where a status is looked for</summary>

A word counts whole and in any case, once emphasis, links, HTML, emoji and dates
are stripped, so `Unapproved` is not `approved`. A hyphenated word matches
spaced, or joined by an underscore, as well: `signed-off` reads `Signed off` and
`signed_off`. A status holding words from two rows takes the higher row, except
that `provisionally accepted` is a draft, and so are `to be decided`,
`not decided` and `not yet decided`, and the same of `settled` and `resolved`:
the question is still open.

| Phase | Status words |
| --- | --- |
| `retired` | `superseded`, `superceded`, `supersedes-by`, `replaced`, `replaced-by`, `deprecated`, `obsolete`, `obsoleted`, `retired`, `rejected`, `declined`, `withdrawn`, `abandoned`, `cancelled`, `canceled`, `dropped`, `revoked`, `reverted`, `moved`, `historical`, `defunct`, `inactive`, `dead`, `void`, `closed`, `postponed`, `deferred`, `not-planned`, `not_planned`, `wontfix` |
| `record` | `archived`, `archive` |
| `frozen` | `final`, `finalised`, `finalized`, `frozen`, `locked`, `ratified`, `immutable`, `sealed`, `standard`, `published` |
| `active` | `accepted`, `active`, `approved`, `adopted`, `agreed`, `implementable`, `implemented`, `implementing`, `current`, `effective`, `in-effect`, `enforced`, `stable`, `merged`, `released`, `shipped`, `live`, `done`, `complete`, `completed`, `signed-off`, `committed`, `decided`, `settled`, `resolved` |
| `draft` | `draft`, `drafting`, `proposed`, `proposal`, `provisional`, `provisionally-accepted`, `to-be-decided`, `not-decided`, `not-yet-decided`, `to-be-settled`, `not-settled`, `not-yet-settled`, `to-be-resolved`, `not-resolved`, `not-yet-resolved`, `prospective`, `wip`, `work-in-progress`, `in-progress`, `in_progress`, `review`, `in-review`, `under-review`, `reviewing`, `discussion`, `discussing`, `pending`, `idea`, `exploratory`, `candidate`, `open`, `undecided`, `unresolved`, `new`, `unreviewed`, `rfc`, `experimental`, `alpha`, `beta`, `incubating` |

| Where | Read from |
| --- | --- |
| Front matter, the first key present | `status`, `state`, `stage`, `lifecycle`, `phase`, `adr-status` |
| A section, under the heading, with or without a colon | `Status`, `State`, `Stage`, `Lifecycle`, `Current status` |
| A two-column table above the first `##`, in the cell right of the first key in the left column, the header row included | `Status`, `State` |
| A label opening a line above the first `##`, the first one, where none of the three above is written | `Status:`, `**Status**:`, `**Status:**` |
| A directory, for a document that declares no status | `archive`, `archived`, `attic`, `deprecated`, `graveyard`, `historical`, `obsolete`, `rejected`, `retired`, `superseded`, `superceded`, `withdrawn` |

The table is where many teams put a document's fields, `| Status | Accepted |`:

- It is read where a `## Status` section is, after one: a document with both is
  read from the section, and front matter still wins over either.
- A key is compared whole, in any case, emphasis stripped.
- A table with more columns, one under a heading below the title, and one
  spec-graph reads as a register are never read for the document's status: a
  legend or a register describes other things.

The label is the line spec-guard reads, so the two tools agree on a document's
status: not in a list, a quote, single emphasis, code or a comment, and not
without the colon. A value that opens with no letter, `Status: 2026-11-01
accepted` or ``Status: `draft` ``, cannot be read, and the phase is unknown.
See [ADR-0002](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0002-lifecycle-lattice.md), amended 2026-11-08.

</details>

`archived` is none of the four. It is what spec-brief writes on a round of work
it has closed, and every spec-* tool reads it as a **record**:

- depending on it is normal;
- its unticked boxes are not anyone's work;
- its links are still checked;
- new work handed to it is still a ghost handover.

See [Journals, changelogs and minutes](journals.md). Unlike
a journal, it still answers for what it claims: a supersession it declares, a
cycle it closes and a link to itself are reported as they would be anywhere.

To retire a decision, say `superseded` or `deprecated` -
`archived, superseded by ADR-0009` is retired - and a document under an
`archive/` directory that says nothing about itself is still retired.

An unrecognised status becomes `unknown`, and rules treat it permissively. It
never guesses.
