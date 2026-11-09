# Journals, changelogs and minutes

A 2024 journal noting *"decision deferred to ADR-002"* is not delegating
anything. It is reporting that somebody once did. When ADR-002 retires in 2026,
the note does not become a defect — there is nothing in it for anyone to fix.

Declare those files and spec-graph stops holding them to a lifecycle they never
had:

```json
{ "historyPatterns": ["**/JOURNAL_*.md", "archive/**"] }
```

or, for one file, `<!-- @spec-history -->` at the top of it. A brief whose
status is `archived` is a record already, with nothing declared, though not a
log: the supersessions, cycles and self-references it declares are still
checked.

|  |  |
| --- | --- |
| its links resolve | **still checked** — a broken link is broken whoever wrote it |
| its checkboxes | not obligations, and not in the headline count |
| its delegations | reports of what was said |
| work handed **into** it | **still checked** — a log will never act on it |

That last row is the point. Excluding the file with `--ignore` would have
silenced the whole lot, including the links, and a journal full of 404s is
exactly what this tool is for. See
[ADR-0011](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0011-a-record-is-not-a-specification.md).

So the two are not given together. A `--history` pattern that matches no file
the run reads, where the files it names are left out by `--ignore` or by
`"ignore"` in the configuration, stops the run with exit `2`, since no journal
it names would be read:

```text
spec-graph: --history "docs/archive/**" names only files --ignore leaves out, and a journal is read or it is left out: give one of the two
```

A pattern that matches no file at all is read as before, and `historyPatterns`
in the configuration under an `--ignore` is the flag deciding: the files are
left out.
