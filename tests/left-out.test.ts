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
 * to it was told to widen a pattern that already reached it. The limit is
 * the family's now, spec-guard's 20 MiB; the tests below set a small one.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test, and a sweep reads that as a survived mutant.
 */

// Named for the process: Stryker runs a test file in several workers at once,
// in one sandbox, and a fixed path is one they write and delete under each other.
const ROOT = `tests/fixtures/.tmp/left-out-${process.pid}`;
/** The limit the tests set, so no file of megabytes is written for them. */
const LIMIT = 1024;
const BIG = `# Log\n\n${'x'.repeat(LIMIT)}\n`;

const files: Record<string, string> = {
  'dup/docs/a/notes.md': '# Notes\n\nSee [missing](gone.md).\n',
  'dup/docs/b/notes.md': '# Notes\n\nSee [missing](gone.md).\n',
  'dup/docs/c/notes.md': '# Notes\n',
  'dup/docs/kept.md': '# Kept\n',
  'regions/docs/register.md': '# Register\n\n## REQ-1: One\n\nStatus: open\n\n## REQ-1: Again\n\nStatus: open\n',
  'big/docs/a.md': '# A\n\nThe history is in [the log](log.md).\n',
  'big/docs/log.md': BIG,
  'clean/docs/a.md': '# A\n',
};

beforeAll(async () => {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(`${ROOT}/${path.slice(0, path.lastIndexOf('/'))}`, { recursive: true });
    await writeFile(`${ROOT}/${path}`, text);
  }
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

async function check(corpus: string) {
  const { analyse } = await import('../src/runner.js');
  return analyse({ root: `${ROOT}/${corpus}`, patterns: ['docs/**/*.md'], maxFileSize: LIMIT });
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
    expect(await summary('dup')).toMatchObject({ duplicateIdFiles: 2 });
    // A section whose id was taken leaves only itself out, and its file stays.
    expect(await summary('regions')).toMatchObject({ duplicateIdFiles: 0 });
  });

  it('say nothing where every file reached the graph', async () => {
    expect(await human('clean')).toEqual([]);
    expect(await human('regions')).toEqual([]);
  });
});

describe('a file over the size a run reads', () => {
  it('is named in every report, and skipped in the JSON with why and its size, as spec-guard names one', async () => {
    expect(await human('big')).toEqual(['! 1 file over 1024 bytes not read: docs/log.md']);
    const { formatJson, formatMarkdown } = await import('../src/report.js');
    const result = await check('big');
    const json = JSON.parse(formatJson(result));
    expect([json.skipped, json.files]).toEqual([[{ path: 'docs/log.md', reason: 'size', bytes: Buffer.byteLength(BIG) }], ['docs/a.md']]);
    expect(formatMarkdown(result)).toContain('1 file over 1024 bytes not read: docs/log.md.');
    // Present where nothing was skipped, as `suppressed` is.
    expect(JSON.parse(formatJson(await check('clean'))).skipped).toEqual([]);
  });

  it('is over 20 MiB unless a run says otherwise, the limit spec-guard has', async () => {
    const { MAX_FILE_SIZE } = await import('../src/glob.js');
    const { analyse } = await import('../src/runner.js');
    const { formatReport } = await import('../src/report.js');
    expect(MAX_FILE_SIZE).toBe(20 * 1024 * 1024);
    const result = await analyse({ root: `${ROOT}/big`, patterns: ['docs/**/*.md'] });
    expect([result.maxFileSize, result.skipped, result.files]).toEqual([MAX_FILE_SIZE, [], ['docs/a.md', 'docs/log.md']]);
    const said = formatReport({ ...result, skipped: [{ path: 'docs/huge.md', reason: 'size', bytes: MAX_FILE_SIZE + 1 }] }, { ascii: true });
    expect(said).toContain('! 1 file over 20 MiB not read: docs/huge.md');
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
