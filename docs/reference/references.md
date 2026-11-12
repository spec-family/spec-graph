# References, resolved forgivingly and validated strictly

All of these reach the same document:

```md
[ADR-0007](../adr/0007-sharding.md)   [[0007-sharding]]   [ADR-7][a7]
As decided in ADR-0007, ...           see 0007 (within the same family)
```

Resolution is deliberately asymmetric, because the alternative is a tool nobody
trusts:

- **Deliberate references are validated.** A link, a front-matter field or a
  directive that does not resolve is a broken foreign key and is reported.
- **Bare identifiers in prose are opportunistic.** They are reported only when
  their family already exists in the corpus. `ADR-0099` in a repository of ADRs
  is a real dangling citation; `SHA-256` in the same repository is a sentence.
  - A one-letter prefix is never a family - `Q3`, `x86`, `p99` - and nor are
    the prefixes of versions, pages, protocols and platforms, even in a
    repository that has a family of that name.
  - **Never a citation:** `ver 3`, `version 4`, `pp.12`, `Fig.3`, `Figure 4`,
    `Table 2`, `tbl 1`, `section 4`, `sect 2`, `sec 5`, `step 2`, `item 3`,
    `No.5`, `num 7`, `line 42`, `ln 12`, `col 3`, `port 8080`, `PR 45`,
    `issue 42`, `GH-123`, `UTF-8`, `ASCII 7`, `SHA-256`, `MD5`, `HTTP 2`,
    `HTTPS 2`, `IPv6`, `IPv4 32`, `IPv6 128`, `TLS 1.3`, `SSL 3`, `ES2015`,
    `ECMA-262`, `p99 250`, `base64`, `SQL-92`, `ARM64`, `x86-64`, `Win32`,
    `Node 22`, `Python 3`, `Java 21`, `Go 1.22`, `cpp20`.
- **Bare numbers are family-scoped.** `0007` inside an RFC means `RFC-0007`,
  never `ADR-0007`. A repository with both is ordinary, and guessing would be
  worse than silence. A document's family is the prefix of its identifier, or
  else the nearest directory that names one: `adr/`, `adrs/`, `decisions/`,
  `decision-records/` and `architecture-decisions/` hold ADRs; `rfc/` and
  `rfcs/` RFCs; `kep/`, `keps/` and `enhancements/` KEPs; and `proposal(s)/`,
  `design(s)/`, `prd(s)/` and `spec(s)/` a family each.
- **Two candidates is worse than none.** An ambiguous citation is reported, not
  bound to whichever document was indexed first.
- **Code never counts.** Links inside fences and inline spans are masked before
  anything is extracted, and link constructs are blanked before prose is scanned,
  so `[ADR-7](https://example.com/adr-7)` yields one reference rather than three.
- **Source links are not spec links.** `[rules.ts](../../src/rules.ts)` is not a
  broken reference. That is [spec-guard](../../README.md#relationship-to-spec-guard)'s job.
  Nor is a link to:
  - any other file that is not a document: an image, a dotfile such as
    `../.nvmrc`, a drawing such as `arch.excalidraw`, however long its
    extension, or a file with none, such as `LICENSE`, `Makefile` or
    `docker/Dockerfile`. A dot followed by a digit, as in `ADR-0007.1`, is
    part of an identifier and is still resolved.
  - a directory, `../guides/` or `../guides` alike - without the slash the disk
    says which it is.

  A link's destination is read against the document's own directory with a
  slash or without one, so `[MIT](LICENSE)` names the file beside the
  document as `./LICENSE` does. The disk is asked only once the link has
  resolved to no document, so `[the decision](ADR-0007)` still cites
  ADR-0007, and a name the disk does not have either is still a broken
  reference. A wiki link carries a name and no path, and a front-matter value
  or a directive is an identifier unless it is spelled as a path: neither is
  asked of the disk. A document the include patterns did not reach is a
  reference outside the corpus, and the hint names a pattern with the file's
  own extension, `**/*.txt` for `NOTES.txt`.

A document is named by an explicit `id:` (or `adr:`, `adr-id:`, `rfc:`,
`rfc-id:`, `kep-number:`, `number:` or `slug:`), then by its file name, then by
its H1, and the H1 is read as a name only when neither of the others gave one.
A file name a template gives every document of its kind - `spec.md`,
`specification.md`, `plan.md`, `tasks.md`, `design.md`, `proposal.md`,
`requirements.md`, `research.md`, `data-model.md` and `quickstart.md` -
names none of them, so such a file is named by its path less the extension,
`specs/001-login/spec`, and still answers to its name, and so is a file
directly in `checklists/` or `contracts/`; the template wrote its H1 too, so
the H1 names none of them either; a `README.md` is named by its
directory
([ADR-0030](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0030-a-templates-file-name-names-nothing.md)).
A row of a register is named by its ID column instead: see
[Registers](registers.md).

An `#anchor` reaches a heading by its slug, or by the anchor GitHub gives a
repeat of it (`-1`, `-2`), or by the anchor GitHub gives the heading itself,
which keeps `_` and is made from the text as rendered: `#snake_case_name`,
and `#120-2026-11-12` for `## [1.2.0](url) (2026-11-12)`. It reaches an
item by its id; a register's row by its key; and a place the document marks
for itself: an `{#id}` a heading ends with, as kramdown, Pandoc and
Docusaurus write it, an `id` on any HTML element, and a `name` on an `<a>`.
One in code or a comment marks nothing. An anchor
written percent-encoded, `#%E6%A6%82%E8%A6%81` for `## 概要`, is read
decoded where it does not bind as written.

A word that numbers a part of a plan, a book or a release - `Phase`,
`Stage`, `Sprint`, `Week`, `Part`, `Chapter` and `v` - names no family.
`# Phase 1: Foundations` and `docs/releases/v1.2.0.md` are named by their
stems, and "lands in Phase 2" is prose even where a document declares
itself `PHASE-1`. A link to `PHASE-2` is still a reference. A citation in
prose is reported only in a family a document belongs to, so where one
resolves to nothing the hint names the flag that passes the family over and
the file that made it a family:

```text
> fix the identifier, or add the document it names - or, if it is not a citation, --ignore-family ITERATION passes over the family docs/plans/iteration-1.md started
```

## When `[[...]]` tags a concept

A Markdown link with a path says where the target lives. A wiki link says only
what it is called — and whether that name means a *document* is a property of
your repository, not of the link:

```md
[[0007-sharding]]   a file stem, in an Obsidian-style vault
[[trap 55]]         an entry in a catalogue that lives inside another document
```

spec-graph cannot tell them apart, so it validates by default — an unresolved
`[[...]]` in a vault is the most common broken reference there is. Where the
convention is the other one, say so once:

```bash
spec-graph --ignore-ref "trap *"
```

The tool names that flag in the hint, so it costs one run to find:

```text
> fix the identifier, or - if [[...]] tags a concept here - exclude it: --ignore-ref "trap *"
```

`--ignore-ref` suppresses *findings*, never edges. A reference that resolves is
still a relation in the graph no matter what you exclude — not even
`--ignore-ref "*"` can delete one. See
[ADR-0008](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0008-wiki-links-carry-no-path.md).

## A gap that is deliberate

Real filing histories have holes: an ADR number reserved and then withdrawn, a
document that was folded into another before it was ever committed. Something
still cites it, and the citation is not a mistake.

There are two mechanisms and the difference is what you are declaring.

**The target is never going to exist** — `ADR-0006` was withdrawn before filing.
That is a fact about the repository, so declare it once in
`.spec-graph.json`:

```json
{ "ignoreReferences": ["ADR-0006"] }
```

Every citation of it stays quiet, wherever it is written, forever. A glob is
available and rarely what you want here: `ADR-0006` names one target exactly.

**This particular citation is accepted for now** — it should resolve, one day it
will, and until then the build should not stop. That is debt, not a fact, and it
belongs in the baseline, keyed to the one document and the one target:

```json
{ "rule": "broken-reference", "document": "ADR-0004", "subject": "docs/plans/x.md", "count": 1 }
```

The same citation from a different document is still reported, and `--ratchet`
makes the entry disappear the day it is paid. Reach for the first when the
absence is permanent, the second when it is temporary — and if you cannot say
which, it is the second.
