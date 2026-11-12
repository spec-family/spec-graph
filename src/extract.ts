/**
 * Document extraction: Markdown in, graph fragments out.
 *
 * This module is where domain-agnosticism is won or lost. It never requires a
 * repository to adopt a syntax. It reads what teams already write - front
 * matter, a `## Status` section, a checklist under `## Open Questions`, a link
 * that says "deferred to ADR-0011" - and turns each into a typed relation with a
 * source position.
 *
 * The one rule it holds to everywhere: **an inference that cannot be justified
 * is not made.** An unrecognised status becomes `unknown`, not a guess. A link
 * with no governing verb becomes a neutral `references`, not a dependency. Bare
 * identifiers found in prose are opportunistic and are dropped silently when
 * they do not resolve, because the alternative is reporting `SHA-256` as a
 * broken reference to specification 256.
 */

import { commandIn } from './commands.js';
import { attr, attrList, bindItemDirectives, parseDirectives, type Directive } from './directives.js';
import {
  identify,
  isDocumentTarget,
  isExternal,
  looksLikePath,
  normaliseRef,
  parsePrefixedRef,
  withinOneEdit,
  type DocumentIdentity,
  ID_KEYS,
  NOT_A_FAMILY_OF_DOCUMENTS,
} from './identity.js';
import { isStatusHeading, isTemplateFile, opensRetired, phaseFromPath, phaseOf, STATUS_KEYS, supersessionTargetsIn } from './lifecycle.js';
import {
  anchorsOf,
  findClaims,
  findCommitReferences,
  isMarkdownLine,
  isOnlyComment,
  referenceLinks,
  scanMarkdown,
  slugify,
  type Heading,
  type Link,
  type ListItem,
  type ScannedDocument,
  type TableCell,
  type TableRow,
} from './markdown.js';
import {
  cellText,
  findSpecificationRegions,
  isRegisterTable,
  opensHeading,
  regionAt,
  statusColumnOf,
  type SpecificationRegion,
} from './sections.js';
import { dispositionOfWord, resolveItemState } from './state.js';
import { refOf, type LineIndex } from './source.js';
import {
  EDGE_KINDS,
  OPENNESS_OF,
  type CommitCitation,
  type Disposition,
  type Figure,
  type Protocol,
  type RegisterRow,
  type DocumentNode,
  type EdgeKind,
  type EdgeOrigin,
  type ItemNode,
  type MisreadKey,
  type ParseProblem,
  type CommandMention,
  type PathMention,
  type Phase,
  type SourceRef,
  type StateSignal,
} from './types.js';
import { readEntries, toRecord, valuesOf, type YamlEntry } from './yaml.js';

/* -------------------------------------------------------------------------- */
/* Output                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A relation that has been read but not yet resolved to a target node.
 *
 * Resolution needs the whole corpus, so extraction stops at the raw target text.
 */
export interface ReferenceCandidate {
  readonly kind: EdgeKind;
  /** Id of the node the relation was written on. */
  readonly from: string;
  /** The target exactly as written: a path, an identifier, or a URL. */
  readonly target: string;
  readonly origin: EdgeOrigin;
  readonly declaredAt: SourceRef;
  readonly raw: string;
  /**
   * When true the relation runs `target -> from`.
   *
   * `superseded-by: ADR-0009` written in ADR-0003 declares that *ADR-0009*
   * supersedes ADR-0003. The edge belongs to ADR-0009; the line a human must go
   * and fix is in ADR-0003, which is why `declaredAt` is tracked separately.
   */
  readonly inverted: boolean;
  /**
   * Opportunistic references are dropped in silence when they do not resolve.
   * Only deliberate ones - links, front matter, directives - are reported.
   */
  readonly opportunistic: boolean;
}

export interface ExtractedDocument {
  readonly document: DocumentNode;
  readonly items: readonly ItemNode[];
  readonly references: readonly ReferenceCandidate[];
  readonly problems: readonly ParseProblem[];
  /**
   * Front-matter keys that read as relations and declared none.
   *
   * Kept apart from `problems` because a problem is about the text and this is
   * about the graph: the edge the author wrote down is not in it.
   */
  readonly misreadKeys: readonly MisreadKey[];
  /** Heading slugs and GitHub's anchors, for resolving `#anchor` references into this document. */
  readonly anchors: ReadonlySet<string>;
  /**
   * The commits the file names, each with the node it is written in. Held by
   * the file's own extraction alone, since its regions are in the same text
   * (ADR-0025).
   */
  readonly commits: readonly CommitCitation[];
  /** The row's cells, where this specification is a register's row kept as a table (ADR-0027). */
  readonly row: RegisterRow | null;
  /** The measurement protocols the file writes, held by the file's own extraction (ADR-0028). */
  readonly protocols: readonly Protocol[];
  /** The figures the file marks, held by the file's own extraction (ADR-0028). */
  readonly figures: readonly Figure[];
  /** The paths the file names, where it orients a reader, held by the file's own extraction (ADR-0029). */
  readonly paths: readonly PathMention[];
  /** The paths `@spec-path` says the file may name that the repository does not hold, as written. */
  readonly pathsAllowed: readonly string[];
  /** The commands the file names, where it orients a reader, one per name each runs (ADR-0029). */
  readonly commands: readonly CommandMention[];
  /** The names `@spec-command` says the file may name that no manifest declares: its work adds them, or they are not there. */
  readonly commandsAllowed: readonly string[];
  readonly identity: DocumentIdentity;
  readonly scanned: ScannedDocument;
  /**
   * Specifications declared inside this file, each a document in its own right.
   *
   * Empty for the ordinary one-file-per-decision layout, which is why nothing
   * downstream had to change to support registers.
   */
  readonly subSpecifications: readonly ExtractedDocument[];
  /**
   * The file-level specification this one is a region of, if any.
   *
   * Recorded so the register's structure is a relation in the graph rather than
   * an accident of which offsets fall inside which: "what decisions does this
   * register hold" is a question worth being able to ask.
   */
  readonly containerId: string | null;
}

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Front-matter keys that declare a relation, and what they mean.
 *
 * Every directional kind is spelled in **both** directions. A register that
 * records `depends-on` but not `depended-on-by` is not a smaller vocabulary, it
 * is a trap: the author writes the inverse, the key means nothing, and the edge
 * they declared is missing from a graph that reports itself as consistent. Which
 * half of a pair a repository writes is a filing convention, and a filing
 * convention is not something a linter gets to have an opinion about.
 *
 * `relates-to` is the exception, and it is not one: the relation is symmetric,
 * so it has no other direction to spell. `contains` is structural and never
 * written by hand. `tests/parsing.test.ts` holds both facts to the fire.
 */
export const RELATION_KEYS: Readonly<Record<string, { kind: EdgeKind; inverted: boolean }>> = {
  supersedes: { kind: 'supersedes', inverted: false },
  supercedes: { kind: 'supersedes', inverted: false },
  replaces: { kind: 'supersedes', inverted: false },
  obsoletes: { kind: 'supersedes', inverted: false },
  deprecates: { kind: 'supersedes', inverted: false },
  'superseded-by': { kind: 'supersedes', inverted: true },
  'superceded-by': { kind: 'supersedes', inverted: true },
  'replaced-by': { kind: 'supersedes', inverted: true },
  'obsoleted-by': { kind: 'supersedes', inverted: true },
  'deprecated-by': { kind: 'supersedes', inverted: true },
  'rolled-into': { kind: 'supersedes', inverted: true },
  amends: { kind: 'amends', inverted: false },
  extends: { kind: 'amends', inverted: false },
  refines: { kind: 'amends', inverted: false },
  clarifies: { kind: 'amends', inverted: false },
  revises: { kind: 'amends', inverted: false },
  'amended-by': { kind: 'amends', inverted: true },
  'extended-by': { kind: 'amends', inverted: true },
  'refined-by': { kind: 'amends', inverted: true },
  'clarified-by': { kind: 'amends', inverted: true },
  'revised-by': { kind: 'amends', inverted: true },
  'depends-on': { kind: 'depends-on', inverted: false },
  'dependent-on': { kind: 'depends-on', inverted: false },
  dependencies: { kind: 'depends-on', inverted: false },
  requires: { kind: 'depends-on', inverted: false },
  'builds-on': { kind: 'depends-on', inverted: false },
  'relies-on': { kind: 'depends-on', inverted: false },
  'depended-on-by': { kind: 'depends-on', inverted: true },
  'required-by': { kind: 'depends-on', inverted: true },
  dependents: { kind: 'depends-on', inverted: true },
  assumes: { kind: 'assumes', inverted: false },
  'assumed-by': { kind: 'assumes', inverted: true },
  'blocked-by': { kind: 'blocked-by', inverted: false },
  'blocked-on': { kind: 'blocked-by', inverted: false },
  'waiting-on': { kind: 'blocked-by', inverted: false },
  'waiting-for': { kind: 'blocked-by', inverted: false },
  'gated-on': { kind: 'blocked-by', inverted: false },
  'gated-by': { kind: 'blocked-by', inverted: false },
  blocks: { kind: 'blocked-by', inverted: true },
  'delegates-to': { kind: 'delegates-to', inverted: false },
  'delegated-to': { kind: 'delegates-to', inverted: false },
  'deferred-to': { kind: 'delegates-to', inverted: false },
  'tracked-in': { kind: 'delegates-to', inverted: false },
  'tracked-by': { kind: 'delegates-to', inverted: false },
  'continued-in': { kind: 'delegates-to', inverted: false },
  'delegated-from': { kind: 'delegates-to', inverted: true },
  related: { kind: 'relates-to', inverted: false },
  'relates-to': { kind: 'relates-to', inverted: false },
  'related-to': { kind: 'relates-to', inverted: false },
  'see-also': { kind: 'relates-to', inverted: false },
  references: { kind: 'references', inverted: false },
  reference: { kind: 'references', inverted: false },
  refs: { kind: 'references', inverted: false },
  'referenced-by': { kind: 'references', inverted: true },
};

/**
 * True when a front-matter value is shaped like a citation.
 *
 * The second half of the gate on {@link misreadRelationKeys}, and the half that
 * does the work. `sidebar_position: 4` and `ref: main` are a hair away from a
 * relation key by spelling alone; neither carries anything that could name a
 * document, and reporting them would make the rule an irritation rather than a
 * catch (ADR-0006).
 */
function looksLikeCitation(value: string): boolean {
  // A blank value needs no case of its own: it is neither an identifier nor a
  // path, so both tests below already answer no.
  const trimmed = value.trim();
  if (parsePrefixedRef(trimmed) !== null) return true;
  return looksLikePath(trimmed) && isDocumentTarget(trimmed) && !isExternal(trimmed);
}

/**
 * Front-matter keys that read as relations and declare none.
 *
 * Front matter is an open vocabulary and most of what lives there is nobody
 * else's business, so the bar is deliberately high: the key has to be one edit
 * from a relation key *and* carry something that could name a document. Both
 * conditions together are what separates `dependson: ADR-0001`, which is an edge
 * the author believes exists, from `description: ...`, which is a title.
 */
function misreadRelationKeys(
  byKey: ReadonlyMap<string, YamlEntry>,
  from: string,
  at: (start: number, end: number) => SourceRef,
): MisreadKey[] {
  const out: MisreadKey[] = [];
  for (const [key, entry] of byKey) {
    const folded = foldRelationKey(key);
    // A key of nothing but punctuation folds to nothing. The shortest relation
    // key folds to four letters, so the edit test below would pass it over too
    // and no test can see this half; it keeps that true for any future key.
    if (folded.length === 0 || RELATION_INDEX.has(folded)) continue;
    if (!valuesOf(entry).some(looksLikeCitation)) continue;
    const near = [...RELATION_INDEX.values()]
      .filter((relation) => withinOneEdit(folded, foldRelationKey(relation.canonical)))
      .map((relation) => relation.canonical);
    if (near.length === 0) continue;
    out.push({ key, suggestion: near.join(', '), from, at: at(entry.start, entry.end) });
  }
  return out;
}

/**
 * Folds a front-matter key to its lookup form.
 *
 * `depends-on`, `depends_on`, `dependsOn` and `Depends On` are one key written
 * four ways, and which one a repository uses is decided by whatever wrote the
 * front matter first. Dropping every separator collapses them - the YAML reader
 * has already lower-cased the key, which is what makes camel case fold too.
 *
 * Which case this folds to is arbitrary and no test pins it: both sides of every
 * comparison come through here, so upper would work exactly as well. Asserting
 * on it would be asserting on the implementation.
 */
export function foldRelationKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** The vocabulary above, indexed by folded key. */
const RELATION_INDEX: ReadonlyMap<string, { kind: EdgeKind; inverted: boolean; canonical: string }> = new Map(
  Object.entries(RELATION_KEYS).map(([canonical, relation]) => [
    foldRelationKey(canonical),
    { ...relation, canonical },
  ]),
);

/**
 * Whether a front-matter key is one the graph is built from: a status, an id
 * or an alias, or a relation. Left unread, each changes a verdict - a status
 * is unknown, a node is named by its path, an edge is missing. A title or a
 * description left unread changes a label.
 */
function buildsGraph(key: string): boolean {
  return (
    STATUS_KEYS.includes(key) ||
    ID_KEYS.includes(key) ||
    key === 'alias' ||
    key === 'aliases' ||
    RELATION_INDEX.has(foldRelationKey(key))
  );
}

/**
 * Keys a region must answer for itself, so the file's answer cannot shadow one.
 *
 * Identity and status and title are the three things a register exists to vary
 * row by row. The rest of the file's front matter describes the file, and a
 * decision inside the file is described by it too.
 */
const UNINHERITED: ReadonlySet<string> = new Set([...ID_KEYS, ...STATUS_KEYS, 'title', 'alias', 'aliases']);

/**
 * The front matter a region inherits from the file that contains it.
 *
 * [ADR-0009](../docs/adr/0009-a-specification-is-a-region.md) left this open,
 * and [ADR-0016](../docs/adr/0016-a-query-needs-a-sentence.md) made leaving it
 * open a defect. A repository can now write `document[fm.owner!=platform]` as a
 * rule of its own, and on a register every region answered nothing - which
 * `!=` reads as a mismatch, because an absent value is not the value. A file
 * whose front matter said `owner: platform` was reported twice for not being
 * owned by platform, and the message rendered `{0.fm.owner}` as the literal
 * placeholder. Confident, wrong, and unanswerable: the ADR-0006 failure.
 *
 * Two kinds of key stay behind. A relation key is a claim the file made -
 * `supersedes:` at the top of a register supersedes on behalf of the register,
 * not on behalf of each decision in it, and the edges were built from the
 * file's entries before this ran. And a key the region answers itself must not
 * be shadowed, which is {@link UNINHERITED}.
 */
export function inheritableFrontMatter(
  entries: readonly YamlEntry[],
): Readonly<Record<string, string | readonly string[]>> {
  return toRecord(
    entries.filter((entry) => !UNINHERITED.has(entry.key) && !RELATION_INDEX.has(foldRelationKey(entry.key))),
  );
}

/**
 * Phrases that give a link its meaning, longest-matching-nearest wins.
 *
 * Only phrases that genuinely commit the citing document are here. Vague ones
 * ("see", "covered by") stay out: a `references` edge is harmless, whereas a
 * wrongly inferred `assumes` edge produces a confident stale-premise finding
 * about a document that never depended on anything.
 */
const VERB_RULES: readonly { kind: EdgeKind; inverted: boolean; phrases: readonly string[] }[] = [
  {
    kind: 'supersedes',
    inverted: true,
    phrases: ['superseded by', 'superceded by', 'replaced by', 'obsoleted by', 'deprecated by', 'rolled into'],
  },
  { kind: 'supersedes', inverted: false, phrases: ['supersedes', 'supercedes', 'replaces', 'obsoletes', 'deprecates'] },
  { kind: 'amends', inverted: true, phrases: ['amended by', 'refined by', 'clarified by', 'revised by'] },
  { kind: 'amends', inverted: false, phrases: ['amends', 'refines', 'clarifies', 'revises'] },
  {
    kind: 'delegates-to',
    inverted: false,
    phrases: [
      'delegated to',
      'delegate to',
      'deferred to',
      'defer to',
      'moved to',
      'move to',
      'tracked in',
      'tracked by',
      'handed off to',
      'handed to',
      'hand off to',
      'follow up in',
      'follow-up in',
      'followup in',
      'continued in',
      'continues in',
      'punted to',
      'left to',
      'belongs in',
      'owned by',
      'will be decided in',
      'will be resolved in',
      'will be handled in',
      'will be handled by',
      'will be answered in',
      'to be decided in',
      'to be resolved in',
      'to be handled in',
      'to be answered in',
    ],
  },
  {
    kind: 'blocked-by',
    inverted: false,
    phrases: ['blocked by', 'blocked on', 'waiting on', 'waiting for', 'gated on', 'gated by', 'unblocked by'],
  },
  { kind: 'blocked-by', inverted: true, phrases: ['blocks', 'blocking'] },
  {
    kind: 'depends-on',
    inverted: false,
    phrases: ['depends on', 'depend on', 'dependent on', 'requires', 'builds on', 'built on', 'relies on'],
  },
  { kind: 'depends-on', inverted: true, phrases: ['depended on by'] },
  {
    kind: 'assumes',
    inverted: false,
    phrases: [
      'assumes',
      'assuming',
      'on the assumption of',
      'as decided in',
      'as established in',
      'as established by',
      'as stated in',
      'as specified in',
      'as required by',
      'as mandated by',
      'in accordance with',
      'constrained by',
      'mandated by',
      'governed by',
      'predicated on',
      'rests on',
      'follows from',
      'justified by',
      // A constraint the citing document designs around. "the row limit imposed
      // by ADR-0002" is the archetypal stale premise: when ADR-0002 is retired,
      // this document is still working around a cap that no longer exists.
      'imposed by',
      'required by',
      'dictated by',
      'determined by',
      'limited by',
      'capped by',
      'bounded by',
      'defined by',
      'defined in',
      'specified by',
      'set by',
      'per',
      'because',
      'since',
    ],
  },
];

/**
 * Words that cancel a governing phrase standing before them.
 *
 * The window allows a short noun phrase between a verb and the reference it
 * governs - "deferred to the sharding decision in [ADR-7]" is one statement.
 * It cannot allow a negation. A table entry reading "Owned by nobody today and
 * disclaimed by [138]" was being read as a delegation *to* 138, which is the
 * opposite of what the sentence says, and an inference that inverts its source
 * is worse than no inference at all.
 *
 * The `^` never decides anything: the text tested starts just after a phrase,
 * and a phrase only matches where no letter follows it.
 *
 * The word ends where a phrase ends, at anything but a letter or a digit, so
 * that the mark a sentence puts after it does not hide it: "Blocked by none:
 * [ADR-7]" was a `blocked-by` edge, where the same words with a space after
 * them were a citation. The end of the text is such a place too: it ends
 * where the reference begins, and `nobody[ADR-7]` has nothing after it. A
 * hyphen is not one. It joins the word to the next, and "the no-op" or "the
 * never-ending migration" names a thing and denies nothing (ADR-0006).
 *
 * The word begins where it ends, after anything but a letter, a digit or a
 * hyphen, so `Blocked by:none` and `none` between two em dashes are read as
 * `by none` is. `no-one` is `no one` written with a hyphen, and on the list
 * for that: the hyphen that makes `no-op` a name makes `no-one` a word
 * (ADR-0006, 2026-10-18).
 */
const NEGATION = /(?:^|[^\p{L}\p{N}-])(?:no|not|no-one|nobody|none|never|neither|nor|nothing|without)(?![\p{L}\p{N}-])/u;

/**
 * A negation that stands before a governing phrase, which cancels it as one
 * after it does: "Not blocked by [ADR-7]", "it has not been superseded by
 * [ADR-7]" and "this doesn't depend on [ADR-7]" each deny the relation the
 * phrase would state (ADR-0006, 2026-10-18).
 *
 * It is the last word before the phrase, or before a few words that carry a
 * verb's tense, or leave the relation in doubt, and no claim of their own:
 * `be`, `been`, `is`, `yet`, `longer`, `necessarily` and the like, so "no
 * longer blocked by", "not yet deferred to" and "not necessarily blocked
 * by" are read, and "not only blocked by" and "nothing but blocked by",
 * which state the relation, are not. Only a space stands between, so a
 * mark keeps the word to itself: the option `"never" blocked by` states the
 * relation, as "Not in this release: deferred to" does. A comma does too,
 * and ends the clause the word belongs to: "If not, blocked by" and "both
 * or neither, because" state the relation, where with the comma blanked
 * they were cancelled (ADR-0006, 2026-10-19). A contraction is a negation,
 * `isn't` and `doesn’t`, and so is `cannot`. Tested against the text just
 * before the phrase, which ends with the space or the comma before it.
 *
 * An aside between the two, closed by a comma of its own, leaves the clause
 * open: "Not, as it happens, blocked by", "never, ever, blocked by" and "it
 * is not, as far as anyone knows, blocked by" deny the relation as the words
 * without the aside do. The aside is anything up to a comma, and may hold
 * several, so the negation may also end a clause the phrase is not in -
 * "if not, then, blocked by" - and the relation such a sentence states is
 * missed, which ADR-0006 prefers to one it denies (2026-10-24). The same few
 * words may stand after the last comma, "not, in the end, been superseded
 * by". A run of spaces and commas is one comma in the text this is tested
 * on, so no aside is empty and `.*` would read as `.+` does; and only
 * whether the pattern matches is asked, so a lazy `.+?` reads alike too.
 */
const NEGATED_BEFORE =
  /(?:^|[^\p{L}\p{N}-])(?:no|not|no one|no-one|nobody|none|never|neither|nor|nothing|without|cannot|\p{L}+n['’]t)(?: (?:be|been|being|is|are|was|were|yet|longer|ever|even|currently|actually|really|necessarily|always))*(?: |,.+,(?:(?:be|been|being|is|are|was|were|yet|longer|ever|even|currently|actually|really|necessarily|always) )*)$/u;

/**
 * A word that points the reader at the reference, and governs it as a
 * citation from nearer than any phrase before it: "Per tick, see [ADR-7]"
 * read ADR-7 as a premise, and "blocked by the cache, see [ADR-7]" read it
 * as what blocks. `see` is no phrase for the vagueness that makes it a
 * citation, and between a phrase and the reference it says the reference is
 * where to read more, not what the phrase names (ADR-0006, 2026-10-24). It
 * is a word as a negation is, between anything but a letter, a digit or a
 * hyphen, so "the must-see list", "the licensee" and "seen in" point at
 * nothing. The text it is tested on starts just after a phrase, where no
 * letter stands, so the word is never its first and needs no start of text.
 */
const POINTER = /[^\p{L}\p{N}-]see(?![\p{L}\p{N}-])/u;

/**
 * A code span that holds nothing but a negation word: `` `none` ``.
 *
 * The structure mask blanks code, which is right for a phrase or a link
 * written in it, and hid the one word a sentence denies with: ``Blocked by
 * `none`: [ADR-7]`` was a `blocked-by` edge where `**none**` was a citation.
 * Read as a negation, a span naming a value called `none` costs a relation
 * the sentence states, which is the miss ADR-0006 prefers to a relation it
 * denies. The backreference matches a closing run as long as the opening,
 * which is what ends a span, and each start is a run's first backtick, so a
 * run is tried once for each length it has: linear in the text.
 */
const NEGATION_IN_CODE = /(?<!`)(`+) ?(no|not|no-one|nobody|none|never|neither|nor|nothing|without) ?\1(?!`)/giu;

/** How close a governing phrase must sit to the reference it governs. */
const VERB_WINDOW = 40;

/**
 * Every governing phrase compiled into one alternation, plus a lookup table.
 *
 * Classification runs on every reference in the corpus, and testing a hundred
 * phrases one at a time made it the most expensive thing extraction did. The
 * alternation is sorted longest-first so that at any given position the regex
 * prefers `partially resolved` over `resolved`, matching the precedence the
 * per-phrase search had. Lookarounds rather than `\b`, because phrases contain
 * hyphens and `\b` does the wrong thing around them.
 *
 * Neither the sort nor the escaping decides anything today, and no test can
 * pin them: no phrase in the table is another one followed by more words, and
 * none holds a character a pattern would read. Both are for the next phrase.
 */
const VERB_LOOKUP: ReadonlyMap<string, Classification> = new Map(
  VERB_RULES.flatMap((rule) =>
    rule.phrases.map((phrase) => [phrase, { kind: rule.kind, inverted: rule.inverted }] satisfies [string, Classification]),
  ),
);

const VERB_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${[...VERB_LOOKUP.keys()]
    .sort((a, b) => b.length - a.length)
    .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?![\\p{L}\\p{N}])`,
  'gu',
);

/** Headings under which a link is bookkeeping rather than a commitment. */
const WEAK_SECTIONS: ReadonlySet<string> = new Set([
  'see also',
  'references',
  'reference',
  'related',
  'related work',
  'related decisions',
  'related documents',
  'links',
  'further reading',
  'prior art',
  'history',
  'changelog',
  'change log',
  'revision history',
  'bibliography',
  'sources',
  'appendix',
  'more information',
  'resources',
  'index',
]);

/** Headings whose bullets are obligations even without a checkbox. */
const OBLIGATION_SECTIONS: ReadonlySet<string> = new Set([
  'open questions',
  'open question',
  'unresolved questions',
  'unanswered questions',
  'questions',
  'open issues',
  'action items',
  'actions',
  'todo',
  'to do',
  'to-do',
  'todos',
  'next steps',
  'follow ups',
  'follow-ups',
  'followups',
  'follow up',
  'follow-up',
  'unresolved',
  'outstanding',
  'outstanding questions',
  'tasks',
  'task list',
  'work items',
  'remaining work',
  'decisions needed',
  'blockers',
  'parking lot',
  'future work',
  'deferred',
]);

/**
 * Prefixes that look like specification identifiers but never are.
 *
 * The corpus filter in `resolve.ts` is the real defence; this list only keeps
 * the obvious noise out of the candidate set. A single letter - `v2`, `x86`,
 * `p99` - is not here because no prefix that short is ever read as a family.
 * The words that number a part rather than a document come first: `Phase 2`
 * is prose wherever a document declares itself PHASE-1, and a title or a file
 * name opening with one names no family (`identity.ts`).
 */
const NOT_A_FAMILY: ReadonlySet<string> = new Set([
  ...NOT_A_FAMILY_OF_DOCUMENTS,
  'ver',
  'version',
  'pp',
  'fig',
  'figure',
  'table',
  'tbl',
  'section',
  'sect',
  'sec',
  'step',
  'item',
  'no',
  'num',
  'line',
  'ln',
  'col',
  'port',
  'pr',
  'issue',
  'gh',
  'utf',
  'ascii',
  'sha',
  'md',
  'http',
  'https',
  'ipv',
  'tls',
  'ssl',
  'es',
  'ecma',
  'p99',
  'base',
  'sql',
  'ipv4',
  'ipv6',
  'arm',
  'x86',
  'win',
  'node',
  'python',
  'java',
  'go',
  'cpp',
]);

const BARE_REF = /\b[A-Za-z][A-Za-z0-9]{0,14}[\s._-]?\d{1,6}\b/g;

/* -------------------------------------------------------------------------- */
/* Extraction                                                                 */
/* -------------------------------------------------------------------------- */

export interface ExtractInput {
  /** Repository-relative POSIX path. */
  readonly path: string;
  readonly text: string;
  /**
   * This file is a historical record: a log of what was decided, not a
   * decision. Matched against the caller's history patterns, because deciding
   * which files those are is a repository's business and not a guess this
   * layer could justify making. See ADR-0011.
   */
  readonly record?: boolean | undefined;
  /**
   * The file's own status is not read: it declares none, wherever it wrote
   * one, and takes its phase from its directory as a file that writes none
   * does. Matched against `ignoreStatus`, for a format whose status nobody
   * maintains, such as Spec Kit's `**Status**: Draft` (ADR-0002).
   */
  readonly statusUnread?: boolean | undefined;
  /**
   * The labels of the claims this file holds, each with what it means for
   * work, where `claims.files` names the file; `undefined` everywhere else,
   * where no item is read as a claim (ADR-0024).
   */
  readonly claims?: ReadonlyMap<string, Disposition> | undefined;
  /**
   * The file is a status ledger: a row of a table with a status column says
   * how far it holds, and is an item as a list item is (ADR-0026).
   */
  readonly ledger?: boolean | undefined;
  /**
   * The heading whose sections are measurement protocols, and the field that
   * holds a protocol's result, both in lower case, where the file is one
   * `protocols.files` names (ADR-0028).
   */
  readonly protocols?: { readonly heading: string; readonly result: string } | undefined;
  /**
   * The extensions that make a token a path, where the file orients a reader
   * and is held to the paths it names (ADR-0029).
   */
  readonly orientation?: { readonly extensions: readonly string[] } | undefined;
}

/**
 * Reads one file into graph fragments, one entry per specification in it.
 *
 * A file yields at least itself. It yields more when it is a register: a
 * heading that carries an identifier *and* declares a status is a specification
 * in its own right, with its own lifecycle, its own obligations and its own
 * relations. See ADR-0009.
 */
export function extractSpecifications(input: ExtractInput): ExtractedDocument[] {
  const first = extractDocument(input);
  return first === null ? [] : [first, ...(first.subSpecifications as ExtractedDocument[])];
}

/** Reads a file's own specification. Returns `null` when it opts out. */
/** The one character that makes a text file read as binary to other tools. */
const NUL = '\u0000';

export function extractDocument(input: ExtractInput): ExtractedDocument | null {
  const scanned = scanMarkdown(input.text);
  const directives = parseDirectives(scanned.comments);
  if (directives.some((d) => d.name === 'spec-ignore')) return null;

  const index = scanned.index;
  const file = input.path;
  const problems: ParseProblem[] = [];
  const at = (start: number, end: number): SourceRef => refOf(file, index, start, end);

  const nul = input.text.indexOf(NUL);
  if (nul !== -1) {
    // Not a finding. Nothing about the graph is wrong, and the text parsed - a
    // NUL is whitespace to every rule here. It is a problem with the *input*,
    // which is what a ParseProblem is for, and it is worth one line because
    // spec-graph is likely the only tool that got this far: grep, diff and
    // every review interface read the file as binary and show nothing at all.
    //
    // The cause is almost always an encoding, not a keystroke. UTF-16 read as
    // UTF-8 puts a NUL between every character, and the document that produces
    // looks plausible in some editors and is mojibake everywhere else.
    problems.push({
      message: `contains a NUL byte, so grep, diff and review tooling read this file as binary - check whether it was saved as UTF-16`,
      at: at(nul, nul + 1),
    });
  }

  // CommonMark reads a comment that opens a line and never closes as running
  // to the end of the document, and so does the scan: nothing after it is a
  // heading, an item or a link. A renderer hides it all, so the author may see
  // it, but the graph would lose it without a word.
  const unclosed = scanned.comments.find((comment) => !comment.closed);
  if (unclosed !== undefined) {
    problems.push({
      message: 'a comment opened here is never closed, so nothing after it is read - close it with -->',
      at: at(unclosed.start, unclosed.start + 4),
    });
  }

  for (const directive of directives) {
    for (const unknown of directive.unknownAttributes) {
      problems.push({
        message: `unknown attribute "${unknown}" on @${directive.name}`,
        at: at(directive.start, directive.end),
      });
    }
    const kind = directive.name === 'spec-edge' ? attr(directive, 'kind') : null;
    if (kind !== null && !isEdgeKind(kind.value)) {
      problems.push({
        message: `unknown relation "${kind.value}" on @spec-edge, read as references - expected one of: ${EDGE_KINDS.join(', ')}`,
        at: at(kind.start, kind.end),
      });
    }
  }

  const { entries, problems: unread } = readEntries(scanned);
  for (const problem of unread) {
    // A line that names no key could have held any of them, and so could a
    // block that was not read at all.
    const lost = problem.unread && (problem.key === null || buildsGraph(problem.key));
    problems.push({ message: problem.message, at: at(problem.start, problem.end), ...(lost ? { unread: true } : {}) });
  }
  const byKey = new Map<string, YamlEntry>();
  for (const entry of entries) byKey.set(entry.key, entry);
  const inherited = inheritableFrontMatter(entries);

  const h1 = scanned.headings.find((h) => h.level === 1) ?? null;
  const frontMatterId = firstValue(byKey, ID_KEYS) ?? null;

  const identityOf = (declaredId: string | null, directive: Directive | null): DocumentIdentity =>
    identify({
      path: input.path,
      declaredId,
      declaredAliases: [
        ...(directive ? attrList(directive, 'aliases') : []),
        ...valuesOf(byKey.get('aliases')),
        ...valuesOf(byKey.get('alias')),
      ],
      heading: h1?.text ?? null,
    });

  // A `@spec-node` written inside a register's section belongs to that section,
  // not to the file. Finding the file's own therefore needs the regions, and
  // finding the regions needs the file's identity - so the identity is settled
  // provisionally first, then again once the file's own directive is known.
  const provisional = identityOf(frontMatterId, null);
  const provisionalRegions = findSpecificationRegions(scanned, directives, provisional.id);
  const nodeDirective =
    directives.find(
      (directive) =>
        directive.name === 'spec-node' &&
        !provisionalRegions.some(
          // `>=` and `>` agree on the start: a region starts at a heading's
          // first character or a row's, and a line that opens with a comment is
          // neither a heading nor a row.
          (region) =>
            (region.heading !== null || region.row !== null) &&
            directive.start >= region.start &&
            directive.end <= region.end,
        ),
    ) ?? null;

  const declaredId = (nodeDirective ? attr(nodeDirective, 'id')?.value : null) ?? frontMatterId;
  // With no directive of its own the file's identity is the provisional one,
  // computed from exactly these inputs. Settling it again would give the same
  // answer, which is why no test can tell this reuse from a second call.
  const identity = nodeDirective === null ? provisional : identityOf(declaredId, nodeDirective);

  // A register's sections are specifications too. The file is always the first
  // region, so a one-decision file behaves exactly as it did before. The regions
  // depend on the file's id alone, so when the directive left it unchanged the
  // provisional ones are the answer, and finding them again is the same answer.
  const regions =
    identity.id === provisional.id ? provisionalRegions : findSpecificationRegions(scanned, directives, identity.id);

  // A register's rows and sections each write a status of their own, in a
  // cell or a section, and are read as before: what `ignoreStatus` names is
  // the file, and what it leaves unread is where the file wrote its own. A
  // template's status is its placeholder: MADR's `adr-template.md` offers
  // every status there is, and the supersession among them named an
  // ADR-0123 nobody wrote.
  const status =
    input.statusUnread === true || isTemplateFile(input.path) ? NO_STATUS : readStatus(scanned, byKey, nodeDirective, index, file, regions);
  const pathPhase = phaseFromPath(input.path);
  // A record is a categorical statement about what the file *is*, made by
  // configuration or by an explicit directive, so it outranks a status word
  // that happened to be written inside it.
  const record = input.record === true || directives.some((directive) => directive.name === 'spec-history');
  const phase: Phase = record ? 'record' : status.phase !== 'unknown' ? status.phase : pathPhase;

  const title =
    (nodeDirective ? attr(nodeDirective, 'title')?.value : null) ??
    asString(byKey.get('title')) ??
    h1?.text ??
    identity.id;

  const document: DocumentNode = {
    id: identity.id,
    kind: 'document',
    title,
    at: at(0, Math.min(scanned.text.length, index.lineEnd(1))),
    path: input.path,
    aliases: identity.aliases,
    phase,
    history: record,
    rawStatus: status.raw,
    statusAt: status.at,
    frontMatter: toRecord(entries),
  };

  // Every region but the first: a heading section, or a row of a register kept
  // as a table.
  const subSpecifications = regions
    .filter((region) => region.heading !== null || region.row !== null)
    .map((region) =>
      buildRegion({
        region,
        containerId: identity.id,
        input,
        scanned,
        directives,
        index,
        file,
        pathPhase,
        record,
        inherited,
      }),
    );

  // The specification that owns an offset: the innermost region around it, or
  // the file when no region holds it and `regionAt` answers `null`.
  const documentAt = (offset: number): DocumentNode => {
    const region = regionAt(regions, offset);
    return subSpecifications.find((spec) => spec.region === region)?.document ?? document;
  };
  const ownerAt = (offset: number): string => documentAt(offset).id;

  const allItems = [
    ...extractItems({ scanned, directives, ownerAt, file, index, claims: input.claims }),
    ...(input.ledger === true ? extractLedgerRows({ scanned, ownerAt, file, index }) : []),
  ];
  const protocols = extractProtocols({ scanned, config: input.protocols, ownerAt, file, index });
  allItems.push(...protocols.map((protocol) => protocol.item));
  const commits: CommitCitation[] = findCommitReferences(scanned).map((reference) => ({
    owner: ownerOf(allItems, reference.start) ?? ownerAt(reference.start),
    kind: reference.kind,
    value: reference.value,
    at: at(reference.start, reference.end),
  }));

  const allReferences = extractReferences({
    scanned,
    directives,
    document,
    documentAt,
    items: allItems,
    byKey,
    status,
    claimed: regions.flatMap((region) => [...region.claimed]),
    file,
    index,
  });

  // Hand each region the items and references that fall inside it.
  const ownItems = allItems.filter((item) => item.document === identity.id);
  const ownReferences = allReferences.filter((reference) => belongsTo(reference, identity.id, allItems));
  const misreadKeys = misreadRelationKeys(byKey, identity.id, at);
  const anchors = anchorsOf(scanned.headings, scanned.masks.structure);

  const filled = subSpecifications.map((spec) => ({
    ...spec.extracted,
    items: allItems.filter((item) => item.document === spec.document.id),
    references: [
      // Column-declared relations first: they are typed by the header rather
      // than guessed from prose.
      ...spec.extracted.references,
      ...allReferences.filter((reference) => belongsTo(reference, spec.document.id, allItems)),
    ],
  }));

  return {
    document,
    items: ownItems,
    references: ownReferences,
    problems,
    misreadKeys,
    anchors,
    commits,
    row: null,
    protocols: protocols.map((protocol) => protocol.protocol),
    figures: figuresOf(directives, allItems, ownerAt, at),
    paths: input.orientation === undefined ? [] : pathsOf(scanned, input.orientation.extensions, allItems, ownerAt, at),
    pathsAllowed: directives.filter((directive) => directive.name === 'spec-path').flatMap((directive) => [...attrList(directive, 'created'), ...attrList(directive, 'external')]),
    commands: input.orientation === undefined ? [] : commandsOf(scanned, allItems, ownerAt, at),
    commandsAllowed: directives.filter((directive) => directive.name === 'spec-command').flatMap((directive) => [...attrList(directive, 'created'), ...attrList(directive, 'absent')]),
    identity,
    scanned,
    subSpecifications: filled,
    containerId: null,
  };
}

/** True when a reference was written on a document or on one of its items. */
function belongsTo(reference: ReferenceCandidate, documentId: string, items: readonly ItemNode[]): boolean {
  if (reference.from === documentId) return true;
  const owner = items.find((item) => item.id === reference.from);
  return owner?.document === documentId;
}

interface RegionInput {
  readonly region: SpecificationRegion;
  readonly containerId: string;
  readonly input: ExtractInput;
  readonly scanned: ScannedDocument;
  readonly directives: readonly Directive[];
  readonly index: LineIndex;
  readonly file: string;
  readonly pathPhase: Phase;
  /** The whole file is a historical record, so every part of it is one too. */
  readonly record: boolean;
  /** The file's front matter, minus the keys a region must answer itself. */
  readonly inherited: Readonly<Record<string, string | readonly string[]>>;
}

interface BuiltRegion {
  readonly region: SpecificationRegion;
  readonly document: DocumentNode;
  readonly extracted: ExtractedDocument;
}

/**
 * Turns one region into a specification.
 *
 * It produces exactly the `DocumentNode` a whole file produces, which is the
 * reason every rule, query and reporter works on registers without knowing they
 * exist. The only deliberate differences: the node is anchored at its heading
 * rather than at line one, it carries the file's front matter rather than front
 * matter of its own, and it does not claim the file's path as an alias - the
 * file already does, and two nodes answering to one path would make every link
 * to that file ambiguous.
 */
function buildRegion(context: RegionInput): BuiltRegion {
  const { region, input, scanned, index, file, pathPhase, record, inherited } = context;
  const at = (start: number, end: number): SourceRef => refOf(file, index, start, end);

  const identity = identify({
    path: input.path,
    declaredId: region.declaredId,
    declaredAliases: region.directive ? attrList(region.directive, 'aliases') : [],
    heading: region.title,
    includePathAliases: false,
  });

  const declaredStatus = region.directive ? attr(region.directive, 'status') : null;
  const rawStatus = declaredStatus?.value ?? region.status?.text ?? null;
  const statusAt = declaredStatus
    ? at(declaredStatus.start, declaredStatus.end)
    : region.status
      ? at(region.status.start, region.status.end)
      : null;
  const declaredPhase = phaseOf(rawStatus);

  const document: DocumentNode = {
    id: identity.id,
    kind: 'document',
    title: (region.directive ? attr(region.directive, 'title')?.value : null) ?? region.title ?? identity.id,
    // Anchored at its heading, or at the row when the register is a table. Every
    // region here has one or the other, so neither `?.` ever stops the chain.
    at: at(region.start, Math.min(region.end, region.heading?.end ?? region.row?.end ?? region.end)),
    path: input.path,
    aliases: identity.aliases,
    // A section of a journal is part of the journal, whatever status word it
    // wrote for itself. Being a record is a statement about the file made from
    // outside it, and it does not stop at a heading.
    phase: record ? 'record' : declaredPhase !== 'unknown' ? declaredPhase : pathPhase,
    history: record,
    rawStatus,
    statusAt,
    frontMatter: inherited,
  };

  const anchors = anchorsOf(
    scanned.headings.filter((h) => h.start >= region.start && h.start < region.end),
    scanned.masks.structure.slice(region.start, region.end),
  );

  // Relations a table declares by column, typed by the header the author wrote.
  // A target the cell lists is as deliberate as front matter. A clause of
  // prose there cites what prose cites, the identifiers written in it, and
  // failing those it may be a document's name; neither is reported unless
  // prose would be.
  const references = region.relations.flatMap((relation): ReferenceCandidate[] => {
    const declared = {
      kind: relation.kind,
      from: document.id,
      declaredAt: at(relation.start, relation.end),
      raw: `${relation.column}: ${relation.target}`,
      inverted: relation.inverted,
    };
    if (!relation.prose) return [{ ...declared, target: relation.target, origin: 'front-matter', opportunistic: false }];
    const cited = bareReferencesIn(relation.target);
    if (cited.length === 0) return [{ ...declared, target: relation.target, origin: 'front-matter', opportunistic: true }];
    return cited.map((bare) => ({ ...declared, target: bare.text, origin: 'text', opportunistic: true }));
  });

  return {
    region,
    document,
    extracted: {
      document,
      // Never read: the file's extraction replaces it once every item's owner
      // is known.
      items: [],
      references,
      problems: [],
      // The file has already reported anything misread at the top of it, and
      // there is one file however many regions it holds.
      misreadKeys: [],
      anchors,
      commits: [],
      protocols: [],
      figures: [],
      paths: [],
      pathsAllowed: [],
      commands: [],
      commandsAllowed: [],
      row:
        region.row === null
          ? null
          : { cells: region.cells!.map((cell) => ({ header: cell.header, text: cell.text, at: at(cell.start, cell.end) })) },
      identity,
      scanned,
      subSpecifications: [],
      containerId: context.containerId,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

interface StatusReading {
  readonly raw: string | null;
  readonly at: SourceRef | null;
  readonly phase: Phase;
}

/**
 * Finds the document status.
 *
 * Looks in the places teams actually put it, in descending order of how
 * deliberate each is: a directive, a front-matter field, then the body of a
 * `## Status` section or a key-value table above the first section. A
 * repository using none of them still gets a phase from its directory layout,
 * which is handled by the caller.
 *
 * A status section inside a register's region is that region's, not the
 * file's. Read as the file's, a register whose first decision said
 * `### Status` / `Superseded by ADR-0009` was itself retired, and itself
 * superseded by ADR-0009, for something one of its decisions said.
 */
function readStatus(
  scanned: ScannedDocument,
  byKey: ReadonlyMap<string, YamlEntry>,
  nodeDirective: Directive | null,
  index: LineIndex,
  file: string,
  regions: readonly SpecificationRegion[],
): StatusReading {
  if (nodeDirective) {
    const declared = attr(nodeDirective, 'status');
    if (declared) {
      return {
        raw: declared.value,
        at: refOf(file, index, declared.start, declared.end),
        phase: phaseOf(declared.value),
      };
    }
  }

  for (const key of STATUS_KEYS) {
    const entry = byKey.get(key);
    if (!entry) continue;
    const raw = typeof entry.value === 'string' ? entry.value : entry.value.join(', ');
    if (raw.trim().length === 0) continue;
    return {
      raw,
      at: refOf(file, index, entry.valueStart, entry.end),
      phase: phaseOf(raw),
    };
  }

  const heading = scanned.headings.find((h) => isStatusHeading(h.text) && regionAt(regions, h.start) === null);
  if (heading) {
    const body = statusSectionBody(scanned, heading.line);
    if (body) {
      return {
        raw: body.text,
        at: refOf(file, index, body.start, body.end),
        phase: phaseOf(body.text),
      };
    }
  }

  const rows = statusTableRows(scanned);
  // A row written short, or with nothing on the right, declares nothing.
  const cell = rows.find((value) => value !== undefined && value.text.length > 0);
  if (cell) {
    return {
      raw: cell.text,
      at: refOf(file, index, cell.start, cell.end),
      phase: phaseOf(cell.text),
    };
  }

  // A status written in a place ranked above the label, readable or not, is
  // where the document put it, and spec-guard reads no label in its place.
  // Nor under front matter that never closes, whose status cannot be read.
  const written =
    scanned.unclosedFrontMatter !== null || STATUS_KEYS.some((key) => byKey.has(key)) || heading !== undefined || rows.length > 0;
  const label = written ? null : statusLabel(scanned, regions);
  if (label) {
    return {
      raw: label.raw,
      at: refOf(file, index, label.start, label.end),
      phase: label.readable ? phaseOf(label.text) : 'unknown',
    };
  }

  return NO_STATUS;
}

/** What a file that declares no status reads as. */
const NO_STATUS: StatusReading = { raw: null, at: null, phase: 'unknown' };

/** The left cells that make a two-column table's row the document's status. */
const STATUS_TABLE_KEYS: ReadonlySet<string> = new Set(['status', 'state']);

/**
 * The right cell of each row of a key-value table at the top of a document
 * whose left cell is a status key, the header row included, and nothing for
 * a row written short: `| Status | Accepted |`.
 *
 * Read only where a document describes itself. A table under a heading below
 * the title is a legend or a register, and one with more than two columns is
 * not a list of the document's fields; neither is its status. A table
 * spec-graph reads as a register is left to its rows. Ranked with a `## Status`
 * section, after one: a document that has both is read from the section.
 */
function statusTableRows(scanned: ScannedDocument): (TableCell | undefined)[] {
  const body = scanned.headings.find((h) => h.level >= 2)?.start ?? scanned.text.length;
  const found: (TableCell | undefined)[] = [];
  for (const table of scanned.tables) {
    // Tables come in order, and none starts on a heading's line, so `>` would
    // stop at the same table.
    if (table.start >= body) break;
    if (isRegisterTable(table)) continue;
    const across = statusAcross(table);
    if (across !== null) {
      found.push(across);
      continue;
    }
    if (table.headers.length !== 2) continue;
    for (const cells of [table.headers, ...table.rows.map((row) => row.cells)]) {
      // A row always has a first cell: a line with no cell ends the table.
      if (isStatusKey(cells[0]!)) found.push(cells[1]);
    }
  }
  return found;
}

const isStatusKey = (cell: TableCell): boolean => STATUS_TABLE_KEYS.has(cell.text.replace(/[*_]/g, '').toLowerCase());

/**
 * The status a table written across holds, and nothing for a row written
 * short: `| Status | Date |` over the one row `| Accepted | 2026-03-01 |`.
 * Read down, as a table of keys and values is, its status was the word
 * "Date". `null` where the table is not one written across: it has one row
 * alone, a status key heads a column, and every other header is a name of
 * its own: not empty, as a header over keys and values can be, and no status,
 * as `| Status | Accepted |` written as the header row is.
 */
function statusAcross(table: ScannedDocument['tables'][number]): TableCell | undefined | null {
  if (table.rows.length !== 1) return null;
  const column = table.headers.findIndex(isStatusKey);
  if (column === -1) return null;
  const named = (cell: TableCell): boolean => cell.text.length > 0 && phaseOf(cell.text) === 'unknown';
  if (!table.headers.every((cell, at) => at === column || named(cell))) return null;
  return table.rows[0]!.cells[column];
}

/**
 * The status label spec-guard reads: `Status:`, `**Status**:` or
 * `**Status:**`, in any case, opening a line indented at most three spaces,
 * and the value after it. spec-guard's `parser.ts` holds the same
 * expression, so the two tools find one line to be the label.
 */
const STATUS_LABEL = /^[ \t]{0,3}(?:(\*\*|__)status(?:\1[ \t]*:|[ \t]*:\1)|status[ \t]*:)(.*)/i;

/**
 * A `Status: Draft` line in the document's preamble, read where and as
 * spec-guard reads one (ADR-0002, amended 2026-11-08).
 *
 * The preamble is everything before the first heading of level two or deeper
 * the scanner reads, so a `##` shown in code or kept in a comment does not
 * end it: a line of prose with a colon in it, accepted anywhere, is
 * eventually a sentence. The first such line decides. Its value is read with
 * code and comments blanked, and one that does not open with a letter,
 * through any emphasis, cannot be read: a date, a quote, a symbol or a code
 * span first is no word, and the document is in no phase. A line inside a
 * register's section is that section's.
 *
 * spec-guard keeps comments in the text it reads the label from, so a label
 * left in a template's comment of several lines withdraws a document there,
 * and a hint in a comment before the value leaves it unreadable. Here a
 * comment says nothing either way, as it says nothing in a status section.
 */
function statusLabel(
  scanned: ScannedDocument,
  regions: readonly SpecificationRegion[],
): { raw: string; text: string; readable: boolean; start: number; end: number } | null {
  const body = scanned.headings.find((h) => h.level >= 2)?.line ?? Number.POSITIVE_INFINITY;
  const view = scanned.masks.structure;
  for (const line of scanned.lines) {
    if (line.line >= body) break;
    const found = STATUS_LABEL.exec(view.slice(line.start, line.end));
    if (!found || regionAt(regions, line.start) !== null) continue;
    const value = found[2]!;
    const text = value.trim();
    // As written, code and all, for the report and for the successor a
    // supersession names: "Superseded by `ADR-0002`" names one.
    const written = scanned.text.slice(line.end - value.length, line.end);
    const raw = written.trim();
    const start = line.end - written.trimStart().length;
    // Struck text is what the status was, and the word after it what it is:
    // `~~Proposed~~ Accepted` opens with a word once the strike is read.
    const readable = /^[*_]*[a-zA-Z]/.test(text.replace(/^(?:~~[^~\n]*~~\s*)+/, ''));
    return { raw, text, readable, start, end: start + raw.length };
  }
  return null;
}

/**
 * The status a `## Status` section declares: its first non-blank line, or
 * the first line after it that opens with a word that retires a document.
 *
 * A status section is often a history. adr-tools writes `Accepted`, and
 * `Superseded by [2. Second](0002-second.md)` below it when a later decision
 * replaces this one; a list writes `- Proposed`, `- Accepted`, `- Superseded
 * by ADR-0002`. Read from its first line, each was a live document that the
 * line below it said was retired, and the supersession it named was reported
 * as one its own section had not acknowledged. Retirement is terminal, so a
 * paragraph or an entry that opens with it wins (ADR-0002, amended
 * 2026-11-12). Only one that opens with it: a sentence that mentions an
 * approach rejected elsewhere retires nothing, nor does a line of it that
 * wraps to begin with the word.
 */
function statusSectionBody(
  scanned: ScannedDocument,
  headingLine: number,
): { text: string; start: number; end: number } | null {
  let first: { text: string; start: number; end: number } | null = null;
  let fresh = true;
  for (const line of scanned.lines) {
    if (line.line <= headingLine) continue;
    if (line.blank) fresh = true;
    if (line.blank || isOnlyComment(scanned, line)) continue;
    // Code or a heading ends the section, and before any line it leaves it
    // empty - a setext heading too, whose text line does not start with `#`
    // and read as the status.
    if (!isMarkdownLine(line) || opensHeading(scanned, line.line)) return first;
    const trimmed = line.content.trim();
    const offset = line.contentStart + line.content.indexOf(trimmed);
    // A list under Status is a status history, read entry by entry.
    const cleaned = trimmed.replace(/^[-*+]\s+/, '');
    const start = offset + (trimmed.length - cleaned.length);
    const reading = { text: cleaned, start, end: start + cleaned.length };
    const opens = fresh || cleaned !== trimmed;
    fresh = false;
    if (first === null) {
      // A first line that retires the document already says what any later one could.
      if (phaseOf(cleaned) === 'retired') return reading;
      first = reading;
      continue;
    }
    if (opens && opensRetired(cleaned)) return reading;
  }
  return first;
}

/* -------------------------------------------------------------------------- */
/* Items                                                                      */
/* -------------------------------------------------------------------------- */

interface ItemContext {
  readonly scanned: ScannedDocument;
  readonly directives: readonly Directive[];
  /** The specification that owns an offset, which in a register is a section. */
  readonly ownerAt: (offset: number) => string;
  readonly file: string;
  readonly index: LineIndex;
  readonly claims: ReadonlyMap<string, Disposition> | undefined;
}

function extractItems(context: ItemContext): ItemNode[] {
  const { scanned, directives, ownerAt, file, index } = context;
  const out: ItemNode[] = [];
  const ordinals = new Map<string, number>();
  const bound = bindItemDirectives(scanned, directives);
  const claimed = claimsOf(scanned, context.claims);

  for (const item of scanned.listItems) {
    const section = sectionPathAt(scanned, item.start);
    const inObligationSection = section.some((heading) => OBLIGATION_SECTIONS.has(normaliseHeading(heading)));
    const directive = bound.get(item) ?? null;
    const claim = claimed.get(item) ?? null;

    if (claim === null && !isObligation(item, inObligationSection, directive)) continue;

    const documentId = ownerAt(item.start);
    const slug = section.length > 0 ? slugify(section[section.length - 1]!) : 'item';
    // Ordinals count within a specification, so two decisions in one register
    // each get their own `#open-questions.1` rather than sharing a sequence.
    const key = `${documentId}#${slug}`;
    const ordinal = (ordinals.get(key) ?? 0) + 1;
    ordinals.set(key, ordinal);

    const declaredId = directive ? attr(directive, 'id')?.value : null;
    const id = `${documentId}#${declaredId ?? `${slug}.${ordinal}`}`;

    const state = resolveItemState({
      file,
      index,
      item,
      section,
      directive,
      inObligationSection,
      label: claim,
    });

    out.push({
      id,
      kind: 'item',
      title: (directive ? attr(directive, 'title')?.value : null) ?? summarise(item.firstLine),
      at: refOf(file, index, item.start, item.end),
      declared: declaredId !== null && declaredId !== undefined,
      document: documentId,
      section,
      text: summarise(item.firstLine),
      body: item.body,
      disposition: state.disposition,
      openness: state.openness,
      evidence: state.evidence,
      conflicts: state.conflicts,
      label: claim?.text ?? null,
    });
  }

  return out;
}

interface LedgerContext {
  readonly scanned: ScannedDocument;
  readonly ownerAt: (offset: number) => string;
  readonly file: string;
  readonly index: LineIndex;
}

/**
 * A status ledger's rows: in a table with a status column that is no
 * register, each row whose status cell reads as a state, by its first word -
 * `done`, `Implemented`, `in progress`, and `done: what changed` alike. A
 * row whose status says no state, `planned` or `n/a`, says nothing of how
 * far it holds and is no item. The links in a row are its own, as an item's
 * are, since a row's span holds them (ADR-0026).
 */
function extractLedgerRows(context: LedgerContext): ItemNode[] {
  const { scanned, ownerAt, file, index } = context;
  const out: ItemNode[] = [];
  const ordinals = new Map<string, number>();
  for (const table of scanned.tables) {
    if (isRegisterTable(table)) continue;
    const column = statusColumnOf(table);
    for (const row of table.rows) {
      // No status column is -1, and no row has a cell there; a row written
      // short has none under it either.
      const cell = row.cells[column];
      if (cell === undefined) continue;
      const word = cellText(cell).split(/[:;,(]/)[0]!.trim();
      const disposition = dispositionOfWord(word);
      if (disposition === undefined) continue;
      out.push(ledgerItem({ row, cell, word, disposition, ownerAt, scanned, file, index, ordinals }));
    }
  }
  return out;
}

function ledgerItem(input: {
  readonly row: TableRow;
  readonly cell: TableCell;
  readonly word: string;
  readonly disposition: Disposition;
  readonly ownerAt: (offset: number) => string;
  readonly scanned: ScannedDocument;
  readonly file: string;
  readonly index: LineIndex;
  readonly ordinals: Map<string, number>;
}): ItemNode {
  const { row, cell, word, disposition, ownerAt, scanned, file, index, ordinals } = input;
  const section = sectionPathAt(scanned, row.start);
  const documentId = ownerAt(row.start);
  const slug = `${section.length > 0 ? slugify(section[section.length - 1]!) : 'item'}-row`;
  const key = `${documentId}#${slug}`;
  const ordinal = (ordinals.get(key) ?? 0) + 1;
  ordinals.set(key, ordinal);
  const name = cellText(row.cells[0]!);
  const signal: StateSignal = { source: 'marker', disposition, raw: word, at: refOf(file, index, cell.start, cell.end) };
  return {
    id: `${key}.${ordinal}`,
    kind: 'item',
    title: name,
    at: refOf(file, index, row.start, row.end),
    declared: false,
    document: documentId,
    section,
    text: name,
    body: scanned.text.slice(row.start, row.end),
    disposition,
    openness: OPENNESS_OF[disposition],
    evidence: signal,
    conflicts: [],
    label: null,
  };
}

interface ProtocolContext {
  readonly scanned: ScannedDocument;
  /** The heading and the result field's name, in lower case, where the file holds protocols. */
  readonly config: { readonly heading: string; readonly result: string } | undefined;
  readonly ownerAt: (offset: number) => string;
  readonly file: string;
  readonly index: LineIndex;
}

/**
 * A field a protocol writes: `**Corpus**: every module`, `- **Last result:** none
 * yet`. Its value is what follows the match, read from the text.
 */
const PROTOCOL_FIELD = /^(?:[-*+]\s+)?\*\*([^*]+?):?\*\*:?/;

/** A result that says when it was measured, by an ISO date. */
const DATED = /\b\d{4}-\d{2}-\d{2}\b/;

/** A result that says there is none yet, as it opens. */
const NONE_YET = /^(?:\*\*|__|\*|_)?none yet\b/i;

/**
 * The measurement protocols a document writes: each section one level under
 * the configured heading, with the fields it writes as `**Name**: value`.
 * Each is an item, named by its heading's anchor, so a link to that anchor
 * reaches it, closed by a result that names a date and open otherwise
 * (ADR-0028).
 */
function extractProtocols(context: ProtocolContext): { item: ItemNode; protocol: Protocol }[] {
  if (context.config === undefined) return [];
  const { scanned, ownerAt, file, index } = context;
  const { heading, result } = context.config;
  const headings = scanned.headings;
  const top = headings.findIndex((candidate) => candidate.text.toLowerCase() === heading);
  if (top === -1) return [];
  const level = headings[top]!.level;
  const out: { item: ItemNode; protocol: Protocol }[] = [];
  for (let i = top + 1; i < headings.length && headings[i]!.level > level; i += 1) {
    const section = headings[i]!;
    if (section.level !== level + 1) continue;
    let end = scanned.text.length;
    for (let j = i + 1; j < headings.length; j += 1) {
      if (headings[j]!.level <= level + 1) {
        end = headings[j]!.start;
        break;
      }
    }
    const fields: { name: string; value: string; at: SourceRef }[] = [];
    for (const line of scanned.lines) {
      // A line starts after the heading's line ends and never at it, and a
      // line that starts where the next heading does is that heading, which
      // writes no field: `<=` for the `<` and `>` for the `>=` answer alike.
      if (line.start < section.end || line.start >= end || !isMarkdownLine(line)) continue;
      const found = PROTOCOL_FIELD.exec(scanned.masks.structure.slice(line.contentStart, line.end));
      if (found === null) continue;
      // The mask keeps every offset, so the match is as long in the text.
      const value = scanned.text.slice(line.contentStart + found[0].length, line.end).trim();
      fields.push({ name: found[1]!.trim(), value, at: refOf(file, index, line.contentStart, line.end) });
    }
    const documentId = ownerAt(section.start);
    const id = `${documentId}#${section.anchor}`;
    const written = fields.find((field) => field.name.toLowerCase() === result);
    const protocol: Protocol = {
      id,
      anchor: section.anchor,
      title: section.text,
      at: refOf(file, index, section.start, end),
      fields,
      result: written === undefined ? null : { value: written.value, at: written.at, dated: DATED.test(written.value), none: NONE_YET.test(written.value) },
    };
    out.push({ item: protocolItem(protocol, documentId, sectionPathAt(scanned, section.start)), protocol });
  }
  return out;
}

/** The item a protocol is: closed where its result names a date, open where it says none yet or nothing. */
function protocolItem(protocol: Protocol, documentId: string, section: readonly string[]): ItemNode {
  const { result } = protocol;
  const disposition: Disposition = result?.dated === true ? 'satisfied' : 'unresolved';
  const evidence: StateSignal = { source: 'marker', disposition, raw: result?.value ?? '', at: result?.at ?? protocol.at };
  return {
    id: protocol.id,
    kind: 'item',
    title: protocol.title,
    at: protocol.at,
    declared: true,
    document: documentId,
    section,
    text: protocol.title,
    body: protocol.fields.map((field) => `${field.name}: ${field.value}`).join('\n'),
    disposition,
    openness: OPENNESS_OF[disposition],
    evidence,
    conflicts: [],
    label: null,
  };
}

/**
 * A token that reads as a path: letters, digits and `. _ - / + @ ~` alone, no
 * space, no scheme, no glob, no call. A command, `npm run lint`, an error
 * code, `E0420`, and code, `.into<T>()`, are none of them.
 */
const PATH_TOKEN = /^[\p{L}\p{N}._\-/+@~]+$/u;

/** What follows a path naming a place in it: `#anchor`, `:42`, `:42:7`. */
const PLACE = /(?:#[^#]*|:\d+(?::\d+)?)$/;

/**
 * The path a code span names, or `null` for one that is no path: a token
 * that holds a `/` or ends in a configured extension after a name, so that
 * `.md` alone is an extension and no file, with a letter in it,
 * and does not open with `-`, `@` or `~`, the openings of an option, a
 * package scope and a home directory.
 */
export function pathIn(text: string, extensions: readonly string[]): string | null {
  const token = text.replace(PLACE, '');
  if (!PATH_TOKEN.test(token) || !/\p{L}/u.test(token) || /^[-@~]/.test(token)) return null;
  const lower = token.toLowerCase();
  return token.includes('/') || extensions.some((extension) => lower.length > extension.length && lower.endsWith(extension.toLowerCase())) ? token : null;
}

/** The paths an orientation document names in its code spans, each with the node it is written in. */
function pathsOf(
  scanned: ScannedDocument,
  extensions: readonly string[],
  items: readonly ItemNode[],
  ownerAt: (offset: number) => string,
  at: (start: number, end: number) => SourceRef,
): PathMention[] {
  const out: PathMention[] = [];
  for (const span of scanned.codeSpans) {
    const path = pathIn(scanned.text.slice(span.start, span.end).replace(/^`+|`+$/g, '').trim(), extensions);
    if (path === null) continue;
    if (EXAMPLE.test(scanned.text.slice(scanned.text.lastIndexOf('\n', span.start - 1) + 1, span.start))) continue;
    out.push({ owner: ownerOf(items, span.start) ?? ownerAt(span.start), path, at: at(span.start, span.end) });
  }
  return out;
}

/**
 * A line that has just said "e.g.", with nothing after it but other code
 * spans and the words and commas of a list: what follows is an example of a
 * kind of file, `e.g. \`docs/adr/0001-x.md\``, and names none of the
 * repository's (ADR-0029, amended 2026-11-12).
 */
const EXAMPLE = /\be\.\s?g\.[,:]?(?:[\s,+&/]|`[^`\n]*`|\b(?:or|and)\b)*$/i;

/** The commands an orientation document names in its code spans, one per name each runs. */
function commandsOf(
  scanned: ScannedDocument,
  items: readonly ItemNode[],
  ownerAt: (offset: number) => string,
  at: (start: number, end: number) => SourceRef,
): CommandMention[] {
  const out: CommandMention[] = [];
  for (const span of scanned.codeSpans) {
    const command = scanned.text.slice(span.start, span.end).replace(/^`+|`+$/g, '').trim();
    const read = commandIn(command);
    if (read === null) continue;
    const owner = ownerOf(items, span.start) ?? ownerAt(span.start);
    for (const name of read.names) out.push({ owner, tool: read.tool, kind: read.kind, name, command, at: at(span.start, span.end) });
  }
  return out;
}

/** The figures a document marks, each with the record it names. */
function figuresOf(
  directives: readonly Directive[],
  items: readonly ItemNode[],
  ownerAt: (offset: number) => string,
  at: (start: number, end: number) => SourceRef,
): Figure[] {
  const out: Figure[] = [];
  for (const directive of directives) {
    if (directive.name !== 'spec-figure') continue;
    const record = attr(directive, 'record');
    out.push({
      owner: ownerOf(items, directive.start) ?? ownerAt(directive.start),
      record: record?.value ?? '',
      at: at(directive.start, directive.end),
      recordAt: record === null ? at(directive.start, directive.end) : at(record.start, record.end),
    });
  }
  return out;
}

interface ClaimLabel {
  readonly text: string;
  readonly disposition: Disposition;
  readonly start: number;
  readonly end: number;
}

/**
 * The claims among a document's items, each with what its label means and
 * where the label is written (ADR-0024). Which item is a claim is spec-core's
 * reading, the one spec-guard holds a claim to its evidence by: a list item
 * whose text opens with a label as a code span.
 */
function claimsOf(scanned: ScannedDocument, labels: ReadonlyMap<string, Disposition> | undefined): Map<ListItem, ClaimLabel> {
  const out = new Map<ListItem, ClaimLabel>();
  if (labels === undefined) return out;
  // A claim's label is the code span its text opens with.
  const ends = new Map(scanned.codeSpans.map((span) => [span.start, span.end]));
  for (const claim of findClaims(scanned, [...labels.keys()])) {
    const start = claim.item.textStart;
    out.set(claim.item, { text: claim.label, disposition: labels.get(claim.label)!, start, end: ends.get(start)! });
  }
  return out;
}

/**
 * Decides whether a bullet is an obligation.
 *
 * A checkbox or an explicit directive always makes one. Otherwise only
 * top-level bullets under a heading like "Open Questions" count: promoting
 * every bullet in a specification would bury the real obligations under the
 * document's own prose.
 */
function isObligation(item: ListItem, inObligationSection: boolean, directive: Directive | null): boolean {
  if (directive !== null) return true;
  if (item.checkbox !== null) return true;
  return inObligationSection && item.depth === 0;
}

/** The heading path enclosing an offset, outermost first. */
function sectionPathAt(scanned: ScannedDocument, offset: number): string[] {
  const { starts, paths } = sectionsOf(scanned.headings);
  // The last heading that opens at or before the offset. A heading opening
  // exactly at it would be a reference or an item starting on a `#` or on
  // the first word of a setext heading - and a heading that begins with a
  // reference is no section name either way.
  let low = 0;
  let high = starts.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (starts[middle]! > offset) high = middle;
    else low = middle + 1;
  }
  return low === 0 ? [] : paths[low - 1]!.slice();
}

/**
 * Each heading's start, and the path it opens, built once for a document's
 * headings: every reference and every item asks for its section, and walking
 * the headings above each of them read a changelog of 16,000 lines, one
 * heading in twenty, in ten times the elements a quarter of it took.
 *
 * The cache changes how fast an answer arrives and never the answer: a
 * mutant that builds the index again on every call, or never keeps it, is
 * equivalent but for its cost, which tests/growth.test.ts holds and the
 * sweep does not run.
 */
const sections = new WeakMap<readonly Heading[], { readonly starts: readonly number[]; readonly paths: readonly (readonly string[])[] }>();

function sectionsOf(headings: readonly Heading[]): { readonly starts: readonly number[]; readonly paths: readonly (readonly string[])[] } {
  const known = sections.get(headings);
  if (known !== undefined) return known;
  const starts: number[] = [];
  const paths: string[][] = [];
  const path: Heading[] = [];
  for (const heading of headings) {
    while (path.length > 0 && path[path.length - 1]!.level >= heading.level) path.pop();
    path.push(heading);
    starts.push(heading.start);
    paths.push(path.map((entry) => entry.text));
  }
  const index = { starts, paths };
  sections.set(headings, index);
  return index;
}

/**
 * Memoised because it is called for every heading above every reference and
 * every item, and a corpus has only a handful of distinct headings - `Context`,
 * `Decision`, `Open Questions`, `See also` - repeated thousands of times.
 *
 * The cache changes how fast an answer arrives and never the answer, so no test
 * can see whether it is consulted, filled or bounded.
 */
const headingCache = new Map<string, string>();

function normaliseHeading(text: string): string {
  const cached = headingCache.get(text);
  if (cached !== undefined) return cached;
  const normalised = text
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Bounded so a pathological corpus of unique headings cannot grow it forever.
  if (headingCache.size < 4096) headingCache.set(text, normalised);
  return normalised;
}

/**
 * One-line form of an item for reports.
 *
 * Link syntax is flattened to its label. A finding that quotes the obligation
 * back at the reader should read like the sentence they wrote, not like the
 * Markdown source of it.
 */
function summarise(text: string): string {
  const flat = text
    // An image first, so that a badge wrapped in a link, `[![icon](i.png)](x)`,
    // leaves `[icon](x)` for the link's pattern rather than a stray `![icon](x)`.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // `[[target|display]]` keeps the display half: that is the text a reader
    // of the rendered document actually sees.
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length <= 120 ? flat : `${flat.slice(0, 117)}...`;
}

/* -------------------------------------------------------------------------- */
/* References                                                                 */
/* -------------------------------------------------------------------------- */

interface ReferenceContext {
  readonly scanned: ScannedDocument;
  readonly directives: readonly Directive[];
  readonly document: DocumentNode;
  /** The specification that owns an offset, for a reference outside any item. */
  readonly documentAt: (offset: number) => DocumentNode;
  readonly items: readonly ItemNode[];
  readonly byKey: ReadonlyMap<string, YamlEntry>;
  readonly status: StatusReading;
  /** Cell ranges already typed by a table column header. */
  readonly claimed: readonly { start: number; end: number }[];
  readonly file: string;
  readonly index: LineIndex;
}

/**
 * True when an offset falls in a cell a column header already accounted for.
 *
 * Whether the end is in or out decides nothing: what sits there is the cell's
 * closing pipe or the space before it, and no reference starts on either.
 */
function isClaimed(claimed: readonly { start: number; end: number }[], offset: number): boolean {
  return claimed.some((range) => offset >= range.start && offset < range.end);
}

/**
 * Whether a word a `@spec-edge` gives as its kind is a relation.
 *
 * Asked of the list, as a selector's relation is: the word was once taken as
 * it stood, so `kind="blocks"` made an edge of a kind no rule knows, a
 * document with such an edge to itself ended the run, and `kind="constructor"`
 * did not, since the table of kinds is an object and answers to that name.
 */
function isEdgeKind(word: string): word is EdgeKind {
  return (EDGE_KINDS as readonly string[]).includes(word);
}

function extractReferences(context: ReferenceContext): ReferenceCandidate[] {
  const { scanned, directives, document, documentAt, items, byKey, status, claimed, file, index } = context;
  // This list and the one `withoutOverlaps` builds from it are only ever read
  // through `belongsTo`, which passes nothing that was not written on a
  // document or one of its items: a stray entry in either would reach no one.
  const out: ReferenceCandidate[] = [];
  const at = (start: number, end: number): SourceRef => refOf(file, index, start, end);

  // Front matter, walked in the order it was written rather than in the order
  // the vocabulary happens to be listed: a key the table does not know still has
  // to be looked at, and only the document knows which those are.
  for (const [key, entry] of byKey) {
    const relation = RELATION_INDEX.get(foldRelationKey(key));
    if (!relation) continue;
    for (const value of valuesOf(entry)) {
      const target = cleanTarget(value);
      if (target.length === 0) continue;
      out.push({
        kind: relation.kind,
        from: document.id,
        target,
        origin: 'front-matter',
        declaredAt: at(entry.valueStart, entry.end),
        raw: `${key}: ${value}`,
        inverted: relation.inverted,
        opportunistic: false,
      });
    }
  }

  // `status: Superseded by ADR-0009` is the most common supersession record of
  // all, and it never appears as a field of its own. A reading carries its text
  // and its place together or neither, so either test alone would do.
  if (status.raw && status.at) {
    for (const target of supersessionTargetsIn(status.raw)) {
      const cleaned = cleanTarget(target);
      if (cleaned.length === 0) continue;
      out.push({
        kind: 'supersedes',
        from: document.id,
        target: cleaned,
        origin: 'front-matter',
        declaredAt: status.at,
        raw: status.raw,
        inverted: true,
        opportunistic: true,
      });
    }
  }

  // A figure's record is a citation the directive makes: one that does not
  // resolve is a broken reference like any other (ADR-0028).
  for (const directive of directives) {
    // Another directive given a record names nothing: the attribute is a
    // parse problem there, as any it does not take.
    if (directive.name !== 'spec-figure') continue;
    const record = attr(directive, 'record');
    if (!record) continue;
    out.push({
      kind: 'references',
      from: ownerOf(items, directive.start) ?? documentAt(directive.start).id,
      target: record.value,
      origin: 'directive',
      declaredAt: at(record.start, record.end),
      raw: `@spec-figure record="${record.value}"`,
      inverted: false,
      opportunistic: false,
    });
  }

  // Explicit edge directives.
  for (const directive of directives) {
    if (directive.name !== 'spec-edge') continue;
    const written = attr(directive, 'kind')?.value;
    const to = attr(directive, 'to');
    const from = attr(directive, 'from');
    if (!written) continue;
    // A word that names no relation is still a link to somewhere, as a cell
    // under a column that names none is: a citation, and no more than one.
    const kind: EdgeKind = isEdgeKind(written) ? written : 'references';
    const owner = ownerOf(items, directive.start) ?? documentAt(directive.start).id;
    if (to) {
      out.push({
        kind,
        from: owner,
        target: to.value,
        origin: 'directive',
        declaredAt: at(to.start, to.end),
        raw: `@spec-edge kind="${written}" to="${to.value}"`,
        inverted: false,
        opportunistic: false,
      });
    }
    if (from) {
      out.push({
        kind,
        from: owner,
        target: from.value,
        origin: 'directive',
        declaredAt: at(from.start, from.end),
        raw: `@spec-edge kind="${written}" from="${from.value}"`,
        inverted: true,
        opportunistic: false,
      });
    }
  }

  // Prose links. A cell whose meaning a column header already gave is skipped,
  // so `| ADR-0002 | ... | [ADR-0001](0001.md) |` yields one typed edge rather
  // than a typed edge and a neutral citation beside it.
  const linked = new Set<string>();
  const links = referenceLinks(scanned);
  const words = withNegationsInCode(scanned);
  for (const link of links) {
    if (link.form === 'definition') continue;
    if (isClaimed(claimed, link.start)) continue;
    const target = cleanTarget(link.target);
    if (target.length === 0) continue;
    if (isExternal(target)) continue;

    const owner = ownerOf(items, link.start) ?? documentAt(link.start).id;
    const section = sectionPathAt(scanned, link.start);
    const classified = classifyReference(words, link.start, link.end, section);

    linked.add(normaliseRef(stripAnchor(target)));
    out.push({
      kind: classified.kind,
      from: owner,
      target,
      origin: 'link',
      declaredAt: at(link.targetStart, link.targetEnd),
      raw: renderLink(link),
      inverted: classified.inverted,
      opportunistic: false,
    });
  }

  // Bare identifiers in prose. Everything already covered by a link is skipped
  // so a citation written as `[ADR-7](0007.md)` is not counted twice.
  for (const bare of findBareReferences(scanned, links)) {
    const key = normaliseRef(bare.text);
    if (linked.has(key)) continue;
    if (isClaimed(claimed, bare.start)) continue;
    const owner = ownerOf(items, bare.start) ?? documentAt(bare.start).id;
    const section = sectionPathAt(scanned, bare.start);
    const classified = classifyReference(words, bare.start, bare.end, section);
    out.push({
      kind: classified.kind,
      from: owner,
      target: bare.text,
      origin: 'text',
      declaredAt: at(bare.start, bare.end),
      raw: bare.text,
      inverted: classified.inverted,
      opportunistic: true,
    });
  }

  return withoutOverlaps(out);
}

/**
 * Collapses candidates that describe the same written citation.
 *
 * `Superseded by ADR-0009` in a status section is read twice: the status
 * reader reports the whole line, and prose scanning reports the identifier
 * inside it. One written citation is one reference - so when the target
 * resolves it must not become two edges, and when it does not it must not
 * become two findings on one line a reader can only fix once.
 *
 * The narrower span wins, because it points at the text that has to change.
 *
 * Only overlapping spans collapse. Two sentences citing the same missing
 * document are two citations, and silently reporting one of them would leave
 * the other to be discovered on the next run.
 *
 * Linear in the candidates but for one sort of each set that read alike.
 * Every candidate was compared with every one kept before it, and folded
 * both spellings each time: a changelog of 1,500 lines took 1.2 seconds and
 * one of 3,000 took 4.0, nine tenths of it here.
 */
function withoutOverlaps(candidates: readonly ReferenceCandidate[]): ReferenceCandidate[] {
  // Only readings of one target, by one owner, in one direction, of one kind
  // can be one citation, so each is compared only with those. Today the only
  // readings that can overlap are a status line and the prose inside it, and
  // where they disagree they disagree on kind and direction together: the
  // kind, owner and direction in the key cannot be told apart one by one, and
  // each is there for a reader that differs in one.
  const alike = new Map<string, number[]>();
  candidates.forEach((candidate, at) => {
    // Kind, direction and folded target hold no space, so the owner is the rest.
    const key = `${candidate.kind} ${String(candidate.inverted)} ${normaliseRef(candidate.target)} ${candidate.from}`;
    const set = alike.get(key);
    if (set === undefined) alike.set(key, [at]);
    else set.push(at);
  });

  // Each run of spans that overlap is one citation. It takes the place of its
  // first reading and is its narrowest, because that points at the text that
  // has to change: the status reader runs before prose scanning, so the
  // place is the status line's and the reading the prose's. Of two as narrow
  // the one earlier in the text is kept: alike in everything a reader sees,
  // which is kept cannot matter.
  const kept = new Map<number, ReferenceCandidate>();
  const dropped = new Set<number>();
  for (const set of alike.values()) {
    // Only saves the sort: a run of one is left as it is.
    if (set.length === 1) continue;
    const order = [...set].sort((a, b) => offset(candidates[a]!) - offset(candidates[b]!) || a - b);
    let run: number[] = [];
    // Any value no span starts below: an empty run is left as it is.
    let reach = -1;
    const close = (): void => {
      if (run.length < 2) return;
      const place = Math.min(...run);
      let best = place;
      for (const at of run) if (width(candidates[at]!.declaredAt) < width(candidates[best]!.declaredAt)) best = at;
      for (const at of run) if (at !== place) dropped.add(at);
      kept.set(place, candidates[best]!);
    };
    for (const at of order) {
      const span = candidates[at]!.declaredAt.span;
      // Offsets alone: every candidate here was built from one scan of one
      // file. Spans that only touch never occur between two readings of one
      // target, so whether touching counts as overlapping decides nothing.
      if (span.start.offset >= reach) {
        close();
        run = [];
      }
      run.push(at);
      reach = Math.max(reach, span.end.offset);
    }
    close();
  }

  const out: ReferenceCandidate[] = [];
  candidates.forEach((candidate, at) => {
    if (!dropped.has(at)) out.push(kept.get(at) ?? candidate);
  });
  return out;
}

const offset = (candidate: ReferenceCandidate): number => candidate.declaredAt.span.start.offset;

const width = (ref: SourceRef): number => ref.span.end.offset - ref.span.start.offset;

/**
 * The item whose block contains an offset, if any.
 *
 * An item's span runs from its indentation or list marker to the line break
 * that ends it, and no reference or directive starts on either, so both bounds
 * could be closed or open alike. Items arrive in document order, where a nested
 * item follows the one it nests in and never shares its start: the last item
 * that contains the offset is the innermost, which the comparison below says
 * rather than relies on.
 */
function ownerOf(items: readonly ItemNode[], offset: number): string | null {
  let best: ItemNode | null = null;
  for (const item of items) {
    const span = item.at.span;
    if (offset < span.start.offset || offset >= span.end.offset) continue;
    if (best === null || span.start.offset > best.at.span.start.offset) best = item;
  }
  return best?.id ?? null;
}

export interface Classification {
  readonly kind: EdgeKind;
  readonly inverted: boolean;
}

/**
 * Decides what a reference means from the words around it.
 *
 * The nearest governing phrase within {@link VERB_WINDOW} characters wins, and
 * the search never crosses a sentence boundary. With nothing to go on, a
 * reference under a "See also" heading is bookkeeping and everything else is a
 * neutral citation.
 */
export function classifyReference(
  text: string,
  start: number,
  end: number,
  section: readonly string[],
): Classification {
  const { words: before, commas } = sentenceBefore(text, start);

  // Left to right, so the last match within the window is the nearest one - and
  // the nearest governing phrase is the one that governs. `matchAll`, not a
  // loop over `exec`: an empty match leaves `lastIndex` where it began, and
  // `exec` finds it there again for ever, where `matchAll` steps past it. No
  // phrase is empty, so the pattern never matches empty; a phrase emptied by
  // mistake then fails the tests rather than hanging them.
  let best: Classification | null = null;
  for (const m of before.matchAll(VERB_PATTERN)) {
    const phrase = m[0];
    const end = m.index + phrase.length;
    const distance = before.length - end;
    if (distance > VERB_WINDOW) continue;
    // What sits between the phrase and the reference has to be connective. A
    // negation in there reverses the claim the phrase would otherwise make,
    // and so does one just before the phrase, where no comma ends its clause
    // first. A pointer in there governs the reference itself, as a citation.
    if (NEGATION.test(before.slice(end))) continue;
    if (POINTER.test(before.slice(end))) continue;
    // A negation before a phrase stands between any phrase before it and the
    // reference, and denies what follows it: a phrase it leaves before an
    // aside governs no more than the one it cancels, so "Not, as decided in
    // [ADR-3], blocked by [ADR-7]" makes ADR-7 a premise of nothing.
    if (NEGATED_BEFORE.test(commas.slice(0, m.index))) {
      best = null;
      continue;
    }
    // Always found: the pattern was compiled from this table's own keys, and a
    // lower-cased search matches them only as written. The check is for types.
    const rule = VERB_LOOKUP.get(phrase);
    if (rule) best = rule;
  }

  if (best) return best;

  // "[ADR-0009] supersedes this decision": the reference is the subject, so the
  // relation runs the other way.
  const after = sentenceAfter(text, end);
  for (const rule of VERB_RULES) {
    if (rule.inverted) continue;
    for (const phrase of rule.phrases) {
      if (!after.startsWith(phrase)) continue;
      if (rule.kind === 'assumes' || rule.kind === 'depends-on') continue;
      return { kind: rule.kind, inverted: true };
    }
  }

  // Any enclosing heading will do: a link under `### Notes` inside `## See also`
  // is bookkeeping still.
  for (const heading of section) {
    if (WEAK_SECTIONS.has(normaliseHeading(heading))) return { kind: 'relates-to', inverted: false };
  }

  return { kind: 'references', inverted: false };
}

/** A sentence end, a blank line, or the start of a new block-level item. */
/**
 * A table cell edge ends a statement too.
 *
 * The pipe matters more than it looks. A table row is a list of independent
 * fields, and without it the look-behind window reaches back across the row
 * boundary into the previous row's prose. An index of archived documents whose
 * last column ended "...before assuming the drift was fixed" turned every
 * following row's link into an `assumes` edge, and so turned every archived
 * document it listed into a stale premise.
 *
 * A sentence written in Chinese ends at `。？！；`, with a space after it or
 * none, since Chinese writes none. A stop only ends a statement sooner, so it
 * reads fewer relations and never more: without it,
 * `Deferred to later。另見 ADR-0002` handed the question to ADR-0002 from the
 * sentence before.
 */
const STATEMENT_BREAK = /[.?!;]\s|[。？！；]|\n\s*\n|\n\s*[-*+>#]|\|/g;

/**
 * Lower-cased, whitespace-collapsed text back to the start of the statement.
 *
 * The search stops at the last boundary: a governing phrase in the *previous*
 * sentence does not govern this reference. "We deferred that to ADR-3. See also
 * [ADR-9]." must not read as a delegation to ADR-9.
 *
 * Emphasis, brackets and commas are blanked. A straight quote and a straight
 * apostrophe are kept, as the curly ones always were, since a negation
 * before a phrase is read by what stands against it: a quoted `"never"`
 * names a word, and `isn't` is one word. Kept, each counts toward the
 * distance a phrase reaches where it stands beside a space, as a curly one
 * did (ADR-0006, 2026-10-18).
 *
 * The same text is given a second time with each run of spaces that held a
 * comma written as the comma: one character either way, so the two line up
 * and a comma counts toward no phrase's reach, and a negation before a
 * phrase is read from the second, where a comma keeps the two apart
 * (ADR-0006, 2026-10-19).
 */
function sentenceBefore(text: string, start: number): { readonly words: string; readonly commas: string } {
  const window = text.slice(Math.max(0, start - 160), start);
  let cut = 0;
  for (const m of window.matchAll(STATEMENT_BREAK)) cut = m.index + m[0].length;
  const statement = window
    .slice(cut)
    .toLowerCase()
    .replace(/[`*_~()\[\]]/g, ' ');
  return {
    words: statement.replace(/[\s,]+/g, ' '),
    commas: statement.replace(/[\s,]+/g, (run) => (run.includes(',') ? ',' : ' ')),
  };
}

/**
 * The statement after a reference, to the first stop, the stops of a sentence
 * written in Chinese included.
 *
 * Only its start is read. A line break matters as a stop, since the trim
 * below would otherwise bring the next line's phrase to the start. A Chinese
 * stop is never trimmed, so a phrase after one cannot start the text either
 * way, and the mutants that drop one are equivalent: it is here so the
 * statement is the one `sentenceBefore` reads.
 */
function sentenceAfter(text: string, end: number): string {
  const window = text.slice(end, Math.min(text.length, end + 80));
  const stop = /[.?!;\n|。？！；]/.exec(window);
  const cut = stop ? window.slice(0, stop.index) : window;
  return cut.toLowerCase().replace(/[`*_~"'()\[\],]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The structure mask, with the word of each code span that holds nothing
 * but a negation written back where the span was: what a reference's
 * phrase and its negation are read from.
 *
 * A word written back over itself changes nothing, so the backticks the
 * scanner read as text, and so left in the structure, need no telling apart
 * from a span. A span inside a code block can be written back too: a block
 * is blank lines in the structure, which end a statement before any
 * reference after it reads back so far.
 */
function withNegationsInCode(scanned: ScannedDocument): string {
  const { structure, prose } = scanned.masks;
  let text = '';
  let cursor = 0;
  for (const m of prose.matchAll(NEGATION_IN_CODE)) {
    const word = m[2]!;
    const at = m.index + m[0].indexOf(word);
    text += structure.slice(cursor, at) + word;
    cursor = at + word.length;
  }
  return text + structure.slice(cursor);
}

interface BareReference {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Finds identifiers written as plain prose, such as "as decided in ADR-0007".
 *
 * Link constructs are blanked first. Without that, `[ADR-7](https://x/adr-7)`
 * would yield three references to the same thing - one real and two harvested
 * out of a URL - which is precisely the mis-match that makes hand-rolled regex
 * checks untrustworthy. Images are not blanked, since they are not references:
 * an identifier in one's text is prose, as it always was here.
 */
function findBareReferences(scanned: ScannedDocument, links: readonly Link[]): BareReference[] {
  // Slice-based for the same reason as the scanner's masking: this runs over
  // every document, and a per-character array is the wrong shape for the job.
  const source = scanned.masks.structure;
  let text = '';
  let cursor = 0;
  for (const link of links) {
    const start = Math.max(link.start, cursor);
    const end = Math.min(link.end, source.length);
    // Links from one scan come in order and never nest, so this skips nothing
    // today. It keeps a scanner that did nest them from copying text twice.
    if (end <= start) continue;
    text += source.slice(cursor, start);
    text += source.slice(start, end).replace(/[^\n\r]/g, ' ');
    cursor = end;
  }
  text += source.slice(cursor);
  return bareReferencesIn(text);
}

/** The identifiers a text cites as prose does, with their offsets in it. */
function bareReferencesIn(text: string): BareReference[] {
  const out: BareReference[] = [];
  for (const m of text.matchAll(BARE_REF)) {
    const written = m[0];
    // The family as resolution will read it, which takes the shortest prefix
    // the number allows: `base64` is `base` and 64. Read off this pattern's
    // greedy prefix it was `base6` and 4, and `ES2015`, `ARM64` and `Win32`
    // walked past the list below as families of their own. Every match is a
    // prefixed identifier by construction, so the parse cannot fail.
    const family = (parsePrefixedRef(written) as { family: string }).family.toLowerCase();
    if (NOT_A_FAMILY.has(family)) continue;
    if (family.length < 2) continue;
    const start = m.index;
    // A token glued to a path separator or an extension is not a citation. At
    // either end of the text the stand-in need only be neither `/` nor `.`.
    const before = text[start - 1] ?? ' ';
    const after = text[start + written.length] ?? ' ';
    if (before === '/' || before === '.' || after === '/') continue;
    out.push({ text: written, start, end: start + written.length });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function firstValue(byKey: ReadonlyMap<string, YamlEntry>, keys: readonly string[]): string | null {
  for (const key of keys) {
    // A key that is missing reads as null, the same as a blank one.
    const value = asString(byKey.get(key));
    if (value !== null && value.length > 0) return value;
  }
  return null;
}

function asString(entry: YamlEntry | undefined): string | null {
  if (!entry) return null;
  if (typeof entry.value === 'string') return entry.value.trim().length > 0 ? entry.value.trim() : null;
  return entry.value.length > 0 ? (entry.value[0] as string) : null;
}

/** Strips Markdown decoration a target may still be wearing. */
function cleanTarget(value: string): string {
  return value
    .trim()
    .replace(/^[`'"<(\[]+/, '')
    .replace(/[`'">)\]]+$/, '')
    .replace(/[.,;]+$/, '')
    .trim();
}

function stripAnchor(target: string): string {
  const hash = target.indexOf('#');
  return hash <= 0 ? target : target.slice(0, hash);
}

/**
 * A link's text for an edge's `raw`.
 *
 * An autolink never reaches here: spec-core reads one only when it carries a
 * scheme, and a link with a scheme is external and was dropped before this. A
 * reference or shortcut link always has a label, so the `''` is for the type.
 */
function renderLink(link: Link): string {
  switch (link.form) {
    case 'wiki':
      return `[[${link.target}]]`;
    case 'reference':
    case 'shortcut':
      return `[${link.text}][${link.label ?? ''}]`;
    default:
      return `[${link.text}](${link.target})`;
  }
}

/** Exposed for tests and for callers that classify their own sections. */
export { OBLIGATION_SECTIONS, sectionPathAt, WEAK_SECTIONS };
