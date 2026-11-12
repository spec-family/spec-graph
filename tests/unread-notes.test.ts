import { mkdir, rm, writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * What a check read nothing of, said on stderr after it read.
 *
 * The default patterns read `adr/`, `rfcs/` and `specs/`, and left `adrs/`,
 * `decisions/`, `rfc/`, `keps/`, `proposals/` and `design/` unread without a
 * word. And `orientation`,
 * which holds the paths and commands an agent's instructions name to the
 * repository, is off unless configured, so a repository with a CLAUDE.md saw
 * none of them looked for and was told nothing of it.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test, and a sweep reads that as a survived mutant.
 */

// Named for the process: Stryker runs a test file in several workers at once,
// in one sandbox, and a fixed path is one they write and delete under each other.
const ROOT = `tests/fixtures/.tmp/unread-notes-${process.pid}`;

const repositories: Record<string, Record<string, string>> = {
  families: {
    'docs/guide.md': '# Guide\n',
    'decisions/0001-one-writer.md': '# One writer\n',
    'adrs/0001-a.md': '# A\n',
    'Proposals/notes/0002-b.md': '# B\n',
    'design/diagram.png': 'not markdown',
    'adr/0001-read.md': '# Read\n',
    'notes/0001-c.md': '# C\n',
  },
  configured: {
    '.spec-graph.json': '{ "patterns": ["docs/**/*.md"] }\n',
    'docs/guide.md': '# Guide\n',
    'decisions/0001-one-writer.md': '# One writer\n',
  },
  agents: {
    'README.md': '# Readme\n',
    'AGENTS.md': '# Agents\n\nRun `npm test`.\n',
    'CLAUDE.md': '# Claude\n\nSee `AGENTS.md`.\n',
  },
  oriented: {
    '.spec-graph.json': '{ "orientation": { "files": ["CLAUDE.md"] } }\n',
    'README.md': '# Readme\n',
    'CLAUDE.md': '# Claude\n',
  },
};

beforeAll(async () => {
  for (const [repository, files] of Object.entries(repositories)) {
    for (const [path, text] of Object.entries(files)) {
      await mkdir(`${ROOT}/${repository}/${path.slice(0, path.lastIndexOf('/') + 1)}`, { recursive: true });
      await writeFile(`${ROOT}/${repository}/${path}`, text);
    }
  }
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

async function stderr(repository: string, ...argv: string[]): Promise<string> {
  const { main } = await import('../src/cli.js');
  let err = '';
  await main({
    argv: ['check', '--root', `${ROOT}/${repository}`, ...argv],
    cwd: process.cwd(),
    stdout: () => undefined,
    stderr: (text) => {
      err += text;
    },
    env: { NO_COLOR: '1', SPEC_GRAPH_ASCII: '1' },
    isTTY: false,
  });
  return err;
}

describe('a family directory the default patterns do not read', () => {
  it('is named, with the patterns that would read it, where it holds Markdown the run read none of', async () => {
    expect(await stderr('families', '--format', 'json')).toBe(
      'spec-graph: Proposals/, adrs/ and decisions/ hold Markdown the default patterns do not read\n' +
        '  name them in "patterns" to check them: "Proposals/**/*.md", "adrs/**/*.md", "decisions/**/*.md"\n',
    );
  });

  it('is said of one as one', async () => {
    const { unreadFamilyDirectories } = await import('../src/runner.js');
    expect(await unreadFamilyDirectories(`${ROOT}/configured`, ['docs/guide.md'])).toEqual(['decisions']);
    expect(await unreadFamilyDirectories(`${ROOT}/configured`, ['docs/guide.md', 'decisions/0001-one-writer.md'])).toEqual([]);
    expect(await unreadFamilyDirectories(`${ROOT}/nowhere`, [])).toEqual([]);
  });

  it('is not named where the run reads patterns of its own, from the command line or the configuration', async () => {
    expect(await stderr('families', 'docs/**/*.md')).toBe('');
    expect(await stderr('configured')).toBe('');
  });
});

describe("an agent's instructions where orientation is not configured", () => {
  it('are named, with the configuration that would hold them to what they name', async () => {
    expect(await stderr('agents')).toBe(
      'spec-graph: AGENTS.md and CLAUDE.md are here and "orientation" is not configured, so no path or command they name is looked for\n' +
        '  add "orientation": { "files": ["AGENTS.md", "CLAUDE.md"] } to the configuration\n',
    );
  });

  it('are said of one as one, and not where orientation is configured', async () => {
    const { orientationDocumentsAt } = await import('../src/runner.js');
    expect(orientationDocumentsAt(`${ROOT}/oriented`)).toEqual(['CLAUDE.md']);
    expect(orientationDocumentsAt(`${ROOT}/families`)).toEqual([]);
    expect(await stderr('oriented')).toBe('');
  });
});
