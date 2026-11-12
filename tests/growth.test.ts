import { describe, expect, it } from 'vitest';

import type { Source } from '../src/runner.js';

/**
 * Twice the input takes about twice the time: no stage may take longer than
 * what it reads (CLAUDE.md).
 *
 * Not a benchmark: a guard on the shape of the cost, which a bound in seconds
 * cannot hold where a runner's speed varies. Two stages grew with the square
 * of their input, and a bound in seconds caught neither. Each reading of a
 * citation was compared with every one before it, so a changelog of 1,500
 * lines took 1.2 seconds and one of 3,000 took 4.0. An anchor that addresses
 * nothing asked every node of the graph which were under its document: two
 * in each of 8,000 documents took 42.5 seconds, and 3.2 without them.
 *
 * The larger input is four times the smaller, two doublings, each timed at
 * its best of three after one run that warms the engine, and the ratio is
 * held under six. A cost that grows with the input reads a little over four
 * here, and one that grows with its square read 14 and 8 on these corpora
 * before the fix: two doublings keep noise on a shared runner far from
 * either. The two cases take about a second together.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test, and a sweep reads that as a survived mutant.
 */

const best = (run: () => void): number => {
  let least = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const started = performance.now();
    run();
    least = Math.min(least, performance.now() - started);
  }
  return least;
};

async function growth(build: (size: number) => Source[], size: number): Promise<number> {
  const { analyseSources } = await import('../src/runner.js');
  const small = build(size);
  const large = build(size * 4);
  analyseSources(small);
  return best(() => analyseSources(large)) / best(() => analyseSources(small));
}

/** One file of many lines, each with a link and several identifiers in prose. */
const changelog = (lines: number): Source[] => {
  const text = ['# Changelog', ''];
  for (let line = 0; line < lines; line += 1) {
    if (line % 20 === 0) text.push('', `## ${line / 20}.0.0`, '');
    text.push(`- Fixed the parser for RFC ${7000 + line} (see [notes](docs/n${line}.md), GHSA-${line}, ADR-${line % 50}).`);
  }
  return [{ path: 'CHANGELOG.md', text: `${text.join('\n')}\n` }];
};

/** Many documents with items, each linking to anchors no document has. */
const anchors = (documents: number): Source[] =>
  Array.from({ length: documents }, (_, at) => ({
    path: `docs/d${at}.md`,
    text: [
      `# D${at}`,
      '',
      '## Open Questions',
      '',
      ...Array.from({ length: 6 }, (_, item) => `- [ ] Question ${item}?`),
      '',
      ...Array.from({ length: 8 }, (_, link) => `See [${link}](d${(at + link + 1) % documents}.md#nowhere-${link}).`),
      '',
    ].join('\n'),
  }));

describe('four times the input', () => {
  it('takes about four times as long for the readings of one file', async () => {
    expect(await growth(changelog, 250)).toBeLessThan(6);
  });

  it('takes about four times as long for anchors that address nothing', async () => {
    expect(await growth(anchors, 150)).toBeLessThan(6);
  });
});
