import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AnalyseSourcesOptions } from '../src/runner.js';
import type { OrientationConfig } from '../src/types.js';

/**
 * What an orientation document names that is no path of this repository
 * (ADR-0029, amended 2026-11-12).
 *
 * Run over gqlkit's switchboards with the configuration sdd-layouts.md
 * recommends, 30 `missing-path` findings were none of them real: a package's
 * own paths in a monorepo's switchboard, examples after "e.g.", local files
 * git ignores, and the host's `/etc/nginx/nginx.conf`. spec-graph's own
 * CLAUDE.md and CONTRIBUTING.md gave more than thirty.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test, and a sweep reads that as a survived mutant.
 */

const CONFIG: OrientationConfig = { files: ['CLAUDE.md'], extensions: ['.md', '.ts', '.json', '.conf', '.txt', '.yml'], roots: ['packages/web'] };
const FILES = new Set(['packages/web/src/client.ts', 'docs/guide.md', '.github/workflows/release.yml']);
const DIRECTORIES = new Set(['packages', 'packages/web', 'packages/web/src', 'docs', '.github', '.github/workflows']);

async function findings(text: string, extra: AnalyseSourcesOptions = {}, config: OrientationConfig = CONFIG): Promise<string[]> {
  const { analyseSources, createOrientationCheck } = await import('../src/runner.js');
  const { diagnostics } = analyseSources([{ path: 'CLAUDE.md', text: `# Switchboard\n\n${text}\n` }], {
    orientation: createOrientationCheck(config),
    fileExists: (path) => FILES.has(path),
    isDirectory: (path) => DIRECTORIES.has(path),
    ...extra,
  });
  return diagnostics.filter((d) => d.rule === 'missing-path').map((d) => `${d.target} | ${d.hint}`);
}

const MARK = (path: string): string =>
  `correct it, or mark it in the document: <!-- @spec-path created="${path}" --> for one this work creates, external="${path}" for one in another repository`;

describe('a path of several segments', () => {
  it('is looked for under each root, as a bare name is', async () => {
    expect(await findings('Start at `src/client.ts`.')).toEqual([]);
    // Only a path that opens with `./` or `../` is written from the document.
    expect(await findings('Start at `src/../src/client.ts`.')).toEqual([]);
  });

  it('is where it says when written from the document or from the root', async () => {
    expect(await findings('Not `./src/client.ts`, nor `/packages/client.ts`.')).toEqual([
      `./src/client.ts | ${MARK('./src/client.ts')}`,
      `/packages/client.ts | ${MARK('/packages/client.ts')}`,
    ]);
  });
});

describe('an absolute path', () => {
  it("is the host's where the repository holds no directory it opens with, whatever it ends in", async () => {
    expect(await findings('Copy it to `/etc/nginx/nginx.conf`; the licence is `/opt/app/license.txt`.')).toEqual([]);
  });

  it('is looked for where the repository holds the directory it opens with', async () => {
    expect(await findings('See `/docs/missing.md`.')).toEqual([`/docs/missing.md | ${MARK('/docs/missing.md')}`]);
  });
});

describe('a path after "e.g."', () => {
  it('is an example of a kind of file, and so is each in a list after it', async () => {
    expect(await findings('Decisions are numbered (e.g. `docs/adr/0001-first.md`).')).toEqual([]);
    expect(await findings('Tests sit beside code (e.g., `foo.ts` + `foo.test.ts`, or `bar.ts` and `bar.test.ts`).')).toEqual([]);
    expect(await findings('Name it E.G.: `ghost.md`.')).toEqual([]);
    expect(await findings('Spelled apart, e. g. `ghost.md`.')).toEqual([]);
  });

  it('is one on the first line of a document as well', async () => {
    const { analyseSources, createOrientationCheck } = await import('../src/runner.js');
    const { diagnostics } = analyseSources([{ path: 'CLAUDE.md', text: 'E.g. `ghost.md` is a guide.\n' }], {
      orientation: createOrientationCheck(CONFIG),
      fileExists: (path) => FILES.has(path),
      isDirectory: (path) => DIRECTORIES.has(path),
    });
    expect(diagnostics.filter((d) => d.rule === 'missing-path')).toEqual([]);
  });

  it('is not an example once the sentence moves on, or after "i.e."', async () => {
    expect(await findings('Numbered, e.g. `0001-first.md`. Start at `ghost.md`.')).toEqual([`ghost.md | ${MARK('ghost.md')}`]);
    expect(await findings('The guide, i.e. `ghost.md`.')).toEqual([`ghost.md | ${MARK('ghost.md')}`]);
    expect(await findings('See `ghost.md`, e.g. for setup.')).toEqual([`ghost.md | ${MARK('ghost.md')}`]);
  });
});

describe('a path git ignores', () => {
  it('is not looked for, wherever the document writes it from', async () => {
    const ignored = (path: string): boolean => path === '.claude/settings.local.json';
    expect(await findings('Your `.claude/settings.local.json` holds the rest.', { isGitIgnored: ignored })).toEqual([]);
    expect(await findings('Your `.claude/settings.json` holds the rest.', { isGitIgnored: ignored })).toEqual([
      `.claude/settings.json | ${MARK('.claude/settings.json')}`,
    ]);
  });
});

describe('a bare name the repository holds elsewhere', () => {
  const named = (paths: Record<string, string[]>) => ({ pathsNamed: (name: string) => paths[name] ?? [] });

  it('is named where it is, with the root that would find it, where it is in one place', async () => {
    expect(await findings('The release runs from `release.yml`.', named({ 'release.yml': ['.github/workflows/release.yml'] }))).toEqual([
      'release.yml | it is .github/workflows/release.yml: write that path, or add ".github/workflows" to "orientation.roots"',
    ]);
  });

  it('is not guessed at where it is in two places, or where the path has a slash', async () => {
    expect(await findings('See `index.ts`.', named({ 'index.ts': ['a/index.ts', 'b/index.ts'] }))).toEqual([`index.ts | ${MARK('index.ts')}`]);
    expect(await findings('See `ghost/release.yml`.', named({ 'release.yml': ['.github/workflows/release.yml'] }))).toEqual([
      `ghost/release.yml | ${MARK('ghost/release.yml')}`,
    ]);
  });
});

// Named for the process: Stryker runs a test file in several workers at once,
// in one sandbox, and a fixed path is one they write and delete under each other.
const ROOT = `tests/fixtures/.tmp/orientation-quiet-${process.pid}`;

beforeAll(async () => {
  const files: Record<string, string> = {
    '.gitignore': [
      '# local',
      'reports/',
      '*.local.json   ',
      '!keep.local.json',
      '/build-out',
      'docs/drafts/',
      '\\#hash',
      '#comment',
      '\\#notes/x',
      'a\\#b',
      '  lead',
      'foo//',
      '//twice/x',
      '/',
      '[',
      '',
    ].join('\n'),
    'pkg/.gitignore': 'cache\n!reports/kept.md\n',
    'own/.gitignore': '*\n',
    'pkg/src/app.ts': '',
    'docs/guide.md': '',
    '.github/workflows/release.yml': '',
    'node_modules/dep/release.yml': '',
    'pkg/docs/guide.md': '',
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(`${ROOT}/${path.slice(0, path.lastIndexOf('/') + 1)}`, { recursive: true });
    await writeFile(`${ROOT}/${path}`, text);
  }
  // A junction on Windows, which needs no privilege, and a symbolic link elsewhere.
  await symlink(resolve(`${ROOT}/docs`), `${ROOT}/linked`, 'junction');
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe("the repository's .gitignore files", () => {
  it('ignore as git reads them: at any depth, anchored, under a directory, given back, and nearer files later', async () => {
    const { createGitIgnoreCheck } = await import('../src/runner.js');
    const ignored = createGitIgnoreCheck(ROOT);
    const asked = [
      'reports',
      'reports/mutation/index.html',
      'pkg/reports/x.md',
      '.claude/settings.local.json',
      'keep.local.json',
      'build-out/a.js',
      'pkg/build-out/a.js',
      'docs/drafts/plan.md',
      '#hash',
      'pkg/cache/x',
      'cache/x',
      'pkg/reports/kept.md',
      'docs/guide.md',
    ];
    expect(asked.filter(ignored)).toEqual([
      'reports',
      'reports/mutation/index.html',
      'pkg/reports/x.md',
      '.claude/settings.local.json',
      'build-out/a.js',
      'docs/drafts/plan.md',
      '#hash',
      'pkg/cache/x',
    ]);
  });

  // Each read against `git check-ignore --no-index` over the same lines.
  it('read a line as git does: a comment, an escape anywhere, spaces at either end, and the slashes that leave it naming nothing', async () => {
    const { createGitIgnoreCheck } = await import('../src/runner.js');
    const ignored = createGitIgnoreCheck(ROOT);
    const asked = ['#comment', '#notes/x', 'a#b', 'a/#b', '  lead', 'lead', 'foo', 'foo/x', 'twice/x', 'any/thing'];
    expect(asked.filter(ignored)).toEqual(['#notes/x', 'a#b', '  lead']);
  });

  it("leave a directory's own file to what is beneath it", async () => {
    const { createGitIgnoreCheck } = await import('../src/runner.js');
    const ignored = createGitIgnoreCheck(ROOT);
    expect([ignored('own'), ignored('own/x')]).toEqual([false, true]);
  });

  it('ignore nothing where there are none', async () => {
    const { createGitIgnoreCheck } = await import('../src/runner.js');
    expect(createGitIgnoreCheck(`${ROOT}/docs`)('reports/x')).toBe(false);
  });
});

describe('the paths each name is', () => {
  it('are every file and directory the walk reaches, past the ones it skips and past links', async () => {
    const { createNameIndex } = await import('../src/runner.js');
    const named = createNameIndex(ROOT);
    // The walk meets them in the order the host lists a directory.
    expect([named('release.yml'), named('src'), [...named('guide.md')].sort(), named('dep'), named('ghost'), named('linked')]).toEqual([
      ['.github/workflows/release.yml'],
      ['pkg/src'],
      ['docs/guide.md', 'pkg/docs/guide.md'],
      [],
      [],
      [],
    ]);
  });

  it('are none where the root cannot be read', async () => {
    const { createNameIndex } = await import('../src/runner.js');
    expect(createNameIndex(`${ROOT}/nowhere`)('docs')).toEqual([]);
  });
});
