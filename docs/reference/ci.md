# In CI

The exit code is the contract: `0` clean, `1` findings, `2` the tool could not
run. That is all most pipelines need.

Every job below installs the project first, with `npm ci`, and gives `npx` the
package's [full name](../../README.md#names) behind `--no-install`: a job that lost its install
step then stops, where the command's name alone would fetch whatever package
has that name.

Beyond that, a format puts the findings where somebody will look:

| Format | Where the findings land |
| --- | --- |
| `--format sarif` | GitHub code scanning: comments on the changed lines |
| `--format github` | annotations on the diff, from the job's log, with no upload step |
| `--format gitlab` | the Code Quality report of a GitLab merge request |
| `--format markdown` | a table for the job summary, where reviewers look |
| `--format json` | a script or a bot of your own |

## Code scanning, with SARIF

For annotations on the diff rather than a line in a log, emit SARIF and hand it
to the uploader that already exists. The upload needs `security-events: write`,
and a job that declares its permissions has only those, so it names
`contents: read` for its checkout as well:

```yaml
permissions:
  contents: read
  security-events: write
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
    with:
      persist-credentials: false
  - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
    with:
      node-version: '24'
  - run: npm ci
  - run: npx --no-install @spec-family/spec-graph --format sarif > spec-graph.sarif
    continue-on-error: true
  - uses: github/codeql-action/upload-sarif@6f2ac81f5cd81fe351a197ba0b00d91d03cd2aee # v4.39.0
    with:
      sarif_file: spec-graph.sarif
```

The actions are pinned to commits, with the version beside each, because a tag
can be moved and a commit cannot; Dependabot's `github-actions` updates keep
pins like these current.

Findings land as comments on the changed lines, and they persist across commits
without drifting, because the `partialFingerprints` spec-graph writes are the
same identity a baseline is keyed on — the rule, the specification, and the
citation, with no line number in it (ADR-0012).

## Annotations, with `--format github`

Without code scanning, `--format github` writes one GitHub Actions workflow
command per finding, and the job's log turns each into an annotation on the
diff, with no upload step:

```yaml
- run: npx --no-install @spec-family/spec-graph --format github
```

```text
::error file=docs/adr/0003-event-log.md,line=13,title=ghost-handover::open obligation delegates to ADR-0002, which is retired. nothing will be read from ADR-0002 again - re-home this in a live document, or close it here
```

- An `error` finding is an `error`, a `warn` a `warning` and an `info` a
  `notice`, as spec-guard writes them, and one only `--strict` made an error is
  titled `ghost-handover (strict)`.
- The message carries the hint.
- `%` and line breaks are escaped everywhere, and `:` and `,` in the file and
  the title, as GitHub reads them.
- A clean run writes nothing.

## Code Quality, with `--format gitlab`

On GitLab, `--format gitlab` writes the Code Quality report a merge request
reads, and the merge request shows which findings it introduced and which it
resolved:

```yaml
spec-graph:
  script:
    - npm ci
    - npx --no-install @spec-family/spec-graph --format gitlab > gl-code-quality-report.json
  artifacts:
    when: always
    reports:
      codequality: gl-code-quality-report.json
```

Each finding is an issue:

- `check_name` is its rule, `description` its message and hint, and `location`
  its file and line.
- Severities map as `error` to `critical` - or `major` when only `--strict` made
  it an error - `warn` to `minor` and `info` to `info`.
- The `fingerprint` is a SHA-256 of the rule, the specification and what within
  it - a citation's target, or the document at the other end - which is what a
  baseline counts by. There is no line in it, so a finding a paragraph moved is
  not reported as new, and no message, so ticking one of three open boxes does
  not make an `orphaned-obligation` new either; the second of two findings
  identical in all three is told apart by its order.

`when: always` keeps the report when the job fails, which it does, with exit
`1`, whenever there is an error to report.

## A summary for reviewers, with `--format markdown`

`--format markdown` writes the same facts as a table, for the place reviewers
actually look:

```yaml
- name: Summarise the specification graph
  if: always()
  run: npx --no-install @spec-family/spec-graph --format markdown >> "$GITHUB_STEP_SUMMARY"
```

It leads with the verdict, counts the corpus, gives every finding its hint, and
*names* the baseline entries that no longer occur rather than counting them —
on a pull request a count is the one thing a reader cannot act on.

## JSON, for anything of your own

`--format json` is the machine-readable output to parse if you are building
something of your own: it carries the baseline note, the summary and the
per-file detail that SARIF and Code Quality have nowhere to put.

```yaml
- name: Check the specification graph
  run: npx --no-install @spec-family/spec-graph "docs/**/*.md" --format json > spec-graph.json
```

The JSON report is versioned, flat, and carries start and end positions for
every finding, so a bot can annotate a diff:

```json
{
  "version": 1,
  "ok": false,
  "summary": { "documents": 7, "items": 7, "edges": 18, "openObligations": 6, "errors": 5 },
  "diagnostics": [
    {
      "rule": "ghost-handover",
      "severity": "error",
      "message": "open obligation delegates to ADR-0002, which is retired",
      "hint": "nothing will be read from ADR-0002 again - re-home this in a live document, or close it here",
      "nodes": ["ADR-0003#open-questions.1", "ADR-0002"],
      "file": "docs/adr/0003-event-log.md",
      "line": 13,
      "column": 65,
      "related": [{ "file": "docs/adr/0002-single-node-storage.md", "line": 2, "note": "ADR-0002 is retired" }]
    }
  ]
}
```

## What a pull request changed

A check says what is wrong. `spec-graph diff` says what a pull request changed:
documents added, removed, moved or accepted, relations added or removed, and
obligations resolved or reopened. It compares two exports made by the same
binary, so CI makes one from the base branch and one from the pull request:

```yaml
- run: git fetch --depth 1 origin "$GITHUB_BASE_REF" && git worktree add ../base FETCH_HEAD
- run: npx --no-install @spec-family/spec-graph graph --root ../base --graph-format json > base.json
- run: npx --no-install @spec-family/spec-graph graph --graph-format json > head.json
- run: npx --no-install @spec-family/spec-graph diff base.json head.json --format markdown >> "$GITHUB_STEP_SUMMARY"
```

It names only what it can tell apart:

- A document keeps its id through a rename, so a moved document reads as moved.
- An obligation's id is its position in its section, so inserting a question
  renumbers every question below it. An obligation is therefore paired only by
  an id its author declared, or by its document, section and title when nothing
  else shares them.
- Anything unpaired is reported as having appeared or disappeared, never as
  resolved or reopened.
- A claim whose label changed is listed under Claims: raised, lowered, or
  relabelled where what its label means for work held. Name a claim with
  `@spec-item` and it is paired however its text changes; one with no name
  changes its text with its label, and reads as appeared and disappeared.
- Findings are left to `--baseline`, which already reports what is new.

Each export is read from where its path was typed, with a `\` a separator,
as a baseline is.

The exit code is `0` whether anything changed or not: a diff describes, and
`check` gates. See
[ADR-0020](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0020-a-diff-names-what-it-can-tell-apart.md).
