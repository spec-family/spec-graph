import { describe, expect, it } from 'vitest';

import type { Source } from '../src/runner.js';

/**
 * Four times the input visits about four times the elements: no stage may
 * take longer than what it reads (CLAUDE.md).
 *
 * A guard on the shape of the cost, which a bound in seconds cannot hold.
 * Two stages grew with the square of their input, and a bound in seconds
 * caught neither: each reading of a citation was compared with every one
 * before it, and an anchor that addresses nothing asked every node of the
 * graph which were under its document - two in each of 8,000 documents took
 * 42.5 seconds, and 3.2 without them.
 *
 * Counted, not timed. The ratio of two timings held the shape on a quiet
 * machine and not on a busy one: a stage that reads 4.4 here read 9.6 on a
 * macOS runner, past a bar of 8, and a check every pull request needs cannot
 * be one a neighbour on the runner fails. A count is the same on every
 * machine and every run. While the stage runs, and only then, the built-ins
 * a loop over the input goes through are replaced by ones that count: each
 * step of an iterator over an array, a map, a set, a string or a regular
 * expression's matches, each call of a callback an array, a map or a set
 * makes, and each element `indexOf`, `lastIndexOf` or `includes` passes
 * over. That is a loop however it is written but an indexed `for`, and the
 * body of one of those visits something.
 *
 * A stage in proportion to its input reads 4.0 here. The two that grew
 * with its square read 13.6 and 15.9, counted the same way on the build
 * before the fix. The bar is 6: a count does not vary, so the bar leaves no
 * room for noise, only for a sort, whose comparisons grow by 5 at most at
 * these sizes.
 *
 * The sweep leaves this file out (vitest.mutation.config.ts): replacing an
 * iterator's `next` ends the engine's fast path for every loop of its kind,
 * for the rest of the worker's life, and a worker of the sweep runs the suite
 * once for each mutant.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test.
 */

type Method = (this: unknown, ...args: unknown[]) => unknown;

/** Iterators of each kind a loop over the input can step through. */
const iterators = (): object[] => [[][Symbol.iterator](), new Map().entries(), new Set().values(), ''[Symbol.iterator](), ''.matchAll(/x/g)];

const CALLBACKS = ['every', 'some', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flatMap', 'forEach', 'map', 'reduce', 'reduceRight', 'sort'];

const SEARCHES = ['indexOf', 'lastIndexOf', 'includes'];

/** The elements a stage visits, by the built-ins it visits them through. */
function visits(stage: () => unknown): number {
  let count = 0;
  const restore: (() => void)[] = [];
  const replace = (owner: object, name: string, wrap: (original: Method) => Method): void => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, name)!;
    restore.push(() => Object.defineProperty(owner, name, descriptor));
    Object.defineProperty(owner, name, { ...descriptor, value: wrap(descriptor.value as Method) });
  };
  const counted = (original: Method): Method =>
    function (this: unknown, ...args: unknown[]) {
      count += 1;
      return original.apply(this, args);
    };
  // The callback is swapped in place in the arguments, never spread into a
  // new list: a spread steps an array iterator, and would count itself.
  const countingCallbacks = (original: Method): Method =>
    function (this: unknown, ...args: unknown[]) {
      if (typeof args[0] === 'function') args[0] = counted(args[0] as Method);
      return original.apply(this, args);
    };
  for (const iterator of iterators()) replace(Object.getPrototypeOf(iterator) as object, 'next', counted);
  for (const name of CALLBACKS) replace(Array.prototype, name, countingCallbacks);
  replace(Map.prototype, 'forEach', countingCallbacks);
  replace(Set.prototype, 'forEach', countingCallbacks);
  for (const name of SEARCHES) {
    replace(Array.prototype, name, (original) =>
      function (this: unknown, ...args: unknown[]) {
        count += (this as readonly unknown[]).length;
        return original.apply(this, args);
      },
    );
  }
  try {
    count = 0;
    stage();
    return count;
  } finally {
    for (const undo of restore.reverse()) undo();
  }
}

/** The elements a stage visits on the larger input over those on the smaller. */
const growth = <T>(small: T, large: T, stage: (input: T) => unknown): number => visits(() => stage(large)) / visits(() => stage(small));

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
  it('visits about four times the elements to read one file', async () => {
    const { extractSpecifications } = await import('../src/extract.js');
    expect(growth(changelog(250), changelog(1000), extractSpecifications)).toBeLessThan(6);
  });

  it('visits about four times the elements to resolve anchors that address nothing', async () => {
    const { extractSpecifications } = await import('../src/extract.js');
    const { resolveCorpus } = await import('../src/resolve.js');
    const read = (sources: Source[]) => sources.flatMap((source) => extractSpecifications(source));
    const small = read(anchors(300));
    const large = read(anchors(1200));
    expect(growth(small, large, resolveCorpus)).toBeLessThan(6);
  });
});

describe('the count', () => {
  const values = (size: number): string[] => Array.from({ length: size }, (_, at) => `value-${at}`);

  it('sees a loop over everything kept before, in each way the two stages wrote one', () => {
    // As readings were compared before the fix: each against those kept.
    const findIndex = (input: readonly string[]) => {
      const kept: string[] = [];
      for (const value of input) if (kept.findIndex((other) => other === value) === -1) kept.push(value);
    };
    // As an anchor that addressed nothing asked every node of the graph.
    const spread = (input: readonly string[]) => {
      const nodes = new Map(input.map((value) => [value, value]));
      for (const value of input) [...nodes.keys()].filter((id) => id.startsWith(value));
    };
    const includes = (input: readonly string[]) => {
      const kept: string[] = [];
      for (const value of input) if (!kept.includes(value)) kept.push(value);
    };
    const matches = (input: readonly string[]) => {
      const text = input.join(' ');
      for (const value of input) [...text.matchAll(new RegExp(value.slice(0, 5), 'g'))];
    };
    for (const stage of [findIndex, spread, includes, matches]) expect(growth(values(50), values(200), stage), stage.name).toBeGreaterThan(12);
  });

  it('reads a loop in proportion to its input as four', () => {
    const tallied = (input: readonly string[]) => {
      const kept = new Map<string, number>();
      for (const value of input) kept.set(value, (kept.get(value) ?? 0) + 1);
      [...kept.values()].filter((count) => count > 1);
    };
    // Each loop takes one step more than its input, the step that ends it.
    expect(growth(values(50), values(200), tallied)).toBeCloseTo(4, 1);
  });

  it('is the same on every run', async () => {
    const { extractSpecifications } = await import('../src/extract.js');
    const source = changelog(100);
    expect(visits(() => extractSpecifications(source))).toBe(visits(() => extractSpecifications(source)));
  });

  it('puts back every built-in it replaced, when the stage throws too', () => {
    const owners = [...iterators().map((iterator) => Object.getPrototypeOf(iterator) as object), Array.prototype, Map.prototype, Set.prototype];
    // Compared one by one: a map of Array.prototype's descriptors has a
    // `Symbol.iterator` key of its own, and `toEqual` takes it for an iterable.
    const properties = owners.flatMap((owner) => Reflect.ownKeys(owner).map((key) => ({ owner, key, value: Object.getOwnPropertyDescriptor(owner, key)!.value as unknown })));
    expect(() =>
      visits(() => {
        throw new Error('the stage failed');
      }),
    ).toThrow('the stage failed');
    expect(properties.filter(({ owner, key, value }) => !Object.is(Object.getOwnPropertyDescriptor(owner, key)!.value, value)).map(({ key }) => String(key))).toEqual([]);
    expect(properties.length).toBeGreaterThan(CALLBACKS.length + SEARCHES.length);
  });
});
