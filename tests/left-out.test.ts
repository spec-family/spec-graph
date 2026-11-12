import { mkdir, rm, writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * A file a run read nothing in is said, whether or not anything lists it.
 *
 * backstage's `docs/**` is 761 files, and 425 of them never reached the
 * graph: 302 release notes read as V-1, and Docusaurus ids such as `index`
 * given in many folders. Each was left out with a warning among the parse
 * problems, printed under `--verbose` alone, and its broken links with it. A
 * Markdown file over 4 MiB was not read, with no word anywhere, and a link
 * to it was told to widen a pattern that already reached it.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test, and a sweep reads that as a survived mutant.
 */

// Named for the process: Stryker runs a test file in several workers at once,
// in one sandbox, and a fixed path is one they write and delete under each other.
const ROOT = `tests/fixtures/.tmp/left-out-${process.pid}`;
const BIG = 4 * 1024 * 1024 + 1;

const files: Record<string, string> = {
  'dup/docs/a/notes.md': '# Notes\n\nSee [missing](gone.md).\n',
  'dup/docs/b/notes.md': '# Notes\n\nSee [missing](gone.md).\n',
  'dup/docs/c/notes.md': '# Notes\n',
  'dup/docs/kept.md': '# Kept\n',
  'regions/docs/register.md': '# Register\n\n## REQ-1: One\n\nStatus: open\n\n## REQ-1: Again\n\nStatus: open\n',
  'big/docs/a.md': '# A\n\nThe history is in [the log](log.md).\n',
  'clean/docs/a.md': '# A\n',
};

beforeAll(async () => {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(`${ROOT}/${path.slice(0, path.lastIndexOf('/'))}`, { recursive: true });
    await writeFile(`${ROOT}/${path}`, text);
  }
  await writeFile(`${ROOT}/big/docs/log.md`, `# Log\n\n${'x'.repeat(BIG)}\n`);
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

async function check(corpus: string) {
  const { analyse } = await import('../src/runner.js');
  return analyse({ root: `${ROOT}/${corpus}`, patterns: ['docs/**/*.md'] });
}

async function human(corpus: string, verbose = false): Promise<string[]> {
  const { formatReport } = await import('../src/report.js');
  return formatReport(await check(corpus), { verbose, ascii: true })
    .split('\n')
    .filter((line) => / left out | not read: /.test(line));
}

describe('files left out for a duplicate id', () => {
  it('are counted in every report, and named under --verbose', async () => {
    expect(await human('dup')).toEqual(['! 2 files left out for a duplicate id (--verbose names them)']);
    const verbose = await human('dup', true);
    expect(verbose).toContain('! 2 files left out for a duplicate id');
  });

  it('are counted in the JSON summary, as files and not as the sections of one', async () => {
    const { formatJson } = await import('../src/report.js');
    const summary = (corpus: string) => check(corpus).then((result) => JSON.parse(formatJson(result)).summary);
    expect(await summary('dup')).toMatchObject({ duplicateIdFiles: 2, oversizedFiles: 0 });
    // A section whose id was taken leaves only itself out, and its file stays.
    expect(await summary('regions')).toMatchObject({ duplicateIdFiles: 0, oversizedFiles: 0 });
  });

  it('say nothing where every file reached the graph', async () => {
    expect(await human('clean')).toEqual([]);
    expect(await human('regions')).toEqual([]);
  });
});

describe('a file over the size a run reads', () => {
  it('is named in every report, with its size in the JSON', async () => {
    expect(await human('big')).toEqual(['! 1 file over 4 MiB not read: docs/log.md']);
    const { formatJson, formatMarkdown } = await import('../src/report.js');
    const result = await check('big');
    const json = JSON.parse(formatJson(result));
    expect([json.summary.oversizedFiles, json.files]).toEqual([1, ['docs/a.md']]);
    expect(result.oversized).toEqual([{ file: 'docs/log.md', bytes: Buffer.byteLength(`# Log\n\n${'x'.repeat(BIG)}\n`) }]);
    expect(formatMarkdown(result)).toContain('1 file over 4 MiB not read: docs/log.md.');
  });

  it('is no finding where a link names it, which no pattern would bring into reach', async () => {
    expect((await check('big')).diagnostics.map((d) => `${d.rule} ${d.message}`)).toEqual([]);
  });
});

describe('the walk', () => {
  it('tells of each file it does not hand back for its size, once, however often it reaches it', async () => {
    const { walkFiles } = await import('../src/glob.js');
    const told: string[] = [];
    const walked = await walkFiles({
      root: `${ROOT}/dup`,
      patterns: ['docs/**/*.md', 'docs/a/*.md'],
      maxFileSize: 10,
      onOversized: (file) => told.push(`${file.path} ${file.size}`),
    });
    expect(walked.map((file) => file.path)).toEqual(['docs/c/notes.md', 'docs/kept.md']);
    expect(told.sort()).toEqual(['docs/a/notes.md 33', 'docs/b/notes.md 33']);
  });
});
