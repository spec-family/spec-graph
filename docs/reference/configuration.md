# Configuration

Anything you repeat on every run belongs to the repository rather than to the
command. spec-graph reads the first of `.spec-graph.json`,
`spec-graph.config.json`, or a `"spec-graph"` key in `package.json`:

```json
{
  "patterns": ["docs/**/*.md"],
  "ignoreReferences": ["trap *"],
  "ignoreFamilies": ["RFC"],
  "historyPatterns": ["**/JOURNAL_*.md"],
  "ignoreStatus": ["specs/**/spec.md"],
  "baseline": ".spec-graph-baseline.json",
  "ratchet": true,
  "severities": { "self-reference": "off" },
  "strict": true,
  "maxRelated": 3,
  "claims": { "files": ["spec/*.md"], "labels": { "Implemented": "done", "Specified": "open" } },
  "checklists": ["ROADMAP.md"],
  "ledgers": ["docs/STATUS.md"],
  "gitRef": "origin/main",
  "registers": { "files": ["docs/review.md"], "statuses": { "open": {}, "done": { "closes": true, "needs": ["commit"] } } },
  "protocols": { "files": ["ROADMAP.md"], "heading": "Measurement protocols", "result": "Last result" },
  "orientation": { "files": ["CLAUDE.md"], "extensions": [".md"], "roots": ["spec"] },
  "rules": {
    "no-draft-dependency": {
      "query": "document[phase=active] -depends-on-> document[phase=draft]",
      "message": "{0} depends on {1}, which is still a draft"
    }
  }
}
```

The file is looked for in the working directory and then upward, as far as the
repository — a directory holding `.git` — and **the directory holding it becomes
the root**. So a run from `packages/auth` reports what a run from the top
reports, byte for byte, because every path here is relative to the root.

- The nearest file wins.
- `--root` names the root yourself and turns discovery off.
- A path typed on the command line stays relative to where you typed it, brace
  alternative by brace alternative: `{/docs,x}` typed in `sub` is `/docs` or
  `sub/x`.
- A `\` in a root, a baseline or an export `diff` reads is a separator on
  every host, as in a pattern, so `--baseline sub\held.json` typed at the
  root and `..\sub\held.json` typed in `docs` are one file, `sub/held.json`,
  on Linux as on Windows.
- So a run does not start in a directory whose name holds a `\`, where the
  host separates names with `/`, as Linux does: read as a separator, the
  `\` would name another directory, and the run would check it and record a
  baseline into it. The run stops with
  exit `2` and one line before it reads anything; run it from a path whose
  names hold none, or give `--root` one, such as a link to the directory.
  `diff`, `--help` and `--version` run there.

See [ADR-0018](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0018-the-configuration-file-is-the-root.md).

A flag always wins over the file, and list flags **add** to it rather than
replacing it — a `--ignore-ref` on the command line is one more exclusion, not a
decision to discard what the repository already declared. `--verbose` prints
which file was read, on stderr with everything else a run says about itself, so
it can be combined with any `--format` and leave the document on stdout intact.
`--no-config` skips the mechanism entirely.

`claims`, `checklists`, `ledgers`, `registers`, `protocols`, `orientation` and
`gitRef` have no flag either: which documents hold claims and are held to them, and which history
their commits are looked for in, are the repository's
([claims](claims-and-evidence.md#claims-with-their-labels),
[checklists and ledgers](claims-and-evidence.md#checklists-and-ledgers-held-to-what-they-cite),
[registers](registers.md),
[figures](claims-and-evidence.md#figures-resting-on-a-record),
[orientation documents](orientation.md),
[commits](claims-and-evidence.md#commits-looked-for-in-git)).

`ignoreStatus` has no flag: it names the documents whose own status is not
read, `true` for every one or a list of patterns for those they match, such
as Spec Kit's specifications, each written `**Status**: Draft` and never
changed. A document it names reads as one that declares no status, so its
phase comes from its directory, or is unknown; `false`, or no key, reads
every status. An empty list is refused, as spec-guard refuses it, and so is
anything but `true`, `false` or patterns. spec-guard reads the same key with
the same meaning ([lifecycle](lifecycle.md#a-status-nobody-maintains)).

`maxRelated` has no flag. It caps how many related locations one finding lists
— the lines under it in the terminal, `related` in JSON, `relatedLocations` in
SARIF — and is 8 unless set; `0` lists none.

A broken config stops the run with exit `2`, each problem named on stderr:
invalid JSON, a value of the wrong type, an unknown key, a rule that does not
compile, a family name no family has, a family in both `families` and
`ignoreFamilies`, a file that is there and cannot be read.
Why a mistake stops the run:

- A configuration that did not load checks a different repository than the one
  configured, and would report *that* one as consistent: a `{1.phse}` for
  `{1.phase}` in one rule's message is a green build over the files the
  correctly spelled rule fails.
- An unknown key counts, for the same reason it is reported at all — a silently
  ignored `ignoreReference` is a configuration that looks applied and is not.

`--no-config` checks on defaults instead, and the exit code then says which run
it was.

## Patterns

With no patterns, spec-graph reads `docs/**/*.md`, `doc/**/*.md`,
`adr/**/*.md`, `rfcs/**/*.md`, `specs/**/*.md`, `.specify/memory/*.md`,
`openspec/**/*.md`, `.kiro/specs/**/*.md` and `*.md`.

The patterns to check, `--ignore`, `--history` and `historyPatterns` are the
glob dialect every spec-* tool reads, so a scope means the same to spec-graph
as to the tool that wrote it. They are matched against the whole
repository-relative path, **case-sensitively on every host** — a baseline
recorded on a Windows checkout holds in Linux CI:

| pattern | matches |
| --- | --- |
| `docs/**/*.md` | Markdown anywhere under `docs`; `**` is whole directories, none or more |
| `docs/**.md` | refused: `**` is whole directories or nothing, so write `docs/**/*.md` or `docs/*.md` |
| `docs` | a file called `docs`, or everything under the directory |
| `docs/` | everything under `docs`, and not `docs` itself |
| `{docs,specs}` | two literals, so both directories and what they hold |
| `{docs/,specs}` | everything under `docs`, and `specs` as the literal it is: a `/` ends an alternative as it ends a pattern |
| `/docs`, `{/docs,specs}` | nothing under the root for `/docs`, which is rooted at the filesystem's root, and `specs` alone for the braces: a `/` starts an alternative as it starts a pattern |
| `adr/[0-9]*.md`, `adr/[!0-9]*.md` | a class, and a negated one; `[^0-9]` negates too |
| `!docs/drafts/**` | takes back what an earlier pattern matched; the last to match wins |
| `docs\adr\*.md` | the same as `docs/adr/*.md`: a `\` is a separator |

Three kinds of pattern stop the run with exit `2`, and the run names the
pattern, wherever it was written:

- a pattern that cannot mean a path under the root — an unclosed `[` or `{`,
  `..`, a lone `.` or `./`, an empty one, or braces that give one of them,
  `{./,docs}`;
- an extended glob, `+(a|b)`: write `{a,b}`;
- one too large to compile: braces that expand to more than 256 patterns, or a
  pattern past 65,536 automaton states.

Globs - the patterns to check, `--ignore`, `--ignore-ref`, `--history` - are
matched by an automaton rather than by `RegExp`, because a glob with three stars
in it is enough to keep `RegExp` busy for two minutes over a long reference
target. See
[ADR-0017](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0017-a-predicate-must-finish.md).

A class never matches a `/`. A parenthesis with no `|` in its group is itself,
so `C++(notes).md` names that file. A `..` typed below the root,
`spec-graph "../*.md"` from `docs/deep`, is resolved against where you typed it;
one that climbs past the root is refused, and so is a pattern typed in a
directory whose name a pattern would read as syntax, such as `notes[1]`.

A bare name and a path read differently as an `--ignore`:

- A bare `--ignore` name, `--ignore drafts`, still prunes that directory at any
  depth, even where a pattern starts inside it or names it.
- A `!` before one gives the name back, as a `.gitignore` line does:
  `--ignore drafts --ignore '!drafts'` reads every `drafts`, and the last bare
  name to name a directory decides.
- A path, `--ignore "docs/*"`, takes out what it matches wherever a pattern
  starts: `docs/drafts/**/*.md` finds nothing under it, as `docs/**/*.md` finds
  nothing in `docs/drafts`.

The walk never enters `.git`, `.hg`, `.svn`, `.cache`, `.next`, `.nuxt`,
`.turbo`, `.venv`, `node_modules`, `bower_components`, `vendor`, `dist`,
`build`, `out`, `target`, `coverage` or `__pycache__` on its way to what the
patterns name. Unlike an `--ignore`, these yield:

- to a pattern that starts inside one: `vendor/specs/*.md` is read from there,
  whatever the other patterns reach;
- to a plain name for one: `vendor` and `docs/vendor` read those directories
  as `vendor/` and `docs/vendor/` do, or the file, where one of them is a file;
- to a `!` before their name: `--ignore '!vendor'` reads every `vendor`, the
  rest of the list still skipped inside it. A `!` before a path takes back only
  what a path `--ignore` took out, so `!docs/vendor` gives back nothing the walk
  skips: name it among the patterns.

Nor does the walk follow a link, a pattern that starts beyond one included:
`docs/linked/*.md` reads nothing through the link `docs/linked`, as
`docs/**/*.md` reads nothing there. `followSymlinks` in the
[API](api.md) follows links, and:

- prunes a link to a directory as it prunes a directory of that name and path:
  a linked `node_modules` is skipped, and an `--ignore` takes a link out;
- never follows a link back into a directory the walk is inside, so a cycle is
  read once, and says nothing of it, as it says nothing of a link it does not
  follow.

`--ignore-ref` is matched against reference targets rather than paths:

- a bare pattern names one target exactly;
- case is ignored on every host;
- a `\` escapes the next character;
- `.` and `..` are the text of the link, in a brace alternative as anywhere
  else: `docs/{.,x}` names `docs/.` and `docs/x`, and `{./,docs}` the targets
  under `./`, and `docs`;
- a leading `/` is the text of the link too: `{/docs/a.md,x}` names the target
  `/docs/a.md`, as `/docs/a.md` does, and not `docs/a.md`.

See [ADR-0022](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0022-globs-are-the-family-path-dialect.md).

## Family rules

Every specification cites RFC 2119. In a repository that also keeps its own
`RFC-*` documents, that sentence reads as a dangling reference to a local RFC
2119 it does not have:

```json
{ "ignoreFamilies": ["RFC"] }
```

`families` is the stronger statement — *these* are the families this repository
has — and turns every other noun-number construct back into prose.

Each entry, and each `--family` or `--ignore-family`, is one family's name:
the prefix its identifiers are written with, `ADR` for `ADR-0007`, in any case.
A name no family has — `""`, or `"ADR,RFC"` where two entries go — stops the
run with exit `2`: alone in `families` it allowed nothing, so every citation
was prose and a dangling one passed.

A name that is a family's, and that no document here belongs to, allows
nothing either. `--family RFC` in a repository of ADRs, or `ADRS` for `ADR`,
leaves every citation as prose, and the check would report a consistent graph
over a citation of an ADR nobody wrote. So a list has to name a family a
document belongs to, or the check stops with exit `2`, before it reports or
records anything:

```text
spec-graph: no document here belongs to a family named by --family (RFC); the documents here belong to ADR
  name a family the documents belong to, or leave the list out
```

A document belongs to a family when its identifier is written with it, as
`ADR-0007` is with `ADR`. One name with no document, beside names that have
them, stops the check where the list also leaves out a family the documents do
belong to. `--family ADR --family RFCS`, in a repository of ADRs and RFCs,
passes over every citation of an RFC, and the check that fails without the
list would report a consistent graph. One name is most likely meant for the
other, so the line names both, and the exit is `2`:

```text
spec-graph: no document here belongs to RFCS, named by --family; the documents here belong to ADR and RFC, and the list leaves out RFC
  name each family as its documents do, or leave it off the list until its first document is written
```

Where every family the documents belong to is on the list, a further name with
no document is a family the repository means to start, or one whose documents
this run does not read. The list then passes over nothing the run would have
read without it, so the name is said on stderr and fails nothing:

```text
spec-graph: no document here belongs to RFC, named by --family; the documents here belong to ADR
```

A family on `ignoreFamilies` was taken out on purpose and is not one the list
leaves out. A list that is narrower on purpose, `--family ADR` over ADRs and
RFCs, has no name without a document and sees no line; where it also names a
family not started yet, `ignoreFamilies` is how it says which family it leaves
out on purpose.

A list whose every name has a document sees none of them. `ignoreFamilies`
needs no such check: a name on it passes over citations of that family alone,
so a mistyped one passes over nothing and the run reports more, not less.

A family is read or passed over, not both. The list that ignores is asked
first, so a name on both lists passed over the family whatever the other said:
one family under both keys of the file is a problem in it, exit `2`, as
`--family` beside `--ignore-family` is on the command line. A flag says what
the run does where the file says otherwise: `--family RFC` over
`"ignoreFamilies": ["RFC"]` reads the RFCs' citations, and `--ignore-family ADR`
over `"families": ["ADR"]` passes over the ADRs'.

Both are consulted only after resolution has already failed, so `RFC 0001` still
resolves to your local RFC-0001 with `RFC` on the ignore list. No configuration
can delete an edge. See
[ADR-0010](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0010-configuration-belongs-to-the-repository.md).

`--verbose` lists everything they silenced, so one over-broad glob cannot quietly
turn the check off and look like a clean repository:

```text
i docs/adr/0001-traps.md:15:3   ignored reference: trap 55 (2 times)
i docs/rfcs/0002-transport.md:7:69  ignored family: RFC 2119
```

The JSON report carries the same rows under `suppressed`, without needing the
flag. What is deliberately *not* listed is a bare identifier spec-graph read as
prose on its own — `T-1000` was nobody's decision, and listing it would bury the
entries that were. See
[ADR-0008](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0008-wiki-links-carry-no-path.md).

Prose like `Phase 1`, `R69`, `Q-120`, `Table 2` and `Step 4` has never needed
this: an identifier found in prose is only read as a citation when its family
already exists in the corpus.
