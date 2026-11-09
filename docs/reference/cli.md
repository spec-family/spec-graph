# CLI

```text
spec-graph [check] [patterns...]     Validate the graph. The default.
spec-graph query <selector>          Run a selector, print matching paths.
spec-graph query project:<rule>      Run a registered rule by its id.
spec-graph graph [patterns...]       Export for Graphviz, Mermaid or JSON.
spec-graph rules [rule-id]           List the diagnostics; --explain adds
                                     each selector and the ADR behind it.
spec-graph diff <before> <after>     Compare two JSON graph exports.

--root <dir>            Directory patterns resolve against, and the root of the
                        run. Without it the config file is discovered upward and
                        its directory is the root
--ignore <glob>         Skip paths (repeatable)
--ignore-ref <glob>     Do not report these reference targets (repeatable)
--family <name>         Families a bare identifier may name (repeatable, one
                        name each time)
--ignore-family <name>  Families that are never citations (repeatable, one
                        name each time)
--history <glob>        Files that log decisions rather than making them
--baseline <file>       Accept these findings; report only what is new
--record-baseline <f>   Write today's findings as accepted debt, exit 0
--ratchet               Also fail when a baseline entry no longer occurs
--no-config             Ignore .spec-graph.json and the package.json key
--format <fmt>          human | json (check, query, diff) | sarif (check)
                        | github (check) | gitlab (check)
                        | markdown (check, diff)
--graph-format <fmt>    dot | mermaid | json
--documents-only        Hide items; their relations lift onto their documents
--rule <id>=<severity>  error | warn | info | off (repeatable)
--strict                Raise every warning to an error
--max <n>               Show at most n findings
--max-warnings <n>      Fail when warnings exceed n
--color / --no-color    Force colour on or off; one of the two, not both
--ascii / --no-ascii    ASCII glyphs or Unicode ones; SPEC_GRAPH_ASCII=1 asks for ASCII
--verbose               Include parse problems
```

Exit codes: `0` clean, `1` findings, `2` the tool could not run. A mistyped flag
never masquerades as a passing build, and neither does a pattern that matches
nothing, a configuration file that did not load, or a `--baseline` that is not
there. An error spec-graph did not expect is `2` as well, never findings: it is
reported on stderr as `spec-graph: unexpected error:` with its stack. So is a
stdout its reader closed before all of the output was written, as a pipeline
into `head` does: the answer did not arrive, and one line on stderr says so.

**An input that is set and names nothing is refused**: exit `2` and one line
that names it, never a run that reads it as if it had not been given. An unset
variable in `--family "$FAMILIES"` is the usual way to write one:

- a `--family` or `--ignore-family` holding a name no family has - empty,
  blank, or a list such as `ADR,RFC` where one name goes. Alone on the
  allowlist it would leave every citation as prose, and a dangling one
  unreported;
- a `--root` that is empty, is not there, or is a file, for every command
  that reads one, `rules` included;
- an empty or blank `--baseline`, `--record-baseline`, `--ignore`,
  `--ignore-ref`, `--history` or pattern;
- a list of families, `--family` or `families`, none of which a document
  here belongs to, or one that names a family with no document and leaves
  out a family the documents do belong to ([Family rules](configuration.md#family-rules));
- a second word after `rules`, which takes one rule id, and an empty name
  given to `diff`;
- `--format json` asked of `graph`, whose JSON is `--graph-format json`, or
  of `rules`, which has one format;
- an option given to a command that does not read it, in the table below;
- an option beside its own opposite, `--color` beside `--no-color` or
  `--ascii` beside `--no-ascii`, in either order: the later would decide and
  the earlier go unread ([Colour and glyphs](#colour-and-glyphs));
- an option that takes one value, given two: `--root`, `--baseline`,
  `--record-baseline`, `--format`, `--graph-format`, `--max` or
  `--max-warnings`, and one rule given two severities by `--rule`. The later
  would be read and the earlier go unread: `--root nowhere --root .` would
  check `.` and never say that `nowhere` is not there. The line names both,
  `--root is given "nowhere" and ".", and takes one value: give one of the
  two`. Two values are compared as each is read, so one value twice is that
  value once however it is spelled: `--root .` beside `--root ./` names one
  directory, a baseline is a path resolved as the root is, and `--max 1`
  beside `--max " 1"` is one number. On Windows a drive letter names its
  volume in either case, so `--root C:\x` beside `--root c:\x` is one
  directory; past the letter two names are two, `C:\x` beside `C:\X`. An
  option that is repeatable above takes each of its values;
- `--baseline` beside `--record-baseline`: a recording writes every finding
  of the run and opens no baseline, so the one to read would go unread. A
  `"baseline"` in the configuration is no option, and is recorded over as
  before. So are the options a recording does not read: `--ratchet`,
  `--strict`, `--max`, `--max-warnings`, `--color`, `--no-ascii`, and
  `--format sarif`, `github` or `gitlab`
  ([Adopting this on a repository that predates it](baseline.md));
- a `--history` pattern whose files an ignore leaves out, so that no journal
  it names is read ([Journals, changelogs and minutes](journals.md));
- one family given to both `--family` and `--ignore-family`, whose citations
  are passed over whatever asked for them: alone on the allowlist it would
  leave every citation as prose. One family asked for beside another ignored
  is taken, since both are read;
- a value that begins with `--`, which reads as the option after one whose
  value was forgotten: `--ignore --strict` would ignore a directory called
  `--strict`, and `--record-baseline --verbose` write a file of that name.
  A name that does begin so is written `./--name` for a file, `[-]-name` in
  a pattern and `\--name` for a reference target;
- a configuration file that is there and cannot be read, a directory called
  `.spec-graph.json` among them;
- `--help` beside `--version`, in either order: one of the two answers would
  go unread.

Each of those the command line can tell from itself, an option a recording
does not read among them, is refused with `--help` or `--version` on the
line too, as an option nobody knows always was: answered first, the help
told a script nothing of the line it wrote, and the version answered as if
the line were right. What a command still needs, a selector or two exports,
is what the help is for, so `query --help` and `diff --help` print it; and
so does a line only the run would find wrong, `--root nowhere --help` or a
`--history` an ignore leaves out, since the help reads no disk.

An option belongs to the commands that read it. Any other command refuses it
by name, `--strict belongs to check, not to query`, rather than run as if the
option were absent: `query --strict` would be no stricter, `graph
--record-baseline` would write no file, and with the command forgotten,
`spec-graph --graph-format mermaid > graph.mmd` would write the check's report
into the file.

| Option | Read by |
| --- | --- |
| `--root`, `--verbose` | `check`, `query`, `graph`, `rules` |
| `--ignore`, `--history` | `check`, `query`, `graph` |
| `--format` | `check`, `query`, `diff` |
| `--graph-format`, `--documents-only` | `graph` |
| `--explain` | `rules` |
| `--ignore-ref`, `--family`, `--ignore-family`, `--baseline`, `--record-baseline`, `--ratchet`, `--rule`, `--strict`, `--max`, `--max-warnings`, `--color`, `--no-ascii` | `check` |
| `--no-config`, `--no-color`, `--ascii`, `--help`, `--version` | every command |

`--no-config`, `--no-color` and `--ascii` are taken by every command because
each is true already of a command with nothing to read it for: only a check
colours its report or draws a glyph, and `diff` reads no configuration. A
script can pass them to whatever it runs. `--color` and `--no-ascii` are a
check's alone: taken by a query, each would say the query drew what only a
check draws. The configuration file is not an option: `ignoreReferences` in
`.spec-graph.json` stops no `graph`, which draws the same graph with it as
without.

**There is no `--watch`.** A full run on this repository takes 60 ms, so the
loop that would justify a resident process is one line of shell, and it belongs
to whatever the developer already uses rather than to this tool:

```bash
npx --no-install @spec-family/spec-graph --format json | jq -r '.summary'
```

## Colour and glyphs

`--color` and `--no-color` decide, then the environment, in this order:
`NO_COLOR` set and not empty turns colour off; `FORCE_COLOR` set to exactly
`0` or exactly `false` turns it off, on a terminal too, and set to anything
else that is not empty turns it on; a `TERM` of `dumb` turns it off; otherwise
the report is coloured when stdout is a terminal. `CI` is not read.

`--ascii` draws the report in ASCII glyphs and `--no-ascii` in the Unicode
ones, `✖`, `⚠`, `↳` and the like, on any platform and whatever the
environment says. `--no-ascii` belongs to `check`, as `--color` does; a format
of a check that draws no glyph takes it all the same.

An option given beside its own opposite is refused, exit `2`, whichever of
the two comes first and in every format of a check:

```text
spec-graph: --color is given beside --no-color, and a report is coloured or it is not: give one of the two
spec-graph: --ascii is given beside --no-ascii, and the glyphs are drawn one way: give one of the two
```

The later of the two would decide and the earlier go unread, and a script
that adds `--no-color` to a line already holding `--color` would be told
nothing of which it got. Those are the two pairs the command line has; no
other option has an opposite to be given beside. Either of a pair alone wins
over the environment, which is what it is for, and the same option given
twice is that option once. A pair is refused with `--help` or `--version`
on the line as well.

Without either, `SPEC_GRAPH_ASCII` set to anything but `0`, `false` or nothing
asks for ASCII; and without that, a Windows console that sets neither
`WT_SESSION` nor `TERM_PROGRAM`, or sets them to nothing, gets ASCII and every
other terminal the Unicode glyphs. Where those two variables say nothing of
the terminal that draws the report, `--no-ascii` asks for the Unicode glyphs
outright.

## Visualising

```bash
spec-graph graph --documents-only --graph-format mermaid > graph.mmd
spec-graph graph --graph-format dot | dot -Tsvg > graph.svg
```

Nodes are coloured by phase, so an archived document with arrows still pointing
into it is visible at a glance. Hiding items lifts their relations onto the
owning document rather than dropping them.
