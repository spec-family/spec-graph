/**
 * What spec-graph reads out of a Markdown document.
 *
 * The scan is spec-core's, copied into `src/vendor/spec-core/markdown/`: one
 * pass that is exact about code and comments, as CommonMark is, and simple about
 * the rest (ADR-0001). It started as this file, and the guarantees it was
 * written for came with it: code never counts, items are blocks and not lines,
 * and everything carries absolute offsets.
 *
 * What stays here is what spec-graph decides about the scan, which no other
 * tool has to agree with: which links cite something, which anchors a heading
 * answers to, and which lines are Markdown at all.
 */

import type { FrontMatterBlock, Heading, Link, MarkdownScan, ScannedLine } from './vendor/spec-core/markdown/index.js';

import { slugify } from './vendor/spec-core/markdown/index.js';

export { bindToItems, findClaims, findCommitReferences, scanMarkdown, slugify } from './vendor/spec-core/markdown/index.js';
export type {
  Heading,
  HtmlComment,
  Link,
  LinkForm,
  ListItem,
  ScannedLine,
  Table,
  TableCell,
  TableRow,
} from './vendor/spec-core/markdown/index.js';
export type { Range } from './vendor/spec-core/text/index.js';

/** A scanned document, under the name the API has always given it. */
export type ScannedDocument = MarkdownScan;

/** The front-matter block at the top of a document, under the name the API has always given it. */
export type FrontMatter = FrontMatterBlock;

/**
 * Whether a line's content is Markdown.
 *
 * Code, the four raw-text HTML elements and front matter are not, for the same
 * reason: a heading, a status or an item written in one is an example or data,
 * and never a statement the document makes.
 */
export function isMarkdownLine(line: ScannedLine): boolean {
  return !line.code && !line.html && !line.frontMatter;
}

/**
 * Whether a line holds a comment and nothing else.
 *
 * For a reader that takes the first line of a section as its value, which is
 * what a status section is. A template's hint written above the value - `<!--
 * proposed | accepted -->` - is not the value, and neither is a directive. A
 * line that goes on past its comment, `<!-- hint --> Accepted`, is still read.
 */
export function isOnlyComment(scanned: ScannedDocument, line: ScannedLine): boolean {
  return line.comment && scanned.masks.structure.slice(line.contentStart, line.end).trim().length === 0;
}

/**
 * The links that cite something.
 *
 * An image shows a file and cites nothing: a diagram of a decision is not a
 * dependency on it, and a missing picture is a broken page, not a broken
 * relation. So images are not references, as they never were. A wiki embed,
 * `![[0007-sharding]]`, is the exception - it transcludes the note it names,
 * which is the strongest citation a wiki can write - and spec-graph has always
 * read it as one.
 */
export function referenceLinks(scanned: ScannedDocument): Link[] {
  return scanned.links.filter((link) => !link.image || link.form === 'wiki');
}

/**
 * The anchors a set of headings answers to.
 *
 * Each heading's slug, and the anchor GitHub gives it, which is the slug with
 * `-1`, `-2` and so on for the second and later headings that slug alike. A
 * link written against the rendered page uses the anchor; one written by hand
 * uses the slug, and for any heading but a repeat the two are one.
 *
 * And the anchor GitHub itself gives the heading, spec-core's `githubAnchor`:
 * it keeps `_`, and slugs the text as rendered, a link's text without its
 * URL. `#snake_case_name` and release-please's `## [1.2.0](url) (date)`,
 * `#120-date`, were broken references against the slug alone. Beside the
 * slug and not in its place, so every link and baseline entry written
 * against the slug still binds; none where the anchor depends on more than
 * the heading's line.
 *
 * And the anchors a document declares for itself, which round 29's
 * evaluation found reported as broken on real repositories: an `{#id}` a
 * heading ends with, as kramdown, Pandoc and Docusaurus read it, with the
 * slug of the heading's text before it; an `id` on any HTML element; and a
 * `name` on an `<a>`, the two ways a README marks a place no heading is.
 * `structure` is the text with code and comments blanked, so `<a id>` in a
 * code sample declares nothing. In lower case, as a link is compared.
 */
export function anchorsOf(headings: readonly Heading[], structure = ''): Set<string> {
  const out = new Set<string>();
  for (const heading of headings) {
    out.add(heading.slug);
    out.add(heading.anchor);
    if (heading.githubAnchor !== null) out.add(heading.githubAnchor);
    const declared = HEADING_ID.exec(heading.text);
    if (declared !== null) {
      out.add(declared[1]!.toLowerCase());
      out.add(slugify(heading.text.slice(0, declared.index)));
    }
  }
  for (const tag of structure.matchAll(HTML_TAG)) {
    const element = tag[1]!.toLowerCase();
    for (const attribute of tag[2]!.matchAll(HTML_ANCHOR_ATTRIBUTE)) {
      if (attribute[1]!.toLowerCase() === 'name' && element !== 'a') continue;
      const value = (attribute[2] ?? attribute[3] ?? attribute[4]!).trim().toLowerCase();
      if (value.length > 0) out.add(value);
    }
  }
  return out;
}

/** `## Rationale {#why}`: an id the heading declares for itself, at its end. */
const HEADING_ID = /\s*\{#([^\s{}]+)\}\s*$/;

/** An opening HTML tag: its element and what follows the name. */
const HTML_TAG = /<([A-Za-z][\w-]*)(\s[^<>]*)>/g;

/** An `id` or `name` attribute of a tag, quoted either way or not at all. */
const HTML_ANCHOR_ATTRIBUTE = /\s(id|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
