# Obligations, with real state

A checkbox is the *least* reliable thing a document says about a task:

```md
- [ ] Should the write path shard before the migration?
      **Resolved (2026-03):** no — one node holds three years of growth.
```

`grep '\- \[ \]'` re-opens a settled debate. `grep '\- \[x\]'` misses it. Both
are confidently wrong.

`spec-graph` reads every signal — a directive, a prose marker, strikethrough, the
checkbox, the enclosing section — lets the most specific one win, and **reports
the disagreement** as `state-conflict` rather than hiding it.

Obligations have seven dispositions, not two:

| Disposition | Work remains? | Written as |
| --- | --- | --- |
| `unresolved` | open | `- [ ]`, under `## Open Questions` |
| `narrowed` | partial | `- [~]`, `**Narrowed:** only the payment path` |
| `delegated` | open | `**Tracked in** …`, `deferred to …` |
| `satisfied` | closed | `- [x]`, `**Resolved:**`, `~~struck through~~` |
| `accepted-debt` | closed | `**Accepted debt:**`, `**Won't fix:**` |
| `rejected` | closed | `- [-]`, `**Rejected:**` |
| `obviated` | closed | `**Moot** — the limit was removed in v9` |

`obviated` is the one that matters most: it is the marker that turns every
load-bearing citation of that item into a stale premise.

Markers only count in the forms documents actually use — punctuated
(`Resolved:`), emphasised (`**Moot**`) or shouted (`RESOLVED`) — and never inside
code. *"We resolved to keep the queue"* does not close anything.

<details>
<summary>Every checkbox, marker and <code>state=</code> word</summary>

| Disposition | Checkboxes | Markers | `state=` |
| --- | --- | --- | --- |
| `unresolved` | `[ ]` `[?]` `[!]` `[*]` | `unresolved`, `still open`, `open question`, `tbd`, `undecided`, `reopened` | `open`, `unresolved`, `todo` |
| `narrowed` | `[~]` `[/]` | `partially resolved`, `partially answered`, `partially done`, `partly resolved`, `narrowed`, `narrowed to`, `scoped down`, `reduced scope`, `reduced to`, `partial`, `in progress`, `in_progress`, `remaining`, `split` | `narrowed`, `partial` |
| `delegated` | | `delegated`, `delegated to`, `moved to`, `tracked in`, `tracked by`, `handed off`, `handed off to`, `handed to`, `deferred to`, `follow up in`, `follow-up in`, `followup in`, `continued in`, `owned by` | `delegated` |
| `satisfied` | `[x]` `[X]` `[+]` | `resolved`, `answered`, `decided`, `settled`, `done`, `complete`, `completed`, `closed`, `fixed`, `shipped`, `addressed`, `implemented`, `solved`, `confirmed` | `satisfied`, `resolved`, `done`, `closed` |
| `accepted-debt` | | `accepted debt`, `accepted as debt`, `accepted risk`, `known limitation`, `known issue`, `known gap`, `technical debt`, `tech debt`, `wontfix`, `won't fix`, `won’t fix`, `will not fix`, `by design`, `tolerated`, `living with it` | `accepted-debt`, `debt`, `wontfix` |
| `rejected` | `[-]` | `rejected`, `declined`, `dropped`, `not doing`, `will not do`, `abandoned`, `cancelled`, `canceled`, `withdrawn` | `rejected`, `declined` |
| `obviated` | | `no longer applicable`, `no longer relevant`, `no longer needed`, `overtaken by events`, `premise invalid`, `obviated`, `obsolete`, `not applicable`, `moot`, `void`, `n/a`, `obe` | `obviated`, `moot` |

Where a marker counts, and how it may be written:

- A marker counts where a statement starts: at the start of the item or of a
  line, after the end of a sentence, or after `(` or `[`.
- Punctuated means followed by `:`, `：`, `-`, `–`, `—` or `.`, so `Done.`
  closes an item; emphasised means the emphasis closes on the marker, so
  `**Closed beta**` does not.
- A marker of more than one word may be spaced, hyphenated or joined by an
  underscore, whichever the table has: `**Tech-debt:**` and `TECH_DEBT:` are
  `tech debt`. An apostrophe may be straight or curly.

</details>

Without a box, a bullet is an obligation only at the top level of a section
whose heading names open work, however the heading is cased, spaced, emphasised
or punctuated - `## ❓ **Open questions:**` is one. The section ends at the next
heading of its level. Every other bullet is the document's own prose.

**Headings that hold obligations:** `Open Questions`, `Open Question`,
`Unresolved Questions`, `Unanswered Questions`, `Questions`, `Open Issues`,
`Action Items`, `Actions`, `TODO`, `To Do`, `To-Do`, `TODOs`, `Next Steps`,
`Follow Ups`, `Follow-Ups`, `Followups`, `Follow Up`, `Follow-Up`,
`Unresolved`, `Outstanding`, `Outstanding Questions`, `Tasks`, `Task List`,
`Work Items`, `Remaining Work`, `Decisions Needed`, `Blockers`, `Parking Lot`,
`Future Work`, `Deferred`.
