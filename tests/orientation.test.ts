import { describe, expect, it } from 'vitest';

import { EXIT_ERROR, EXIT_FAILED, main } from '../src/cli.js';
import { parseConfig } from '../src/config.js';
import { pathIn } from '../src/extract.js';
import { historyOf } from '../src/history.js';
import { buildGraph } from '../src/graph.js';
import { runRules } from '../src/rules.js';
import { analyseSources, createOrientationCheck } from '../src/runner.js';
import type { OrientationConfig } from '../src/types.js';

/** The paths and commits an orientation document names, held to the repository (ADR-0029). */

const doc = (...lines: string[]): string => lines.join('\n');
const CONFIG: OrientationConfig = { files: ['CLAUDE.md', 'docs/*-brief.md'], extensions: ['.md', '.TS'], roots: ['spec'] };
/** The repository's files and directories, beside the documents read. */
const TREE = new Set(['src', 'src/refunds', 'src/refunds/limits.ts', 'spec', 'spec/refunds.md', 'docs', 'docs/brief-notes.md', 'README.md']);

function analysed(files: Record<string, string>, options: { config?: OrientationConfig | null; tree?: ReadonlySet<string> | null } = {}) {
  const tree = options.tree === undefined ? TREE : options.tree;
  return analyseSources(
    Object.entries(files).map(([path, text]) => ({ path, text })),
    {
      orientation: createOrientationCheck(options.config === null ? undefined : (options.config ?? CONFIG)),
      ...(tree === null ? {} : { fileExists: (path: string) => tree.has(path) && path.includes('.'), isDirectory: (path: string) => tree.has(path) && !path.includes('.') }),
      history: historyOf('HEAD', 'abcdef0\u001fRefuse a refund over its capture\n'),
    },
  );
}

const findings = (files: Record<string, string>, options?: Parameters<typeof analysed>[1]): string[] =>
  analysed(files, options)
    .diagnostics.filter((d) => d.rule === 'missing-path' || d.rule === 'unknown-commit')
    .map((d) => `${d.rule} ${d.at.file}:${d.at.span.start.line} ${d.message}`);

describe('a code span that reads as a path', () => {
  it('holds a slash or ends in a configured extension, in any case, less a place after it', () => {
    const ext = ['.md', '.TS'];
    expect(['src/refunds/limits.ts', 'refunds.md', 'LIMITS.ts', 'src/', '../ROADMAP.md', 'docs/a.md#scope', 'src/a.ts:42', 'src/a.ts:42:7', 'a+b/c@d~e_f-g.h'].map((t) => pathIn(t, ext))).toEqual([
      'src/refunds/limits.ts',
      'refunds.md',
      'LIMITS.ts',
      'src/',
      '../ROADMAP.md',
      'docs/a.md',
      'src/a.ts',
      'src/a.ts',
      'a+b/c@d~e_f-g.h',
    ]);
  });

  it('is no command, error code, code, scheme, glob, option, scope, home or number', () => {
    const none = ['npm run lint', 'E0310', '.to<U>()', 'https://example.com/a', 'spec/*.md', 'src/{a,b}', '--spec', '-x/y', '@spec-family/spec-guard', '~/notes.md', '2026/11', 'refunds.rs', 'a(b)/c', 'a/b"', ''];
    expect(none.map((t) => pathIn(t, ['.md']))).toEqual(none.map(() => null));
  });
});

describe('an orientation document', () => {
  it('passes naming paths the repository holds, from the root, its directory, or a root for a bare name', () => {
    const brief = doc('# Brief', '', 'Start at `src/refunds/limits.ts`, then `src/refunds/` and `../README.md`.', 'The rules are `refunds.md`; see `brief-notes.md` beside this.', '');
    expect(findings({ 'docs/ops-brief.md': brief })).toEqual([]);
  });

  it('fails a path the repository does not hold, at the code span, saying how to correct or mark it', () => {
    const brief = doc('# Brief', '', 'The plan is `docs/tooling-plan.md`, and `src/payments/` holds nothing, nor `` docs/old.md ``.', '');
    expect(findings({ 'docs/ops-brief.md': brief })).toEqual([
      'missing-path docs/ops-brief.md:3 `docs/tooling-plan.md` names no file or directory the repository holds',
      'missing-path docs/ops-brief.md:3 `src/payments/` names no file or directory the repository holds',
      'missing-path docs/ops-brief.md:3 `docs/old.md` names no file or directory the repository holds',
    ]);
    const [found] = analysed({ 'docs/ops-brief.md': brief }).diagnostics;
    expect(found).toMatchObject({
      severity: 'error',
      nodes: ['ops-brief'],
      target: 'docs/tooling-plan.md',
      related: [],
      at: { span: { start: { line: 3, column: 13 } } },
      hint: 'correct it, or mark it in the document: <!-- @spec-path created="docs/tooling-plan.md" --> for one this work creates, external="docs/tooling-plan.md" for one in another repository',
    });
  });

  it('looks for a bare name under a root only where it has no slash, and holds none that leaves the repository', () => {
    const brief = doc('# Brief', '', '`refunds.md` is found; `x/refunds.md` is not, nor `../../README.md`, nor `/spec/refunds.md` from here.', '');
    expect(findings({ 'docs/ops-brief.md': brief })).toEqual([
      'missing-path docs/ops-brief.md:3 `x/refunds.md` names no file or directory the repository holds',
      'missing-path docs/ops-brief.md:3 `../../README.md` names no file or directory the repository holds',
    ]);
    // A path with a slash is never looked for under a root, though one holds it.
    expect(findings({ 'docs/ops-brief.md': doc('# B', '', '`sub/refunds.md`', '') }, { tree: new Set([...TREE, 'spec/sub', 'spec/sub/refunds.md']) })).toEqual([
      'missing-path docs/ops-brief.md:3 `sub/refunds.md` names no file or directory the repository holds',
    ]);
    // Outside the repository nothing holds, whatever the disk around it has.
    const around = new Set([...TREE, '..', '../README.md']);
    expect(findings({ 'docs/ops-brief.md': doc('# B', '', '`../../README.md` and `../../docs/..`', '') }, { tree: around })).toEqual([
      'missing-path docs/ops-brief.md:3 `../../README.md` names no file or directory the repository holds',
      'missing-path docs/ops-brief.md:3 `../../docs/..` names no file or directory the repository holds',
    ]);
    expect(findings({ 'docs/ops-brief.md': doc('# B', '', '`/spec/missing.md`', '') })).toEqual([
      'missing-path docs/ops-brief.md:3 `/spec/missing.md` names no file or directory the repository holds',
    ]);
  });

  it('passes a path it marks created or external, by any of its @spec-path lists, and only in itself', () => {
    const brief = doc(
      '# Brief',
      '',
      '<!-- @spec-path created="docs/tooling-plan.md, src/payments/, src/fees" -->',
      '<!-- @spec-path external="dist/comments.js" reason="the tool\'s own" -->',
      'Write `docs/tooling-plan.md`, `src/payments/` and `src/fees/`; read `dist/comments.js`.',
      '',
    );
    const other = doc('# Claude', '', 'See `docs/tooling-plan.md`.', '');
    expect(findings({ 'docs/ops-brief.md': brief, 'CLAUDE.md': other }, { config: { ...CONFIG, extensions: ['.md', '.js'] } })).toEqual([
      'missing-path CLAUDE.md:3 `docs/tooling-plan.md` names no file or directory the repository holds',
    ]);
  });

  it('fails a commit it names that the history does not hold', () => {
    const brief = doc('# Brief', '', 'The limit landed in commit "Refuse a refund over its capture"; the fee in commit 1234567.', '');
    expect(findings({ 'docs/ops-brief.md': brief })).toEqual(['unknown-commit docs/ops-brief.md:3 commit 1234567 is not in the history of HEAD']);
  });

  it('is only a document the configuration names, and code spans in a fence are code', () => {
    expect(findings({ 'docs/plan.md': doc('# Plan', '', '`docs/missing.md`', '') })).toEqual([]);
    expect(findings({ 'docs/ops-brief.md': doc('# Brief', '', '```', '`docs/missing.md`', '```', '') })).toEqual([]);
    expect(findings({ 'docs/ops-brief.md': doc('# Brief', '', '`docs/missing.md`', '') }, { config: null })).toEqual([]);
  });

  it('names each path from the node it is written in', () => {
    const brief = doc('# Brief', '', '## Open Questions', '', '- [ ] Where is `docs/missing.md`?', '');
    expect(analysed({ 'docs/ops-brief.md': brief }).diagnostics.find((d) => d.rule === 'missing-path')?.nodes).toEqual(['ops-brief#open-questions.1']);
  });

  it('refuses to run unlooked-for, where it names a path and no way to look was given', () => {
    expect(() => analysed({ 'docs/ops-brief.md': doc('# Brief', '', '`docs/a.md`', '') }, { tree: null })).toThrow(
      'an orientation document names a path, and no fileExists was given to look for it: pass "fileExists"',
    );
    expect(() => analysed({ 'docs/ops-brief.md': doc('# Brief', '', 'No path.', '') }, { tree: null })).not.toThrow();
  });

  it('is looked at by no rule given no way to look, or no orientation, as runRules is called on its own', () => {
    const { corpus } = analysed({ 'docs/ops-brief.md': doc('# Brief', '', '`docs/missing.md` and `notes.md`', '') });
    const graph = buildGraph({ nodes: corpus.nodes, edges: corpus.edges });
    expect(runRules(graph, corpus, { orientation: createOrientationCheck(CONFIG) }).map((d) => d.rule)).toEqual([]);
    expect(runRules(graph, corpus, { pathExists: () => false }).map((d) => d.rule)).toEqual([]);
  });
});

describe('orientation through the command line', () => {
  it('reads the repository it runs in, and fails a missing path', async () => {
    const { mkdir, rm, writeFile } = await import('node:fs/promises');
    const root = `tests/fixtures/.tmp/orientation-${process.pid}`;
    await rm(root, { recursive: true, force: true });
    try {
      await mkdir(`${root}/src/refunds`, { recursive: true });
      await mkdir(`${root}/docs`, { recursive: true });
      await writeFile(`${root}/src/refunds/limits.ts`, 'export {};\n');
      await writeFile(`${root}/.spec-graph.json`, JSON.stringify({ patterns: ['*.md', 'docs/*.md'], orientation: { files: ['CLAUDE.md'], extensions: ['.ts'] } }));
      await writeFile(`${root}/CLAUDE.md`, doc('# Claude', '', 'Start at `src/refunds/limits.ts` and `src/refunds/`, not `src/payments/fees.ts`.', ''));
      let out = '';
      const code = await main({ argv: ['check', '--format', 'json'], cwd: `${process.cwd()}/${root}`, stdout: (text) => (out += text), stderr: () => {}, env: { NO_COLOR: '1' }, isTTY: false });
      expect(code).toBe(EXIT_FAILED);
      expect(JSON.parse(out).diagnostics.map((d: { rule: string; target: string }) => [d.rule, d.target])).toEqual([['missing-path', 'src/payments/fees.ts']]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stops with exit 2 on a configuration it cannot read', async () => {
    const { mkdir, rm, writeFile } = await import('node:fs/promises');
    const root = `tests/fixtures/.tmp/orientation-bad-${process.pid}`;
    await rm(root, { recursive: true, force: true });
    try {
      await mkdir(root, { recursive: true });
      await writeFile(`${root}/.spec-graph.json`, JSON.stringify({ patterns: ['*.md'], orientation: { files: [] } }));
      await writeFile(`${root}/CLAUDE.md`, '# Claude\n');
      let err = '';
      expect(await main({ argv: ['check'], cwd: `${process.cwd()}/${root}`, stdout: () => {}, stderr: (text) => (err += text), env: { NO_COLOR: '1' }, isTTY: false })).toBe(EXIT_ERROR);
      expect(err).toContain('"orientation.files" must be a non-empty array of patterns');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('orientation in the configuration', () => {
  const problems = (orientation: unknown): readonly string[] => parseConfig(JSON.stringify({ orientation }), '.spec-graph.json').problems;
  const at = (rest: string): string => `.spec-graph.json: ${rest}`;

  it('reads every part, and the parts it may go without', () => {
    expect(parseConfig(JSON.stringify({ orientation: CONFIG }), 'x')).toMatchObject({ problems: [], config: { orientation: CONFIG } });
    expect(parseConfig(JSON.stringify({ orientation: { files: ['CLAUDE.md'] } }), 'x').config.orientation).toStrictEqual({ files: ['CLAUDE.md'] });
    expect(createOrientationCheck(undefined)).toBeUndefined();
    expect(createOrientationCheck({ files: ['CLAUDE.md'] })).toMatchObject({ extensions: [], roots: [] });
  });

  it('refuses each part that is missing or of the wrong kind, and a key it does not know, and leaves orientation out then', () => {
    expect(problems(['CLAUDE.md'])).toEqual([at('"orientation" must be an object such as { "files": ["CLAUDE.md"], "extensions": [".md"], "roots": ["spec"] }')]);
    expect(problems({})).toEqual([at('"orientation.files" must be a non-empty array of patterns')]);
    expect(problems({ files: ['CLAUDE.md', ' '] })).toEqual([at('"orientation.files" must be a non-empty array of patterns')]);
    const extensions = at('"orientation.extensions" must be extensions, each a dot and a name, such as ".md"');
    for (const bad of [['md'], ['.'], ['.a.b'], ['.a/b'], ['. md'], '.md', [3]]) expect(problems({ files: ['CLAUDE.md'], extensions: bad }), JSON.stringify(bad)).toEqual([extensions]);
    expect(problems({ files: ['CLAUDE.md'], roots: 'spec' })).toEqual([at('"orientation.roots" must be an array of directories')]);
    expect(problems({ files: ['CLAUDE.md'], roots: [''] })).toEqual([at('"orientation.roots" must be an array of directories')]);
    expect(problems({ files: ['CLAUDE.md'], external: ['dist/'] })).toEqual([at('unknown key "orientation.external"')]);
    expect(parseConfig(JSON.stringify({ orientation: { files: [] } }), 'x').config.orientation).toBeUndefined();
  });
});
