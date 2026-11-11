import { mkdir, rm, writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { analyse, analyseSources, type Source } from '../src/runner.js';

/**
 * A link to a directory, written without the trailing slash.
 *
 * "A link to source code, an image, or a directory is ordinary in a design
 * document" (ADR-0006). `[the guides](../guides/)` was never reported;
 * `[the guides](../guides)` names the same directory and was a reference
 * outside the corpus, "resolves to a file that is not a specification", with
 * a hint to include patterns that could never reach it.
 *
 * So was `[MIT](LICENSE)` with the file there: a link with no slash was read
 * as an identifier, and an identifier naming no document was a broken
 * reference. A link's destination is a URL read against the document's own
 * directory, so the disk is asked about it with a slash or without one; a
 * wiki link, a front-matter value and a directive name an identifier unless
 * they are spelled as a path.
 */

// Named for the process: Stryker runs a test file in several workers at once,
// in one sandbox, and a fixed path is one they write and delete under each other.
const ROOT = `tests/fixtures/.tmp/directory-links-${process.pid}`;

beforeAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
  await mkdir(`${ROOT}/docs/adr`, { recursive: true });
  await mkdir(`${ROOT}/guides`, { recursive: true });
  // A directory named as a document is: only the disk tells it from a file.
  await mkdir(`${ROOT}/manual.txt`, { recursive: true });
  await writeFile(`${ROOT}/guides/setup.txt`, 'x\n');
  await writeFile(`${ROOT}/CHANGES`, 'x\n');
  await writeFile(`${ROOT}/docs/adr/LICENSE`, 'x\n');
  await writeFile(
    `${ROOT}/docs/adr/0001-a.md`,
    [
      '---',
      'status: accepted',
      '---',
      '',
      '# A',
      '',
      'See [the guides](../../guides), [the manual](../../manual.txt), [the changes](../../CHANGES), [MIT](LICENSE), [the gone](../../gone) and [nothing](NOTHING).',
      '',
    ].join('\n'),
  );
});

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

type Options = Parameters<typeof analyseSources>[1];

/** The rule and message of every finding about a reference, in order. */
function referenceFindings(body: string, options: Options = {}): string[] {
  const sources: Source[] = [{ path: 'docs/adr/0001-a.md', text: `---\nstatus: accepted\n---\n\n# A\n\n${body}\n` }];
  return analyseSources(sources, options)
    .diagnostics.filter((diagnostic) => diagnostic.rule.includes('reference'))
    .map((diagnostic) => `${diagnostic.rule} ${diagnostic.message}`);
}

const guidesOnly = { isDirectory: (path: string) => path === 'guides', fileExists: (path: string) => path === 'guides' };

describe('a link to a directory without a trailing slash', () => {
  it.each(['../../guides', './../../guides', '../../guides#setup'])('is not a reference when the directory is there: %s', (target) => {
    expect(referenceFindings(`The steps live in [the guides](${target}).`, guidesOnly)).toEqual([]);
  });

  it('is asked about as the path it resolves to, from the document holding it', () => {
    const asked: string[] = [];
    const isDirectory = (path: string): boolean => {
      asked.push(path);
      return false;
    };
    referenceFindings('The steps live in [the guides](../guides).', { isDirectory });
    expect(asked).toEqual(['docs/guides']);
  });

  it('is a broken reference when no directory is there', () => {
    expect(referenceFindings('The steps live in [the guides](../../guides).', { isDirectory: () => false })).toEqual([
      'broken-reference "../../guides" does not resolve to any document',
    ]);
  });

  it('is a broken reference as before when the caller says nothing about directories', () => {
    expect(referenceFindings('The steps live in [the guides](../../guides).')).toEqual([
      'broken-reference "../../guides" does not resolve to any document',
    ]);
  });

  it('is a directory with no slash in it at all, read beside the document', () => {
    const asked: string[] = [];
    const isDirectory = (path: string): boolean => {
      asked.push(path);
      return path === 'docs/adr/guides';
    };
    expect(referenceFindings('The steps live in [the guides](guides).', { isDirectory })).toEqual([]);
    expect(asked).toEqual(['docs/adr/guides']);
  });

  it('is an identifier in a wiki link, in front matter and in a directive, whatever the disk holds', () => {
    const disk = { isDirectory: () => true, fileExists: () => true };
    expect(referenceFindings('The steps live in [[guides]].', disk)).toEqual([
      'broken-reference "guides" does not resolve to any document',
    ]);
    const findings = (text: string) =>
      analyseSources([{ path: 'docs/adr/0001-a.md', text }], disk)
        .diagnostics.filter((diagnostic) => diagnostic.rule.includes('reference'))
        .map((diagnostic) => `${diagnostic.rule} ${diagnostic.message}`);
    expect(findings('---\ndepends-on: guides\n---\n\n# A\n')).toEqual([
      'broken-reference "guides" does not resolve to any document',
    ]);
    expect(findings('# A\n\n<!-- @spec-edge kind="depends-on" to="guides" -->\n')).toEqual([
      'broken-reference "guides" does not resolve to any document',
    ]);
  });
});

describe('a link to a file with no extension', () => {
  const only = (file: string) => ({ isDirectory: () => false, fileExists: (path: string) => path === file });

  it.each([
    ['../../CHANGES', 'CHANGES'],
    ['./LICENSE', 'docs/adr/LICENSE'],
    ['LICENSE', 'docs/adr/LICENSE'],
    ['LICENSE#L3', 'docs/adr/LICENSE'],
    ['../../Makefile', 'Makefile'],
    ['../../docker/Dockerfile', 'docker/Dockerfile'],
    ['v1.2', 'docs/adr/v1.2'],
  ])('is not a reference when the file is there: %s', (target, file) => {
    expect(referenceFindings(`Listed in [the file](${target}).`, only(file))).toEqual([]);
  });

  it('is asked about as the path it resolves to, from the document holding it', () => {
    const asked: string[] = [];
    const fileExists = (path: string): boolean => {
      asked.push(path);
      return false;
    };
    referenceFindings('Under [MIT](LICENSE).', { fileExists });
    expect(asked).toEqual(['docs/adr/LICENSE']);
  });

  it('is a broken reference when no file is there', () => {
    expect(referenceFindings('Under [MIT](LICENSE) and [the rest](./NOTHING).', only('LICENSE'))).toEqual([
      'broken-reference "LICENSE" does not resolve to any document',
      'broken-reference "./NOTHING" does not resolve to any document',
    ]);
  });

  it('is a broken reference as before when the caller says nothing about files', () => {
    expect(referenceFindings('Under [MIT](LICENSE).', { isDirectory: () => false })).toEqual([
      'broken-reference "LICENSE" does not resolve to any document',
    ]);
  });

  it('still resolves to a document of that name before the disk is asked', () => {
    const asked: string[] = [];
    const { graph, diagnostics } = analyseSources(
      [
        { path: 'docs/adr/0001-a.md', text: '# ADR-0001: A\n\nSee [the decision](ADR-0007).\n' },
        { path: 'docs/adr/0007-sharding.md', text: '# ADR-0007: Sharding\n' },
      ],
      {
        fileExists: (path) => {
          asked.push(path);
          return true;
        },
      },
    );
    expect(graph.edges.filter((edge) => edge.kind === 'references').map((edge) => `${edge.from} -> ${edge.to}`)).toEqual([
      'ADR-0001 -> ADR-0007',
    ]);
    expect(diagnostics.filter((diagnostic) => diagnostic.rule.includes('reference'))).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('is never asked of the disk when the citation is in prose', () => {
    // `ADR-0099` written in prose names a member of a family the corpus has, or nothing.
    const asked: string[] = [];
    const { diagnostics } = analyseSources(
      [
        { path: 'docs/adr/0001-a.md', text: '# ADR-0001: A\n\nAs ADR-0099 said.\n' },
      ],
      {
        fileExists: (path) => {
          asked.push(path);
          return true;
        },
      },
    );
    expect(diagnostics.map((diagnostic) => `${diagnostic.rule} ${diagnostic.message}`)).toEqual([
      'broken-reference "ADR-0099" does not resolve to any document',
    ]);
    expect(asked).toEqual([]);
  });

  it('still resolves to a directory-style document before the disk is asked', () => {
    const asked: string[] = [];
    const { graph, diagnostics } = analyseSources(
      [
        { path: 'docs/adr/0001-a.md', text: '# ADR-0001: A\n\nSee [sharding](0007-sharding).\n' },
        { path: 'docs/adr/0007-sharding/README.md', text: '# ADR-0007: Sharding\n' },
      ],
      {
        isDirectory: (path) => {
          asked.push(path);
          return true;
        },
      },
    );
    expect(graph.edges.filter((edge) => edge.kind === 'references').map((edge) => `${edge.from} -> ${edge.to}`)).toEqual([
      'ADR-0001 -> ADR-0007',
    ]);
    expect(diagnostics.filter((diagnostic) => diagnostic.rule.includes('reference'))).toEqual([]);
    expect(asked).toEqual([]);
  });
});

describe('the run on disk', () => {
  it('reads a directory and a file with no extension as no reference, and nothing as a broken reference', async () => {
    const { diagnostics } = await analyse({ root: ROOT });
    expect(
      diagnostics.filter((diagnostic) => diagnostic.rule.includes('reference')).map((diagnostic) => `${diagnostic.rule} ${diagnostic.message}`),
    ).toEqual([
      'broken-reference "../../gone" does not resolve to any document',
      'broken-reference "NOTHING" does not resolve to any document',
    ]);
  });
});
