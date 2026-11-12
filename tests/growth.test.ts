import { describe, expect, it } from 'vitest';

import type { Source } from '../src/runner.js';

/**
 * Four times the input takes about four times the time: no stage may take
 * longer than what it reads (CLAUDE.md).
 *
 * Not a benchmark: a guard on the shape of the cost, which a bound in seconds
 * cannot hold where a runner's speed varies. Two stages grew with the square
 * of their input, and a bound in seconds caught neither. Each reading of a
 * citation was compared with every one before it, so a changelog of 1,500
 * lines took 1.2 seconds and one of 3,000 took 4.0. An anchor that addresses
 * nothing asked every node of the graph which were under its document: two
 * in each of 8,000 documents took 42.5 seconds, and 3.2 without them.
 *
 * Each case times the stage that grew, extraction or resolution, on inputs
 * built and read beforehand, so the stages around it do not water the ratio
 * down. The larger input is four times the smaller, two doublings, both are
 * run once to warm the engine and then five times each, in turn, so a busy
 * moment of a shared runner lands on both; the best of each is compared, and
 * the ratio is held under eight. A cost that grows with the input reads about
 * four here, and the two that grew with its square read 15 and 17 before the
 * fix. Timed whole, the run read 6.4 on a hosted runner where it read 4.3
 * here. The cases take about a second together.
 *
 * The sweep leaves this file out (vitest.mutation.config.ts): it kills a
 * mutant only by its speed, and instrumented code is no measure of that.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test.
 */

/** A stage's best time on the larger input over its best time on the smaller. */
function growth<T>(small: T, large: T, stage: (input: T) => unknown): number {
  const time = (input: T): number => {
    const started = performance.now();
    stage(input);
    return performance.now() - started;
  };
  stage(small);
  stage(large);
  let fast = Number.POSITIVE_INFINITY;
  let slow = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    fast = Math.min(fast, time(small));
    slow = Math.min(slow, time(large));
  }
  return slow / fast;
}

/** One file of many lines, each with a link and several identifiers in prose. */
const changelog = (lines: number): Source => {
  const text = ['# Changelog', ''];
  for (let line = 0; line < lines; line += 1) {
    if (line % 20 === 0) text.push('', `## ${line / 20}.0.0`, '');
    text.push(`- Fixed the parser for RFC ${7000 + line} (see [notes](docs/n${line}.md), GHSA-${line}, ADR-${line % 50}).`);
  }
  return { path: 'CHANGELOG.md', text: `${text.join('\n')}\n` };
};

/** Documents with items, each linking to anchors no document has. */
const anchors = (documents: number): Source[] =>
  Array.from({ length: documents }, (_, at) => ({
    path: `docs/d${at}.md`,
    text: [
      `# D${at}`,
      '',
      '## Open Questions',
      '',
      ...Array.from({ length: 4 }, (_, item) => `- [ ] Question ${item}?`),
      '',
      ...Array.from({ length: 8 }, (_, link) => `See [${link}](d${(at + link + 1) % documents}.md#nowhere-${link}).`),
      '',
    ].join('\n'),
  }));

describe('four times the input', () => {
  it('takes about four times as long to read one file', async () => {
    const { extractSpecifications } = await import('../src/extract.js');
    expect(growth(changelog(250), changelog(1000), extractSpecifications)).toBeLessThan(8);
  });

  it('takes about four times as long to resolve anchors that address nothing', async () => {
    const { extractSpecifications } = await import('../src/extract.js');
    const { resolveCorpus } = await import('../src/resolve.js');
    const read = (sources: Source[]) => sources.flatMap((source) => extractSpecifications(source));
    expect(growth(read(anchors(300)), read(anchors(1200)), resolveCorpus)).toBeLessThan(8);
  });
});
