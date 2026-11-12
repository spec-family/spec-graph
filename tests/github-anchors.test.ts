import { describe, expect, it } from 'vitest';

import type { Source } from '../src/runner.js';

/**
 * A heading answers to the anchor GitHub gives it, beside spec-graph's slug
 * (spec-core's `githubAnchor`, from 102cec9).
 *
 * GitHub keeps `_` and slugs the text as rendered, so `#snake_case_name`,
 * `#why-remove-restricted_std` and release-please's `## [1.2.0](url) (date)`,
 * `#120-date`, were broken references on real repositories. The slug stays,
 * so every link and baseline entry written against it still binds, and so do
 * item ids, which are made from it.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test, and a sweep reads that as a survived mutant.
 */

async function analyse(files: Record<string, string>) {
  const { analyseSources } = await import('../src/runner.js');
  return analyseSources(Object.entries(files).map(([path, text]): Source => ({ path, text })));
}

const broken = async (files: Record<string, string>): Promise<string[]> =>
  (await analyse(files)).diagnostics.filter((d) => d.rule === 'broken-reference').map((d) => d.target ?? '');

const target = [
  '# Target',
  '',
  '## snake_case_name',
  '',
  '## Why remove restricted_std',
  '',
  '## [1.2.0](https://example.com/compare/v1.1.0...v1.2.0) (2026-11-12)',
  '',
  '## a_b',
  '',
  '## a_b',
  '',
  '## Open_Questions',
  '',
  '- [ ] Which store?',
  '',
].join('\n');

describe('the anchor GitHub gives a heading', () => {
  it('reaches it, underscores, rendered link text and repeats as GitHub counts them', async () => {
    const links = ['snake_case_name', 'why-remove-restricted_std', '120-2026-11-12', 'a_b', 'a_b-1', 'open_questions'];
    expect(await broken({ 'docs/target.md': target, 'docs/a.md': `# A\n\n${links.map((anchor, at) => `[${at}](target.md#${anchor})`).join(' ')}\n` })).toEqual([]);
  });

  it("leaves spec-graph's slug and its anchors as they were, and item ids with them", async () => {
    const links = ['snakecasename', 'why-remove-restrictedstd', 'ab', 'ab-1'];
    const files = { 'docs/target.md': target, 'docs/a.md': `# A\n\n${links.map((anchor, at) => `[${at}](target.md#${anchor})`).join(' ')}\n` };
    expect(await broken(files)).toEqual([]);
    expect((await analyse(files)).corpus.items.map((item) => item.id)).toEqual(['target#openquestions.1']);
  });

  it('is no anchor a heading does not have', async () => {
    const links = ['snake_case', 'a_b-2', 'why_remove_restricted_std'];
    expect(await broken({ 'docs/target.md': target, 'docs/a.md': `# A\n\n${links.map((anchor, at) => `[${at}](target.md#${anchor})`).join(' ')}\n` })).toEqual(
      links.map((anchor) => `target.md#${anchor}`),
    );
  });
});
