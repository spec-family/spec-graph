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

The same documents backtick commands, `npm run lint`, error codes, `E0420`,
and code, `.into<T>()`, none of which name a path, and reading them as paths
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

*Amended 2026-11-08.* **Less is read as a path.** Run on a real repository's
switchboard, 0.23.0 read an extension named in prose, `.md`, as a file, and
two names joined by a slash, `TCP/IP`, as a directory; a ref, `origin/main`,
read the same way. An extension alone is no path now: a token
ends in a configured extension only after a name. A token with a `/` whose
last name has no extension, a dot after its first character, and that does
not end in `/`, is looked for only where the directory it opens with is
there, beside the document or at the root, or at the root for one written
from it: `src/payments` is held when `src` exists, and `TCP/IP` is
passed over when no `TCP` does. One that opens with `.` or `..` is a path
wherever it leads. A new directory named without a closing slash, under a
directory that is not there either, is missed: ADR-0006 prefers that to a
finding on two words, and `new/dir/` or `@spec-path created` says what is
meant.

*Amended 2026-11-08, again.* **A document `orientation` names is read
whether or not the patterns reach it.** Other agents keep their
instructions where `CLAUDE.md` is, `AGENTS.md` and `GEMINI.md`, and where no
documentation pattern looks: Copilot in `.github/copilot-instructions.md`,
Cursor in `.cursor/rules/*.mdc`, Markdown under a few lines of front matter.
Named in `orientation.files` and not in the patterns, such a document was
never read, and a run over it was as green as one over a document that names
nothing. Its patterns are walked apart from the patterns to check, under the
same `--ignore`, and a file both reach is read once; walked apart, a `!` in
either list takes back only what that list reached.

*Amended 2026-11-08, a third time.* **A command an orientation document
names runs a name its manifest declares.** The same documents tell the next
reader what to run, `npm run lint` or `make check`, and an agent that writes
one names a script nobody wrote, or one renamed since: the reader runs it and
is told it is missing, or worse, guesses which was meant.

<!-- @spec-edge kind="depends-on" to="ADR-0006" reason="only what can be told is held to a manifest" -->

- **Five tools, in a code span.** `npm run x`, `npm run-script x`, `npm
  test`, `pnpm x`, `pnpm run x`, `yarn x` and `yarn run x` run a script
  of the `package.json` nearest the document; `make x y` runs targets of the
  Makefile (`GNUmakefile`, `makefile` or `Makefile`, in make's order);
  `just x` runs a recipe or an alias of the justfile. A command in prose or
  in a fenced block is not read, nor is any other tool.
- **Nearest**: in the document's directory, then each directory above it, up
  to the root, by the name the directory lists, so a host whose disk folds
  case reads the file another reads.
- **`missing-command`**, an error, at the code span, naming the manifest and
  what it declares.
- **Left alone, since a false finding costs more than a missed one**: a
  tool's own command (`pnpm add`, `yarn workspace`, `npm start`), a flag
  before the name or one that moves the command to another package or file
  (`--filter`, `-w`, `--workspace`, `--prefix`, `-C`, `--cwd`, `-r`)
  or skips a missing script (`--if-present`), a line holding an operator, a
  placeholder or a variable, an assignment before the tool, no manifest at
  all, a `package.json` that is no JSON object, a Makefile that includes
  another, evaluates text or names a target by a pattern or a variable, a
  justfile that imports a file or a module, and a make target a file beside
  the Makefile stands for: one of its name, which is up to date, or one
  make's built-in rules build it from, `hello.c` for `hello`.
- **Marked, never guessed**: `<!-- @spec-command created="bench" -->` says
  the work adds the name; it takes a list.

  *Amended 2026-11-11.* **A command named as not there has a mark of its
  own.** A switchboard says what not to run as well as what to run: "there
  is no `npm run mutation`; the sweep runs in Actions". The name is not
  there on purpose, and the only mark was `created`, which says the work
  adds it, the opposite of what the document means, and what a reader, or a
  tool that held a round to what it said it would create, would take as a
  promise. `<!-- @spec-command absent="mutation" -->` says the document
  names it as not there, and the command is not looked for, as
  `@spec-path` has `external` beside `created` for a path that is
  another repository's. It takes a list, and the hint of `missing-command`
  names both marks. Whether the name has since been added is not looked
  for: the mark is written in the document that names it, and goes when the
  document is next rewritten, as `created` does.
- **Read where the repository is.** `analyse` reads the manifests;
  `analyseSources` holds a command to a manifest only where it is given
  `manifestFor`. It does not refuse to run without one, as it refuses for a
  path, because every brief already names `npm run lint`, and a caller that
  ran yesterday would stop.

*Amended 2026-11-12.* **Five things an orientation document names are no
path of this repository, and one is a path in another place.** Run over
gqlkit's switchboards with the configuration the SDD reference recommends,
30 `missing-path` findings were none of them real, and spec-graph's own
CLAUDE.md and CONTRIBUTING.md gave more than thirty.

- **An absolute path is held to its first directory, whatever it ends in.**
  `/etc/nginx/nginx.conf` and `/opt/app/license.txt` are the host's, and a
  path with an extension was looked for regardless. Where the repository
  holds no directory the path opens with, it is not looked for, as a path
  with no extension already was not.
- **`roots` holds a path of several segments too.** A switchboard about one
  package of a monorepo writes `src/client.ts` for that package's, and
  `roots` found only a bare name there. A path written from the document,
  `./x` or `../x`, and an absolute one are where they say.
- **A code span after "e.g." is an example**, with any spans after it in a
  list: ``(e.g. `foo.ts` + `foo.test.ts`)`` names a kind of file and no
  file of the repository. "i.e." names the thing itself, and is held.
- **A path git ignores is not looked for.** `.claude/settings.local.json`
  is in no clone but its writer's. `analyse` reads the `.gitignore` of the
  root and of each directory above the path, only for a path about to be
  reported, as git reads them; a line the path dialect refuses ignores
  nothing. No process is started: git's own `check-ignore` would be a
  second one beside the history ADR-0025 reads.
- **A bare name the repository holds in one place is named there.**
  `release.yml` for `.github/workflows/release.yml` is still a finding, and
  its hint names the path and the directory to add to `roots`. Two places
  or more, and which is meant is a guess, so the hint is the one it was.
  `analyse` walks the repository once for this, the first time it is
  asked, past the directories a walk skips by default.

spec-graph configures `orientation` for its own CLAUDE.md and
CONTRIBUTING.md, with `src` among its roots, and holds both to it.

## Not this round

- **A mapping table held to fields in other documents**, such as a table of
  modules against each specification's `Owner:` line. That is a
  repository's own rule ([ADR-0016](0016-a-query-needs-a-sentence.md)).

## Consequences

A repository that configures no `orientation` sees nothing change. One that
does sees each path and commit its orienting documents name held to the
repository, and marks in those documents what is planned or elsewhere.
