/**
 * Explicit annotations, written as HTML comments.
 *
 * Inference covers the overwhelming majority of real documents, but inference
 * that cannot be overridden is a trap: the first time it guesses wrong about a
 * document somebody cannot restructure, the whole tool gets switched off. These
 * directives are the escape hatch, and they are HTML comments so they stay
 * invisible in GitHub, MkDocs, Docusaurus and every other renderer.
 *
 * ```md
 * <!-- @spec-node id="ADR-0007" status="accepted" aliases="adr-7, sharding" -->
 * <!-- @spec-item id="shard-key" state="narrowed" -->
 * <!-- @spec-edge kind="delegates-to" to="ADR-0011#scope" -->
 * <!-- @spec-ignore -->
 * ```
 *
 * A directive always wins over anything inferred, and says so in the report, so
 * an override is visible rather than mysterious.
 */

import { bindToItems, type HtmlComment, type ListItem, type ScannedDocument } from './markdown.js';

export type DirectiveName = 'spec-node' | 'spec-item' | 'spec-edge' | 'spec-ignore' | 'spec-history' | 'spec-figure' | 'spec-path' | 'spec-command';

const KNOWN: ReadonlySet<string> = new Set<DirectiveName>([
  'spec-node',
  'spec-item',
  'spec-edge',
  'spec-ignore',
  'spec-history',
  'spec-figure',
  'spec-path',
  'spec-command',
]);

export interface Attribute {
  readonly value: string;
  /** Absolute offset of the value text, quotes excluded. */
  readonly start: number;
  readonly end: number;
}

export interface Directive {
  readonly name: DirectiveName;
  readonly attributes: ReadonlyMap<string, Attribute>;
  /** Offset of the enclosing comment. */
  readonly start: number;
  readonly end: number;
  readonly line: number;
  /** Attribute names that were written but are not part of this directive. */
  readonly unknownAttributes: readonly string[];
}

const DIRECTIVE_HEAD = /^\s*@([a-z][a-z0-9-]*)/;
const ATTRIBUTE = /([A-Za-z_][A-Za-z0-9_-]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g;

/** Attributes each directive understands. Anything else is reported, not ignored. */
const SCHEMA: Readonly<Record<DirectiveName, readonly string[]>> = {
  'spec-node': ['id', 'status', 'title', 'aliases', 'kind'],
  // Takes no attributes: the file either is a record or it is not. A mutant
  // that lists `Stryker was here` lists no name: one never holds a space.
  'spec-history': [],
  'spec-item': ['id', 'state', 'title', 'owner', 'note'],
  'spec-edge': ['kind', 'to', 'from', 'reason'],
  'spec-ignore': ['reason'],
  // A figure the document states, and the record it rests on (ADR-0028).
  'spec-figure': ['record', 'reason'],
  // Paths a document may name that the repository does not hold (ADR-0029).
  'spec-path': ['created', 'external', 'reason'],
  // Scripts, targets and recipes a document may name that no manifest declares yet (ADR-0029).
  'spec-command': ['created', 'reason'],
};

/**
 * Reads every spec-graph directive out of a document's HTML comments.
 *
 * Only out of a comment that closes. One that opens a line and never does runs
 * to the end of the document, and read as a directive, a stray
 * `<!-- @spec-ignore` would drop the file, and a stray `<!-- @spec-node` would
 * take every `name=value` in the rest of it as an attribute.
 */
export function parseDirectives(comments: readonly HtmlComment[]): Directive[] {
  const out: Directive[] = [];
  for (const comment of comments) {
    if (comment.closed === false) continue;
    const head = DIRECTIVE_HEAD.exec(comment.inner);
    if (!head) continue;
    const name = head[1] as string;
    if (!KNOWN.has(name)) continue;

    const directiveName = name as DirectiveName;
    // The head is anchored, so it starts where the comment's text does.
    const bodyStart = (head[0] as string).length;
    const body = comment.inner.slice(bodyStart);
    const attributes = new Map<string, Attribute>();
    const unknown: string[] = [];
    const allowed = SCHEMA[directiveName];

    for (const m of body.matchAll(ATTRIBUTE)) {
      const key = (m[1] as string).toLowerCase();
      const quoted = m[3] ?? m[4];
      const bare = m[5];
      // A bare attribute is a flag: `<!-- @spec-ignore reason -->`.
      const value = quoted ?? bare ?? 'true';
      const raw = m[2];
      const valueOffset =
        raw === undefined
          ? (m.index ?? 0) + (m[0] as string).length
          : (m.index ?? 0) + (m[0] as string).indexOf(raw) + (quoted === undefined ? 0 : 1);
      const start = comment.innerStart + bodyStart + valueOffset;

      if (!allowed.includes(key)) unknown.push(key);
      attributes.set(key, { value, start, end: start + value.length });
    }

    out.push({
      name: directiveName,
      attributes,
      start: comment.start,
      end: comment.end,
      line: comment.line,
      unknownAttributes: unknown,
    });
  }
  return out;
}

/** Reads an attribute, trimmed. Returns `null` when absent or blank. */
export function attr(directive: Directive, name: string): Attribute | null {
  const found = directive.attributes.get(name);
  if (!found) return null;
  const trimmed = found.value.trim();
  if (trimmed.length === 0) return null;
  const offset = found.value.indexOf(trimmed);
  return { value: trimmed, start: found.start + offset, end: found.start + offset + trimmed.length };
}

/** Splits a comma- or whitespace-separated attribute into its parts. */
export function attrList(directive: Directive, name: string): string[] {
  const found = attr(directive, name);
  if (!found) return [];
  // Whitespace is a separator, so no part holds any to trim. The filter drops
  // what a separator at either end leaves, and would drop what each separator
  // in a run leaves too, so splitting at one at a time is equivalent.
  return found.value.split(/[,;\s]+/).filter((part) => part.length > 0);
}

/**
 * Finds the directive that annotates a given region.
 *
 * A `@spec-item` directive may sit on the line above the item, on the same
 * line, or inside the item body. All three read naturally in the source, so all
 * three are accepted, with the closest preceding directive winning.
 *
 * It answers for one region with no view of the others, so a directive in reach
 * of two items is found for both. Extraction uses `bindItemDirectives`.
 */
export function directiveFor(
  directives: readonly Directive[],
  name: DirectiveName,
  region: { start: number; end: number },
  /** How far above the region a directive may sit and still apply. */
  lookBehind: number,
): Directive | null {
  let best: Directive | null = null;
  for (const directive of directives) {
    if (directive.name !== name) continue;
    const inside = directive.start >= region.start && directive.end <= region.end;
    const above = directive.end <= region.start && region.start - directive.end <= lookBehind;
    if (!inside && !above) continue;
    // Two directives never start at one offset, so `>=` reads the same.
    if (best === null || directive.start > best.start) best = directive;
  }
  return best;
}

/**
 * Pairs each `@spec-item` directive with the one list item it annotates.
 *
 * A directive is written for one item, so it binds to one: the item directly
 * below it, with nothing but blank lines and other comments between, or else
 * the item it is written in, the innermost where items nest. An item that
 * several bind to takes the last one written.
 *
 * A directive alone on its line is in an item only when indented further than
 * that item's marker, which is how CommonMark reads it. Indented under an item,
 * it annotates that item and not the sibling below; flush between two items, it
 * annotates the second.
 */
export function bindItemDirectives(
  scanned: ScannedDocument,
  directives: readonly Directive[],
): Map<ListItem, Directive> {
  // The rule is spec-core's, `bindToItems`, which spec-brief reads by too.
  const wanted = directives.filter((directive) => directive.name === 'spec-item');
  const bound = new Map<ListItem, Directive>();
  bindToItems(scanned, wanted).forEach((item, at) => {
    if (item !== null) bound.set(item, wanted[at]!);
  });
  return bound;
}
