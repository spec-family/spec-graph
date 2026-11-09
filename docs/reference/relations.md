# Relations

Relations are read from front matter, from link context, and from explicit
directives:

```yaml
---
status: accepted
supersedes: ADR-0002
depends-on: [ADR-0004, RFC-0011]
---
```

A front-matter key is read however it is punctuated or cased - `depends-on`,
`depends_on` and `dependsOn` are one key - and every relation is spelled in
both directions, so a repository writes whichever half its filing convention
keeps ([ADR-0014](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0014-a-relation-is-spelled-both-ways.md)).
Written in ADR-0001, `key: ADR-0002` means:

| Relation | ADR-0001 → ADR-0002 | ADR-0002 → ADR-0001 |
| --- | --- | --- |
| `supersedes` | `supersedes`, `supercedes`, `replaces`, `obsoletes`, `deprecates` | `superseded-by`, `superceded-by`, `replaced-by`, `obsoleted-by`, `deprecated-by`, `rolled-into` |
| `amends` | `amends`, `extends`, `refines`, `clarifies`, `revises` | `amended-by`, `extended-by`, `refined-by`, `clarified-by`, `revised-by` |
| `depends-on` | `depends-on`, `dependent-on`, `dependencies`, `requires`, `builds-on`, `relies-on` | `depended-on-by`, `required-by`, `dependents` |
| `assumes` | `assumes` | `assumed-by` |
| `blocked-by` | `blocked-by`, `blocked-on`, `waiting-on`, `waiting-for`, `gated-on`, `gated-by` | `blocks` |
| `delegates-to` | `delegates-to`, `delegated-to`, `deferred-to`, `tracked-in`, `tracked-by`, `continued-in` | `delegated-from` |
| `relates-to` | `related`, `relates-to`, `related-to`, `see-also` | |
| `references` | `references`, `reference`, `refs` | `referenced-by` |

```md
The chunking scheme is constrained by [ADR-0002](0002-rows.md).  → assumes
Which policy? Deferred to [ADR-0011](0011-policy.md).            → delegates-to
Blocked by [ADR-0009](0009-compliance.md).                       → blocked-by

## See also
- [ADR-0001](0001-intro.md)                                      → relates-to
```

A phrase governs a reference when it stands no more than 40 characters before
it, in the same statement: a sentence, a paragraph, a list item or a table cell.

- A negation between the two - `owned by nobody` - cancels it, whatever mark
  stands before or after the word: `blocked by none: [ADR-0002](0002.md)` and
  `blocked by:none` are each a citation and no more, and so is a code span
  that holds nothing but the word, `` blocked by `none` ``. A hyphen joins the
  word to the next, which names a thing, so `blocked by the no-op in` cancels
  nothing; `no-one` is `no one`, and cancels.
- So does a negation just before the phrase: `not blocked by`, `never
  deferred to`, `has not been superseded by`, `doesn't depend on`, `no longer
  blocked by`. Only a space and a word of tense or doubt (`be`, `been`, `is`,
  `yet`, `longer`, `necessarily` and a few more) stand between: `not only
  blocked by`, `nothing but blocked by`, the option `"never" blocked by` and
  `Not in this release: deferred to` each state the relation, and are read as
  they state it. So do `if not, blocked by` and `both or neither, because`: a
  comma ends the clause the negation is in, and counts toward no phrase's 40
  characters. An aside closed by a comma of its own leaves the clause open,
  so `not, as it happens, blocked by` and `never, ever, blocked by` are
  citations, and so is `if not, then, blocked by`, which is missed. No
  phrase before such a negation governs the reference either:
  `not, as decided in [ADR-0003](0003.md), blocked by [ADR-0002](0002.md)`
  reads the first as a premise and the second as a citation.
- A pointer between the two, `see`, governs the reference as a citation:
  `per tick, see [ADR-0002](0002.md)` and `blocked by the cache, see` read no
  relation, and `the must-see list` and `seen in` point at nothing.
- A sentence written in Chinese ends at `。`, `？`, `！` or `；`, with a space
  after it or none, so `Deferred to later。另見 ADR-0002` hands nothing to
  ADR-0002. A stop only ends a statement sooner: it reads less, never more.
- Prose reads both directions too: `supersedes` and `superseded by`, `amends`
  and `amended by`, `blocked by` and `blocks` or `blocking`, `depends on` and
  `depended on by` - the second of each pair points back at the document that
  wrote it.
- A phrase that follows the reference makes the reference its subject -
  `[ADR-0009](0009.md) supersedes this` - except a `depends-on` or `assumes`
  phrase: `[ADR-0002](0002.md) requires a migration` says nothing about this
  document.

A link under a heading that files it as bookkeeping is `relates-to` unless a
phrase beside it says more. **Bookkeeping headings:** `See also`, `References`,
`Reference`, `Related`, `Related work`, `Related decisions`,
`Related documents`, `Links`, `Further reading`, `Prior art`, `History`,
`Changelog`, `Change log`, `Revision history`, `Bibliography`, `Sources`,
`Appendix`, `More information`, `Resources`, `Index`.

Two properties do the work:

- `loadBearing` relations (`assumes`, `depends-on`, `blocked-by`, `amends`) make
  the source's validity depend on the target — those are what turn stale.
- `transfersObligation` relations (`delegates-to`, `blocked-by`) move work —
  those are what become ghosts.

A "See also" link is neither, and is never reported, which is what keeps the
signal-to-noise ratio high enough to leave the tool switched on.
