import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from 'vitest/config';
import { BaseSequencer, type Reporter, type TestModule, type TestSpecification } from 'vitest/node';

/**
 * Whether each test file failed when this process last ran it, as vitest 4's
 * cache had it and vitest 5's does not.
 *
 * Stryker narrows each mutant's run to the tests that cover it, by a test name
 * pattern, and stops a run at its first failure. Vitest 5 counts either run as
 * partial, and from a partial run its cache takes a failure and keeps it until
 * a run of the whole file passes; it also reads back what the other workers
 * write to the same cache file. So in a sweep a file that killed one mutant,
 * in any worker, stayed failed for every mutant after it, and the order lost
 * the file that killed the last mutant (ADR-0007, 2026-11-09). So the order
 * keeps its own record, by vitest 4's rule: a file that passed or failed in a
 * run has that verdict until a run runs it again, and a file the run skipped
 * or did not reach keeps the one it had. Vitest calls the sequencer and the
 * reporters in the one process that drives the worker, so the record lives in
 * that process's memory. The times stay the cache's (the sequencer, below).
 *
 * And the workers of one sweep share it, as they shared vitest 4's cache: a
 * worker reads the file `recordFile` names once, when it loads this file, and
 * writes its record there whole after each run. Vitest 4 read its cache file
 * when a process started, and every worker rewrote it after each run, so a
 * worker Stryker starts in place of one that timed out began with what the
 * last writer held; a record kept in memory alone begins empty there. Static
 * mutants run last in each shard, after the timeouts, so mostly on such
 * workers, and in spec-core they ran half as many tests again before their
 * kills with the record in memory alone (its ADR-0007, 2026-11-12; ADR-0007
 * here, 2026-11-12). A worker reads the file once and no more: a record read
 * back before each sort would be vitest 5's cache again, a file failed for
 * every worker once it failed in one.
 */
const failedLast = new Map<string, boolean>();

/** The file the workers of a sweep share the record through, in the folder each runs in. */
export const RECORD_FILE = '.vitest-order-record.json';

/**
 * Where a process keeps the record beside its memory: in the folder it runs
 * in where it is one of Stryker's workers, and nowhere otherwise. Stryker
 * names each worker in its environment (`STRYKER_MUTATOR_WORKER`) and runs
 * it in the sweep's sandbox, where its vitest runner writes its own setup
 * file too. So the file is one sweep's, whose workers name the test files by
 * the same paths, and it goes with the sandbox. A process that is not a
 * worker, `npm test` or a test that loads this file, reads and writes none.
 */
export function recordFile(env: Readonly<Record<string, string | undefined>>, cwd: string): string | undefined {
  return env['STRYKER_MUTATOR_WORKER'] === undefined ? undefined : join(cwd, RECORD_FILE);
}

/**
 * The record a file holds: its entries whose verdict is `true` or `false`,
 * and none from a file that is missing, unreadable or not an object. A
 * worker that finds nothing begins as the first workers of a sweep do.
 */
export function readRecord(file: string): Map<string, boolean> {
  try {
    const held: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof held !== 'object' || held === null || Array.isArray(held)) return new Map();
    return new Map(Object.entries(held).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
  } catch {
    return new Map();
  }
}

/**
 * Writes a record whole, to a file of this process's own that is then
 * renamed over the shared one, so a worker reads one writer's record and
 * never half of one. A write that fails leaves the shared file as it was,
 * and a file of its own that a rename left goes with the sandbox: the order
 * reads the record in memory, and the file is only what a worker started
 * later begins with.
 */
export function writeRecord(file: string, record: ReadonlyMap<string, boolean>): void {
  const own = `${file}.${process.pid}`;
  try {
    writeFileSync(own, JSON.stringify(Object.fromEntries(record)));
    renameSync(own, file);
  } catch {
    // The next run writes again.
  }
}

const shared = recordFile(process.env, process.cwd());
if (shared !== undefined) for (const [id, failed] of readRecord(shared)) failedLast.set(id, failed);

/** The reporter that keeps the record above, named in the suite below. */
export const lastRun = {
  // No `onInit`: vitest 5 calls it at the start of every run, which would
  // empty the record before each sort (ADR-0007, 2026-11-09).
  onTestModuleEnd(module: TestModule): void {
    const state = module.state();
    if (state === 'passed' || state === 'failed') failedLast.set(module.moduleId, state === 'failed');
  },
  // After each run, narrowed, stopped or whole, as vitest 4 wrote its cache.
  onTestRunEnd(): void {
    if (shared !== undefined) writeRecord(shared, failedLast);
  },
} satisfies Reporter;

/**
 * The order a mutant's test files run in: a file that failed when this
 * process last ran it first, as vitest 4 had it, then the quickest first,
 * where vitest runs the longest first.
 *
 * Stryker runs a mutant's files one after another in one worker and stops at
 * the first test that fails: every file for a static mutant, the files of the
 * tests that cover it for any other. What a mutant costs is the files that
 * run before the one that kills it. Vitest's order suits a run that reports
 * every failure and wants the long files started early. Here fourteen files
 * cover a mutant that is not static, and the longest of all,
 * `tests/cli.test.ts`, twice as long as any other, covers seven such mutants
 * in ten. In the three sweeps before this order one mutant in seven was
 * killed only after tests of another file had completed: 135 such tests for
 * a mutant that is not static, and 50 in the first sweep in this order
 * (ADR-0007, 2026-10-11).
 *
 * No test leaves the run and none is added: a mutant survives when every
 * file has passed, in any order. That sweep read the score of the three
 * before it, 96.50% over 8,832 mutants with the same 293 survivors, and its
 * mutants that are not static took 33 minutes of the four shards where they
 * had taken 41 to 43. The static ones took the 13 they had taken: one killed
 * late had 680 tests ahead of its killer, for 690 to 735 before.
 *
 * A file the worker has not run yet has no time to go by. It runs after
 * those that have, the smaller first, and has a time from then on. Vitest 5
 * asks its cache by a file's specification and keeps no sizes, reading them
 * from the disk where a file has no time; so does this. Its cache takes the
 * time of a run of the whole file, and the time of a run a test name pattern
 * narrowed only where it has none: in a sweep, each file's from a run of all
 * of it, as the dry run is, where vitest 4 took the last run's, the tests
 * that cover a mutant that is not static and no others.
 */
export class QuickestFirst extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { cache } = this.ctx;
    const rank = (file: TestSpecification): [number, number] => {
      // What vitest's own sequencer asks its cache; a test holds the two
      // together. Its `failed` is not read: that is the record's.
      const last = cache.getTestSpecificationResult(file);
      if (last === undefined) return [2, statSync(file.moduleId, { throwIfNoEntry: false })?.size ?? 0];
      return [failedLast.get(file.moduleId) === true ? 0 : 1, last.duration];
    };
    const ranked = files.map((file) => ({ file, rank: rank(file) }));
    return ranked.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1]).map(({ file }) => file);
  }
}

/**
 * Vitest configuration for mutation runs.
 *
 * The same suite as the normal run, minus the coverage instrumentation and its
 * thresholds: Stryker measures its own coverage per test, and leaving v8
 * coverage on would slow every one of the thousands of mutant runs for a number
 * nobody reads. It runs in the order above and names its reporters.
 *
 * The CLI tests drive `main()` in process rather than spawning
 * `node bin/spec-graph.js`, so unlike a subprocess end-to-end suite they load
 * the mutated source and can genuinely kill mutants. They stay.
 *
 * Four files are excluded. mutation-shards.test.ts tests the CI script that
 * splits and merges the sweep, and the order above, which reaches nothing under
 * src/, so it cannot kill a mutant - and a static mutant runs the whole suite,
 * so it would run thousands of times for nothing. mutation-unmeasured.test.ts
 * is left out for the same reason: it holds the script that counts what the
 * sweep cannot see, and reads src/ as text. bin.test.ts is the one test
 * that does spawn the launcher, for the exit code only a process has: it runs
 * what was compiled into dist/, which no mutant is. growth.test.ts holds a
 * stage to a cost in proportion to its input by counting what it visits
 * through built-ins it replaces for the stage: replacing an iterator's `next`
 * ends the engine's fast path for every loop of its kind for the rest of the
 * worker's life, and a worker of the sweep runs the suite once for each
 * mutant.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/mutation-shards.test.ts', 'tests/mutation-unmeasured.test.ts', 'tests/bin.test.ts', 'tests/growth.test.ts', '**/node_modules/**'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    sequence: { sequencer: QuickestFirst },
    // Named, so that vitest adds none of its own. A suite that names none
    // gets vitest's github-actions reporter beside the default one on a
    // runner, and it appends a summary of each run to the step's: one a
    // mutant, about 200 bytes each, some 3,450 of them in the largest shard
    // of main's sweep of 29c7b8a: about two thirds of the 1MiB GitHub uploads
    // of a step's summary. The default reporter writes to the worker's
    // output, as it did, which Stryker shows only for a worker that exits
    // unexpectedly. The other keeps the order's record and writes nothing.
    reporters: ['default', lastRun],
  },
});
