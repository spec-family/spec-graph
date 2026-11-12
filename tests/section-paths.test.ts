import { describe, expect, it } from 'vitest';

import type { ScannedDocument } from '../src/markdown.js';

/**
 * The section path at an offset is read off an index of the document's
 * headings, built once, where it was a walk down every heading above the
 * offset for each reference and item - which made one long changelog take
 * time in the square of its headings (tests/growth.test.ts holds the cost).
 *
 * The walk is the definition, kept here, and the index answers as it does at
 * every offset of a document written to have every case: levels skipped and
 * climbed back, a setext heading, a heading in code that is none, and an
 * offset on a heading's first character, which that heading does not
 * enclose by its own text alone but does by the walk's rule.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test.
 */

/** The heading path enclosing an offset, as it was read before the index. */
function walked(scanned: ScannedDocument, offset: number): string[] {
  const path: { level: number; text: string }[] = [];
  for (const heading of scanned.headings) {
    if (heading.start > offset) break;
    while (path.length > 0 && path[path.length - 1]!.level >= heading.level) path.pop();
    path.push({ level: heading.level, text: heading.text });
  }
  return path.map((entry) => entry.text);
}

const DOCUMENT = [
  'Before any heading, see [x](x.md).',
  '',
  '# Title',
  '',
  'Text under the title.',
  '',
  '## A',
  '',
  '### A.1',
  '',
  '##### A.1 deep, a level skipped',
  '',
  '### A.2',
  '',
  'Setext B',
  '--------',
  '',
  '```md',
  '## Not a heading',
  '```',
  '',
  '###### Six',
  '',
  '# Second',
  '',
  '## C',
  'Text under C.',
  '',
].join('\n');

describe('the section path at an offset', () => {
  it('is the walk down the headings above it, at every offset', async () => {
    const { scanMarkdown } = await import('../src/markdown.js');
    const { sectionPathAt } = await import('../src/extract.js');
    const scanned = scanMarkdown(DOCUMENT);
    expect(scanned.headings.map((heading) => heading.text)).toEqual(['Title', 'A', 'A.1', 'A.1 deep, a level skipped', 'A.2', 'Setext B', 'Six', 'Second', 'C']);
    const offsets = Array.from({ length: DOCUMENT.length + 1 }, (_, offset) => offset);
    expect(offsets.map((offset) => sectionPathAt(scanned, offset))).toEqual(offsets.map((offset) => walked(scanned, offset)));
  });

  it('opens on the first character of a heading, and not one before it', async () => {
    const { scanMarkdown } = await import('../src/markdown.js');
    const { sectionPathAt } = await import('../src/extract.js');
    const scanned = scanMarkdown(DOCUMENT);
    const c = scanned.headings.at(-1)!;
    expect(sectionPathAt(scanned, c.start)).toEqual(['Second', 'C']);
    expect(sectionPathAt(scanned, c.start - 1)).toEqual(['Second']);
    expect(sectionPathAt(scanned, 0)).toEqual([]);
    expect(sectionPathAt(scanned, scanned.headings[0]!.start)).toEqual(['Title']);
  });

  it('is its own for each document, and a fresh list each time it is asked', async () => {
    const { scanMarkdown } = await import('../src/markdown.js');
    const { sectionPathAt } = await import('../src/extract.js');
    const first = scanMarkdown(DOCUMENT);
    const second = scanMarkdown('# Other\n\n## Part\n\nText.\n');
    const end = DOCUMENT.length;
    expect(sectionPathAt(first, end)).toEqual(['Second', 'C']);
    expect(sectionPathAt(second, 20)).toEqual(['Other', 'Part']);
    sectionPathAt(first, end).push('changed by a caller');
    expect(sectionPathAt(first, end)).toEqual(['Second', 'C']);
    expect(sectionPathAt(scanMarkdown('No heading at all.\n'), 5)).toEqual([]);
  });
});
