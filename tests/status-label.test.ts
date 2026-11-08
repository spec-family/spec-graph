import { describe, expect, it } from 'vitest';

import { analyseSources, type Source } from '../src/runner.js';

/**
 * A `Status:` label under the title: where spec-guard reads one, and as it
 * reads one (ADR-0002, amended 2026-11-08). Spec Kit's header block writes
 * `**Status**: Draft`, and design documents and postmortems the same; read as
 * no status, a superseded design document holding open items passed.
 */

const analyse = (files: Record<string, string>) =>
  analyseSources(Object.entries(files).map(([path, text]): Source => ({ path, text })));

/** The one document's phase and its status as written. */
function status(text: string): string {
  const [document] = analyse({ 'docs/design/cache.md': text }).graph.documents;
  return `${document?.phase} ${JSON.stringify(document?.rawStatus)}`;
}

const doc = (...lines: string[]): string => [...lines, ''].join('\n');

describe('a status label in the preamble', () => {
  it.each([
    ['plain', 'Status: Draft', 'draft "Draft"'],
    ['bold, the colon outside', '**Status**: Superseded', 'retired "Superseded"'],
    ['bold, the colon inside', '**Status:** Accepted', 'active "Accepted"'],
    ['bold with underscores', '__Status__: Proposed', 'draft "Proposed"'],
    ['bold, with spaces before the colon inside it', '**Status :** Accepted', 'active "Accepted"'],
    ['in any case, with no space after the colon', 'STATUS:accepted', 'active "accepted"'],
    ['with spaces before the colon', 'Status : Draft', 'draft "Draft"'],
    ['bold, with spaces before the colon outside it', '**Status** : Superseded', 'retired "Superseded"'],
    ['indented by three spaces', '   Status: Draft', 'draft "Draft"'],
    ['with a bold value', 'Status: **Draft**', 'draft "**Draft**"'],
  ])('is read written %s', (_, line, expected) => {
    expect(status(doc('# Cache design', '', line, '', '## Context', '', 'Words.'))).toBe(expected);
  });

  it('is read out of the header block Spec Kit writes', () => {
    const spec = doc(
      '# Feature Specification: Login',
      '',
      '**Feature Branch**: `001-login`  ',
      '**Created**: 2026-11-01  ',
      '**Status**: Draft  ',
      '**Input**: User description: "log in"',
      '',
      '## User Scenarios & Testing',
    );
    expect(status(spec)).toBe('draft "Draft"');
  });

  it('is read in a document with no heading at all, and under a setext title', () => {
    expect(status('Status: Draft\n')).toBe('draft "Draft"');
    expect(status(doc('Cache design', '============', '', 'Status: Draft'))).toBe('draft "Draft"');
  });

  it('retires a design document, whose open items are then held to it', () => {
    const { diagnostics } = analyse({
      'docs/design/cache.md': doc('# Cache design', '', 'Status:   Superseded', '', '## Open items', '', '- [ ] Decide the TTL'),
    });
    // At the status, which is what a reader would change.
    expect(diagnostics.map((d) => `${d.rule} ${d.at.file}:${d.at.span.start.line}:${d.at.span.start.column}-${d.at.span.end.column}`)).toEqual(['orphaned-obligation docs/design/cache.md:3:11-21']);
  });

  it('names what superseded the document, as a status anywhere else does', () => {
    const { diagnostics, graph } = analyse({
      'docs/adr/0001-cache.md': doc('# ADR-0001: Cache', '', '**Status**: Superseded by `ADR-0002`  '),
      'docs/adr/0002-no-cache.md': doc('---', 'status: accepted', '---', '', '# ADR-0002: No cache'),
    });
    expect(graph.documents.map((d) => d.rawStatus)).toEqual(['Superseded by `ADR-0002`', 'accepted']);
    expect(graph.out('ADR-0002', ['supersedes']).map((e) => e.to)).toEqual(['ADR-0001']);
    expect(diagnostics).toEqual([]);
  });
});

describe('a line spec-guard does not read as the status label', () => {
  it.each([
    ['in a list', '- **Status**: Superseded'],
    ['in a block quote', '> Status: Superseded'],
    ['in single emphasis', '*Status*: Superseded'],
    ['without a colon', 'Status reports are Superseded weekly'],
    ['with emphasis that does not close', '**Status: Superseded'],
    ['indented into code', '    Status: Superseded'],
    ['indented four spaces under a line of prose, which it continues', 'Words.\n    Status: Superseded'],
    ['in a comment', '<!-- Status: Superseded -->'],
  ])('is no status, %s', (_, line) => {
    expect(status(doc('# Cache design', '', line, '', '## Context'))).toBe('unknown null');
  });

  it('is no status once the preamble is over, at a heading of level two or deeper, ATX or setext', () => {
    expect(status(doc('# Cache design', '', '## Context', '', 'Status: Superseded was the outcome.'))).toBe('unknown null');
    expect(status(doc('# Cache design', '', 'Context', '-------', '', 'Status: Superseded'))).toBe('unknown null');
    // A line underlined is a heading, and the line that ends the preamble.
    expect(status(doc('# Cache design', '', 'Status: Superseded', '------------------'))).toBe('unknown null');
  });

  it('is no status in a fence, and a `##` in a fence or a comment does not end the preamble', () => {
    expect(status(doc('# Cache design', '', '```md', 'Status: Superseded', '```'))).toBe('unknown null');
    expect(status(doc('# Cache design', '', '```md', '## Example', '```', '', 'Status: Draft'))).toBe('draft "Draft"');
    expect(status(doc('# Cache design', '', '<!--', '## Template', '-->', '', 'Status: Draft'))).toBe('draft "Draft"');
  });

  it('is no status inside a comment of several lines, which is a template not yet filled in', () => {
    expect(status(doc('# Cache design', '', '<!--', 'Status: Superseded', '-->', '', '## Context'))).toBe('unknown null');
  });

  it('is a status that cannot be read, where its value begins with no word, and decides', () => {
    // spec-guard reads the first run of letters: a date, a code span, a quote
    // or a symbol first leaves none, and the document is not withdrawn.
    for (const value of ['2026-11-01 superseded', '`superseded`', '"superseded"', '✅ superseded', '']) {
      expect(status(doc('# Cache design', '', `Status: ${value}`, '', '## Context'))).toBe(`unknown ${JSON.stringify(value)}`);
    }
    // The first label decides, whether or not it can be read.
    expect(status(doc('# Cache design', '', 'Status: 2026 superseded', 'Status: Superseded'))).toBe('unknown "2026 superseded"');
  });
});

describe('a status label beside a status written elsewhere', () => {
  it('loses to front matter, a status section and a status table', () => {
    expect(status(doc('---', 'status: accepted', '---', '', '# Cache design', '', 'Status: Superseded'))).toBe('active "accepted"');
    expect(status(doc('# Cache design', '', '| Status | Accepted |', '| --- | --- |', '', 'Status: Superseded'))).toBe('active "Accepted"');
    expect(status(doc('# Cache design', '', 'Status: Superseded', '', '## Status', '', 'Accepted'))).toBe('active "Accepted"');
  });

  it('is not read in the place of one written there that says nothing, as spec-guard does not', () => {
    expect(status(doc('---', 'status:', '---', '', '# Cache design', '', 'Status: Superseded'))).toBe('unknown null');
    expect(status(doc('---', 'stage: ""', '---', '', '# Cache design', '', 'Status: Superseded'))).toBe('unknown null');
    expect(status(doc('# Cache design', '', '| Status | |', '| --- | --- |', '', 'Status: Superseded'))).toBe('unknown null');
    expect(status(doc('# Cache design', '', 'Status: Superseded', '', '## Status', '', '## Context'))).toBe('unknown null');
  });

  it('is not read under front matter that never closes', () => {
    expect(status(doc('---', 'title: Cache', '', '# Cache design', '', 'Status: Superseded'))).toBe('unknown null');
  });

  it('is a section\'s of a register, and not the file\'s', () => {
    const files = { 'docs/register.md': doc('# Register', '', '# ADR-0001: One writer', '', '**Status:** Superseded', '', 'We keep one writer.') };
    expect(analyse(files).graph.documents.map((d) => `${d.id} ${d.phase}`)).toEqual(['register unknown', 'ADR-0001 retired']);
  });
});

describe('a comment beside a status label', () => {
  it('says nothing either way, where spec-guard reads it as text', () => {
    // A hint before the value, as a status section reads one past it.
    expect(status(doc('# Cache design', '', 'Status: <!-- one of: draft, accepted --> Accepted'))).toBe('active "<!-- one of: draft, accepted --> Accepted"');
  });
});
