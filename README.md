# spec-graph

**Turn Markdown specifications into a verifiable relational graph.**

Your code has a compiler. Your specifications have nothing. `spec-graph` gives
them a type system: documents become nodes with a lifecycle, tasks become
obligations with real state, and citations become foreign keys that are actually
checked.

```text
✖ docs/adr/0003-event-log.md:13:65  ghost-handover
    open obligation delegates to ADR-0002, which is retired
    ↳ docs/adr/0002-single-node-storage.md:2:9  ADR-0002 is retired ("Superseded by ADR-0007")
    ↳ docs/adr/0003-event-log.md:13:1           the obligation: Which compaction policy do we use? Deferred to ADR-0002.
    → nothing will be read from ADR-0002 again - re-home this in a live document, or close it here
```

Exit code 1. The obligation was about to disappear.

The terms the spec-* tools share are defined in the family
[glossary](https://github.com/spec-family/spec-core/blob/main/docs/concepts.md),
and the [tutorial](https://github.com/spec-family/spec-core/blob/main/docs/tutorial.md)
takes one small repository through a round of work, from the brief to the
archive, in ten steps.

---

## Why this exists

Specifications rot in ways nobody notices, because nothing checks them.

**Ghost handovers.** An active decision defers an open question to a document
that was archived three months ago. The question is now nowhere. Nobody deleted
it; it just stopped existing.

**Stale premises.** A decision closes, but the sentence explaining the *original*
constraint stays in the text. Two quarters later a new design is still working
around a 4 KB row limit that was abolished in the rewrite. The premise is
disproven and still load-bearing.

**Fragile verification.** Teams reach for `grep -r '\- \[ \]'`. It breaks on
wrapped lines, matches inside code samples, harvests `adr-0007` out of a URL, and
cannot tell an open question from one that was narrowed, satisfied, or
consciously accepted as debt.

**Broken reference graphs.** `ADR-0009` is cited forty times and has never
existed.

Every one of these is a *relational* defect. They are invisible when you read one
document and obvious when you can query all of them at once.

## Quickstart

```bash
npm install --save-dev @spec-family/spec-graph
npx --no-install @spec-family/spec-graph
```

No configuration, no annotations, no migration. It reads what your repository
already looks like. On a repository of three ADRs, one of which cites an ADR
nobody wrote and defers its open question to one that was superseded, it
prints:

```text
spec-graph 3 documents · 1 item · 3 relations · 1 open

✖ docs/adr/0003-event-log.md:9:57  broken-reference
    "0009-retention.md" does not resolve to any document
    → fix the identifier, or add the document it names

✖ docs/adr/0003-event-log.md:13:65  ghost-handover
    open obligation delegates to ADR-0002, which is retired
    ↳ docs/adr/0002-single-node-storage.md:2:9  ADR-0002 is retired ("Superseded by ADR-0007")
    ↳ docs/adr/0003-event-log.md:13:1           the obligation: Which compaction policy do we use? Deferred to ADR-0002.
    → nothing will be read from ADR-0002 again - re-home this in a live document, or close it here

2 errors · 22.86ms
✖ the specification graph is inconsistent
```

and exits `1`. Where the documents are not where it looks by default, name
them:

```bash
npx --no-install @spec-family/spec-graph "docs/**/*.md"
```

## Names

The package is `@spec-family/spec-graph`, and the command it installs is
`spec-graph`. The name without the scope is not this project: on npm,
`spec-graph` belonged to nobody on 2026-10-07, and whoever registers it decides
what it runs.

`npx` fetches and runs the package of whatever name it is given when the
project has none installed - a fresh clone, a worktree before `npm ci`, a CI job
without the install step - and without a terminal it does not ask first. So
give `npx` the full name:

- `npx --no-install @spec-family/spec-graph` in a project that installed it: it
  runs that install, the version the lockfile pins, and where there is none it
  stops with an error that names this package.
- `npx @spec-family/spec-graph`, without `--no-install`, where nothing is
  installed: it fetches this package and runs it.

<!-- bare-name: the two forms in the next sentence are shown as what not to write -->
Never `npx spec-graph`, and not `npx --no-install spec-graph` either:
`--no-install` stops a download, and npm still runs a copy of the bare name's
package that an earlier fetch left in its cache. The family's
[adopting guide](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md#names)
has what was measured, under npm 10, 11 and 12.

Where this page writes the command alone, as in `spec-graph query ...`, it is
what a `package.json` script holds - npm fetches nothing for a script - and what
follows `npx --no-install @spec-family/` at a prompt.

## What it checks

| Rule | Default | What it catches |
| --- | --- | --- |
| `ghost-handover` | error | An open obligation handed to a document that can no longer absorb it |
| `stale-premise` | error | A live document resting on a decision that was retired or obviated |
| `broken-reference` | error | A citation naming a document or anchor that does not exist |
| `circular-delegation` | error | Obligations in a cycle, so none can ever land, or supersessions in a cycle - not a loop that takes one of each to close, such as a superseded document handing its question to what replaced it |
| `orphaned-obligation` | error | A retired or frozen document still holding open work - not a question it delegated to a document still taking work |
| `live-supersession` | error | A superseded document still presenting itself as current |
| `reference-outside-corpus` | warn | A citation naming a real document the include patterns did not reach |
| `ambiguous-reference` | warn | A citation matching more than one document |
| `unreciprocated-supersession` | warn | A retired document that never says what replaced it |
| `state-conflict` | warn | An item whose two state signals disagree about whether work remains |
| `unknown-relation-key` | warn | A front-matter key one edit from a relation, carrying what looks like a citation |
| `self-reference` | info | A document delegating to, or depending on, itself |
| `unevidenced-completion` | error | An item a checklist marks done that cites no claim and names no commit, where `checklists` is configured |
| `premature-completion` | error | An item marked done that cites a claim whose label leaves work open, where `checklists` or `ledgers` is configured |
| `unknown-commit` | error | A checklist, a ledger or a register naming a commit the history of its ref does not hold |
| `duplicate-key` | error | A key a configured register gives to a second row, which the graph leaves out |
| `unknown-register-status` | error | A row of a configured register with no status, or one the configuration does not know |
| `incomplete-register-row` | error | A row of a configured register that lacks what its status asks for |
| `incomplete-protocol` | error | A measurement protocol that lacks a field the configuration asks of it |
| `undated-result` | error | A measurement protocol whose result names no date and does not say none yet |
| `target-without-protocol` | error | A claim whose label asks for a measurement and cites no protocol |
| `unrecorded-figure` | error | A figure marked `@spec-figure` that names no record, or one with no dated result |
| `missing-path` | error | A path an orientation document names in a code span that the repository does not hold |
| `missing-command` | error | A script, target or recipe an orientation document runs in a code span that its `package.json`, Makefile or justfile does not declare |

`--rule self-reference=off` overrides one, and once a repository is clean,
`--strict` raises every warning to an error. [Rules](docs/reference/rules.md)
has the decision behind each rule and what `--strict` leaves alone, and
`spec-graph query` finds anything a rule can: the rules are
[selectors](docs/reference/query-language.md), and a selector with a sentence
in the configuration is a rule of your own.

What the rules stand on, each in the reference:

- **[Lifecycle](docs/reference/lifecycle.md).** Every ecosystem's status
  words map onto four phases - draft, active, frozen, retired - read from
  front matter, a `## Status` section, a status table, a `Status:` line or an
  `archive/` directory. A status it does not know is `unknown`, never a guess.
- **[Obligations](docs/reference/obligations.md).** A checkbox, a prose
  marker, strikethrough, a directive and the enclosing section each say
  whether work remains. The most specific wins, a disagreement is a
  `state-conflict`, and there are seven dispositions, not two.
- **[References](docs/reference/references.md).** A link, a wiki link, a
  front-matter field and a bare `ADR-0007` in prose reach the same document.
  What is written deliberately is validated; a bare identifier only where its
  family exists, and code never counts.
- **[Relations](docs/reference/relations.md).** `supersedes`, `depends-on`,
  `delegates-to` and the rest, from front matter, from the phrase beside a
  link, and from directives. A "See also" link carries no weight and is never
  reported.
- **[Registers](docs/reference/registers.md).** A section or a table row with
  an identifier and a status is a specification of its own, so one file can
  hold dozens.
- **[Spec Kit, OpenSpec and Kiro](docs/reference/sdd-layouts.md)**, read as
  they lay their files out, with no configuration.
- **[Claims and their evidence](docs/reference/claims-and-evidence.md),
  [orientation documents](docs/reference/orientation.md).** Where the
  configuration names them: claims and their labels, checklists and ledgers
  held to what they cite, figures to a dated measurement, commits to git, and
  the paths and commands an agent's instructions name to the repository.
- **[Directives](docs/reference/directives.md)** override any of it, in a
  comment no renderer shows, and **[journals](docs/reference/journals.md)**
  are records, never held to a lifecycle they never had.

## Configuration

None is needed. Anything you repeat on every run belongs to the repository:
spec-graph reads the first of `.spec-graph.json`, `spec-graph.config.json` or a
`"spec-graph"` key in `package.json`, looked for upward from where it runs.

```json
{
  "patterns": ["docs/**/*.md"],
  "baseline": ".spec-graph-baseline.json"
}
```

On a repository that predates it, record what is already wrong, and the build
fails only on what is new:

```bash
spec-graph check --record-baseline .spec-graph-baseline.json
```

[Configuration](docs/reference/configuration.md) has every key, the patterns
and the families, and
[adopting it on a repository that predates it](docs/reference/baseline.md) the
baseline and its ratchet.

## In CI

The exit code is the contract: `0` clean, `1` findings, `2` the tool could not
run. Install the project, and give `npx` the package's [full name](#names):

```yaml
permissions:
  contents: read
jobs:
  spec-graph:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: '24'
      - run: npm ci
      - run: npx --no-install @spec-family/spec-graph --format github
```

`--format github` turns each finding into an annotation on the diff. `sarif`,
`gitlab`, `markdown` and `json` put the findings in code scanning, a GitLab
merge request, the job summary or a script of your own, and `spec-graph diff`
says what a pull request changed: [In CI](docs/reference/ci.md).

## Design

Thirty-one [ADRs](docs/reference/README.md#decisions), which `spec-graph`
validates on every CI run, carry the reasoning.

**Zero runtime dependencies.** Node 22+, native ESM, TypeScript strict with
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. The Markdown
scanner, the front-matter reader, the glob matcher, the query parser and the
regular-expression matcher behind `~=` are all written here or in
[spec-core](https://github.com/spec-family/spec-core), the library the spec-*
tools share, whose code is copied into `src/vendor/` and checked by hash rather
than installed. So the whole package is auditable in an afternoon — and nothing
in the pipeline can take longer than its input.

**Verified, not just covered.** 2,857 tests; 99.57% statement and 99.85% line
coverage. Coverage says a line ran, so the suite is also held to a mutation
score - 97.27% over 11,535 mutants, measured by CI's full sweep, and a build
fails under 93 - because a vocabulary entry or a boundary
condition can be weakened by an ordinary-looking refactor without a single test
going red. [ADR-0007](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0007-mutation-testing.md) is straight about what
that number is and is not.

**Fast enough to run on save.** A synthetic corpus of 2,000 documents — 8.9 MB,
6,000 obligations, 12,285 relations — is read, parsed, resolved and checked in
about 1.3 seconds on a laptop, roughly a third of which is file I/O. A typical
repository with a few dozen ADRs finishes in tens of milliseconds.

## Reference and guides

The [reference](docs/reference/README.md), shipped in the package, has every
rule, status word, marker, relation, directive, selector, configuration key,
option and output format, a topic to a page:

- what it reads: [lifecycle](docs/reference/lifecycle.md),
  [obligations](docs/reference/obligations.md),
  [references](docs/reference/references.md),
  [relations](docs/reference/relations.md),
  [registers](docs/reference/registers.md),
  [Spec Kit, OpenSpec and Kiro](docs/reference/sdd-layouts.md),
  [claims and their evidence](docs/reference/claims-and-evidence.md),
  [orientation documents](docs/reference/orientation.md),
  [directives](docs/reference/directives.md),
  [journals](docs/reference/journals.md);
- how to run it: [rules](docs/reference/rules.md),
  [the query language](docs/reference/query-language.md),
  [baselines](docs/reference/baseline.md),
  [configuration](docs/reference/configuration.md),
  [the CLI](docs/reference/cli.md), [CI](docs/reference/ci.md), the
  [API](docs/reference/api.md).

The family's guides are spec-core's: the
[tutorial](https://github.com/spec-family/spec-core/blob/main/docs/tutorial.md)
takes a repository through a round of work,
[adopting](https://github.com/spec-family/spec-core/blob/main/docs/adopting.md)
brings the tools to a repository with a history, and the
[glossary](https://github.com/spec-family/spec-core/blob/main/docs/concepts.md)
defines the terms they share.

## Relationship to spec-guard

[`spec-guard`](https://github.com/spec-family/spec-guard) checks the **vertical**
dimension: whether your source code still honours what a specification claims
about it.

```md
<!-- @assert-absence target="src/services" symbol="LegacyPaymentGateway" -->
```

`spec-graph` checks the **horizontal** dimension: whether your specifications are
consistent with *each other*. They share conventions and a philosophy, compose
cleanly, and neither requires the other.

## Contributing

How to build, test and release spec-graph, and where a change usually goes, is
in [CONTRIBUTING.md](https://github.com/spec-family/spec-graph/blob/main/CONTRIBUTING.md).
Report a vulnerability privately, as
[SECURITY.md](https://github.com/spec-family/spec-graph/blob/main/SECURITY.md)
describes, and not in a public issue.

## Licence

MIT
