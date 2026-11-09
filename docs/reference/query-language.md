# The query language

The two flagship rules are not hand-written traversals. They are selectors,
parsed at startup:

```text
ghost-handover   *[openness!=closed][phase!=retired] -delegates-to,blocked-by-> *[receptivity=sealed]
stale-premise    *[phase!=retired] -depends-on,assumes,amends,blocked-by-> document[phase=retired]
```

Which means anything a built-in rule can find, you can find too:

```bash
# What open work is stranded in documents nobody reads?
spec-graph query 'document[receptivity=sealed] -contains-> item[openness!=closed]'

# Which accepted decisions rest on a draft?
spec-graph query 'document[phase=active] -depends-on-> document[phase=draft]'

# What did ADR-0009 replace, transitively?
spec-graph query 'document[id=ADR-0009] =supersedes=> document'

# Where is our accepted technical debt?
spec-graph query 'item[state=accepted-debt]'
```

`query` exits non-zero when nothing matches, so a team convention becomes a build
gate without writing any code:

```yaml
- name: No PRD may depend on a draft decision
  run: |
    ! npx --no-install @spec-family/spec-graph query 'document[path^=docs/prd] -depends-on-> document[phase=draft]'
```

That shell line is a rule wearing a disguise. Give it a name and a sentence and
it becomes one — see [your own rules](#your-own-rules) below.

**Grammar**

```text
document[phase=active] -delegates-to-> item[openness=open]
└──────┘└────────────┘ └─────────────┘ └─────────────────┘
  node    predicate       relation            node

Node types   document · item · *        (also documents docs doc items nodes node any)
Attributes   id kind title path file line phase status receptivity alias
             document state (or disposition) openness section text body
             evidence conflicted label fm.<front-matter-key>
Operators    =  !=  ^=  $=  *=  ~=   and [attr] for "is present"
Relations    -kind->   <-kind-   =kind=>   <=kind=      (= forms are transitive)
             comma-separate kinds: -assumes,depends-on->
```

Items inherit their document's lifecycle - `phase`, `receptivity`, `status` - and
answer to its `path` and its `alias` spellings, so `item[phase=retired]` means
what you expect. A query evaluates to **paths**, not endpoints, which is why a
finding can name both ends and the line that connects them, and `query` prints
each one the way the selector reads, every document a transitive step passed
through included.

`~=` is a regular expression matched by an automaton that cannot backtrack, so a
predicate is linear in the subject whatever the pattern — `^([A-Za-z0-9_]+[ ]?)+$`
against a fifty-four-character title takes `RegExp` 103 seconds and this 13
microseconds. It reads the usual syntax minus backreferences and lookaround,
which are not regular; both are refused when the selector is read, with the
character pointed at. The automaton is spec-core's, the library the spec-* tools
share, copied into this package rather than installed, and so is the one
[globs](configuration.md#patterns) are matched by. See
[ADR-0017](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0017-a-predicate-must-finish.md).

On a register, a region answers its file's front matter for every descriptive
key — `fm.owner` on a decision inside a register is the register's owner — while
the keys a region owns itself, its identifier and status and title, and any key
that declares a relation, stay on the file. See
[ADR-0009](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0009-a-specification-is-a-region.md).

## Your own rules

A convention spec-graph never anticipated is a selector plus a sentence. Write
both in the config file and it becomes a rule like any other:

```json
{
  "rules": {
    "no-draft-dependency": {
      "query": "document[phase=active] -depends-on-> document[phase=draft]",
      "message": "{0} depends on {1}, which is still a draft",
      "hint": "wait for {1} to be accepted, or drop it from {0.path}",
      "severity": "error"
    }
  }
}
```

```text
x docs/adr/0002-delivery.md:4:13  project:no-draft-dependency
    ADR-0002 depends on ADR-0001, which is still a draft
    > wait for ADR-0001 to be accepted, or drop it from docs/adr/0002-delivery.md
```

The finding points at the line that *declares* the relation, because that is
where a human goes to change the answer — the same discipline every built-in
follows.

| Field | |
|---|---|
| `query` | One selector, or a list of them read as a union. |
| `message` | The headline. `{0}` is the first node on the path, `{1}` the next; `{1.phase}` and `{0.fm.owner}` read any selector attribute. |
| `hint` | The next action. Optional, templated the same way. |
| `severity` | `error`, `warn`, `info` or `off`. Defaults to `warn`. |

It defaults to `warn` on purpose: a rule a team has just written has not yet
earned the right to fail their build, and the first run of a new convention is
when it is most likely to be wrong.

The id is the name with `project:` in front, which is why it can never collide
with a built-in — and why everything else already works. It is baselined by
`--record-baseline`, silenced by `--rule project:no-draft-dependency=off`,
escalated by `--strict`, listed by `spec-graph rules`, exempted on journals like
every other rule about obligations, and emitted as a first-class `ruleId` in
SARIF, where a project rule describes itself by the selector it is.

To see what a rule matches without copying its selector back out of the file:

```bash
spec-graph query project:no-draft-dependency --verbose
```

Mistakes are reported when the file is read, not discovered as a rule that
quietly finds nothing:

```text
spec-graph: .spec-graph.json: rules.no-drafts: mismatched arrow: use -kind-> for
  one hop or =kind=> for transitive (at character 10)
spec-graph: .spec-graph.json: rules.owner: "{1.phse}" asks for an attribute
  nothing has
```

See [ADR-0016](https://github.com/spec-family/spec-graph/blob/main/docs/adr/0016-a-query-needs-a-sentence.md).
