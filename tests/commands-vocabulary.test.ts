import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { commandIn, namesIn, type CommandKind } from '../src/commands.js';
import type { Manifest } from '../src/rules.js';
import { analyseSources, createOrientationCheck } from '../src/runner.js';

/**
 * The words pnpm and yarn answer to themselves, and the files make builds a
 * target from, held to the README rather than to `commands.ts` (ADR-0029). A
 * word the README drops, or one that starts running a script, fails here.
 */

/** The README's block on the words a tool runs itself. */
function documented(): { pnpm: string[]; yarn: string[]; sources: string[] } {
  const readme = readFileSync('README.md', 'utf8');
  const start = readme.indexOf('<summary>Every word pnpm and yarn run');
  const block = readme.slice(start, readme.indexOf('</details>', start));
  const ticked = (text: string): string[] => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
  const row = (tool: string): string[] => ticked(block.split('\n').find((line) => line.startsWith(`| \`${tool}\``))!.split('|')[2]!);
  const sentence = block.slice(block.indexOf('build `x` from:'));
  return { pnpm: row('pnpm'), yarn: row('yarn'), sources: ticked(sentence.slice(sentence.indexOf(':'))) };
}

describe('the words a tool runs as its own command', () => {
  const { pnpm, yarn } = documented();

  it('are read from the README, a row for each tool', () => {
    // A block that failed to parse would pass every test below vacuously.
    expect([pnpm.length, yarn.length]).toEqual([56, 50]);
  });

  it.each(pnpm)('`pnpm %s` runs no script', (word) => {
    expect(commandIn(`pnpm ${word}`)).toBeNull();
  });

  it.each(yarn)('`yarn %s` runs no script', (word) => {
    expect(commandIn(`yarn ${word}`)).toBeNull();
  });

  it('leaves every other word a script, test among them', () => {
    expect(['lint', 'test', 'build'].map((word) => commandIn(`pnpm ${word}`)?.names[0])).toEqual(['lint', 'test', 'build']);
    expect(['lint', 'test', 'build'].map((word) => commandIn(`yarn ${word}`)?.names[0])).toEqual(['lint', 'test', 'build']);
  });
});

describe('the files make has a target from without a rule', () => {
  const { sources } = documented();
  const manifestFor = (_directory: string, kind: CommandKind): Manifest | undefined =>
    kind === 'target' ? { file: 'Makefile', names: namesIn('target', 'build:\n') } : undefined;
  const missing = (present: ReadonlySet<string>): string[] =>
    analyseSources([{ path: 'CLAUDE.md', text: '# Claude\n\nRun `make hello`.\n' }], {
      orientation: createOrientationCheck({ files: ['CLAUDE.md'] }),
      fileExists: (path) => present.has(path),
      manifestFor,
    }).diagnostics.map((d) => d.target ?? '');

  it('are read from the README, the target itself and each source', () => {
    expect(sources.length).toBe(14);
  });

  it.each(['x', ...sources])('include %s, beside the Makefile', (source) => {
    expect(missing(new Set([source.replace(/^x/, 'hello')]))).toEqual([]);
  });

  it('are no other file, whose presence leaves the target missing', () => {
    expect(missing(new Set(['hello.md', 'hello.txt', 'hellox.c']))).toEqual(['hello']);
  });
});
