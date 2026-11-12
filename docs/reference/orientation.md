# Orientation documents, naming what exists

A switchboard such as `CLAUDE.md`, or a brief handed to the next session,
names files and commits, and an agent that writes one names things that do not
exist. Name those documents, and what they name is held to the repository:

```json
{ "orientation": { "files": ["CLAUDE.md", "docs/*-brief.md"], "extensions": [".md", ".ts"], "roots": ["spec"] } }
```

- A code span is a path where it reads as one: letters, digits and
  `. _ - / + @ ~`, holding a `/` or ending in one of `extensions` after a
  name, and not opening with `-`, `@` or `~`. `npm run lint`, `E0420`,
  `.into<T>()` and `.md` alone are none. An `#anchor` or `:42` after it is left
  off.
- A path with a `/` and no extension, not ending in `/`, is looked for only
  where the directory it opens with is there: `TCP/IP` and `origin/main`
  are words or a ref, `src/payments` is a path when `src` is. An absolute
  path is held to its first directory whatever it ends in:
  `/etc/nginx/nginx.conf` is the host's where the repository holds no
  `etc`.
- A code span after "e.g.", and each after it in the same list, is an
  example: ``(e.g. `foo.ts` + `foo.test.ts`)`` names no file.
- It is looked for from the document's directory, from the root, and, unless
  it is written from the document (`./x`, `../x`) or from the root (`/x`),
  under each of `roots`, a path of several segments as well as a bare name.
  A path the repository's `.gitignore` files ignore is not looked for.
  `missing-path` where none holds it. Where a bare name is one file or
  directory elsewhere in the repository, the hint names it and the root
  that would find it.
- `<!-- @spec-path created="docs/plan.md" external="dist/cli.js" -->` marks a
  path the document's work creates, or another repository's.
- A commit it names is looked for in git, as a checklist's is.
- A command it names in a code span runs a name its manifest declares:
  `npm run x`, `npm test`, `pnpm x` and `yarn x` a script of the
  `package.json` nearest the document, `make x` a target of the Makefile,
  `just x` a recipe of the justfile. `missing-command` where it does not.
  A tool's own command (`pnpm add`), a flag that moves the command
  elsewhere (`--filter`, `-w`, `-C`, `--if-present`), a line with an
  operator, a placeholder or a variable, and a manifest that includes
  another, or names a target by a pattern or a variable, are left alone,
  and so is a make target a file beside the Makefile can stand for.
  `<!-- @spec-command created="bench" -->` marks a name the work adds, and
  `absent="mutation"` one the document names as not there: "there is no
  `npm run mutation`".
- A document `files` names is read whether or not the patterns reach it.

<details>
<summary>Every word pnpm and yarn run as their own command, and every file make builds a target from</summary>

`pnpm x` and `yarn x` run the script `x`, unless `x` is one of the tool's own
commands. `test` is none: it runs the `test` script.

| Tool | Its own commands |
| --- | --- |
| `pnpm` | `add`, `approve-builds`, `audit`, `bin`, `c`, `cache`, `cat-file`, `cat-index`, `config`, `create`, `dedupe`, `deploy`, `dlx`, `doctor`, `env`, `exec`, `fetch`, `find-hash`, `help`, `i`, `ignored-builds`, `import`, `init`, `install`, `install-test`, `it`, `licenses`, `link`, `list`, `ln`, `ls`, `outdated`, `pack`, `patch`, `patch-commit`, `patch-remove`, `prune`, `publish`, `rb`, `rebuild`, `recursive`, `remove`, `rm`, `root`, `self-update`, `server`, `setup`, `start`, `store`, `un`, `uninstall`, `unlink`, `up`, `update`, `upgrade`, `why` |
| `yarn` | `add`, `autoclean`, `bin`, `cache`, `check`, `config`, `constraints`, `create`, `dedupe`, `dlx`, `exec`, `explain`, `generate-lock-entry`, `global`, `help`, `import`, `info`, `init`, `install`, `licenses`, `link`, `list`, `login`, `logout`, `node`, `npm`, `outdated`, `owner`, `pack`, `patch`, `patch-commit`, `plugin`, `policies`, `publish`, `rebuild`, `remove`, `set`, `start`, `tag`, `team`, `unlink`, `unplug`, `up`, `upgrade`, `upgrade-interactive`, `version`, `versions`, `why`, `workspace`, `workspaces` |

`make x` needs no rule of its own where a file beside the Makefile is `x`,
which is up to date, or one make's built-in rules build `x` from: `x.c`,
`x.cc`, `x.cpp`, `x.C`, `x.f`, `x.F`, `x.p`, `x.r`, `x.s`, `x.S`, `x.y`, `x.l`,
`x.o` or `x.sh`.

</details>

Every agent's instructions are held the same way. Name the ones the
repository keeps:

```json
{
  "orientation": {
    "files": ["CLAUDE.md", "AGENTS.md", "GEMINI.md", ".github/copilot-instructions.md", ".cursor/rules/*.mdc"],
    "extensions": [".md", ".ts"]
  }
}
```

See [ADR-0029](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0029-an-orientation-document-names-what-exists.md).
