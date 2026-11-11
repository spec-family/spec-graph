/**
 * The family's old home is named only as history, and the new one is where
 * npm's trusted publisher looks.
 *
 * On 2026-10-26 the five repositories moved from the GitHub organization
 * DescentVTT to spec-family, and the packages from the `@descent-vtt` scope
 * to `@spec-family` (spec-core's docs/adr/0005-the-family-contract.md,
 * amended 2026-10-26; ADR-0021 here, amended the same day). The old scope
 * written as present - in a command, an import or an example - names a
 * deprecated package, and the old owner in a path names a repository that is
 * not there. spec-core's tests/organization.test.ts holds its files the same
 * way.
 *
 * History keeps the old names as written, as that amendment has it: the
 * changelog, and a record or an amendment in an ADR, which says what was so
 * on its date. Elsewhere a passage that names the date of the move is about
 * the move and may name what it moved from - "Until 2026-10-26 the tools
 * were published as ..." is past. A link is a pointer and names spec-family
 * wherever it stands, but in the changelog, which keeps a link too: what
 * 0.9.2 printed, and the repository a defect was found in, which did not
 * move, are what they were. There spec-core's test parts from this one.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');

/** The old scope, and the old owner in a path. */
const OLD = /@descent-vtt\b|\bdescentvtt\//i;
/** A link to the old owner, which no history keeps. */
const LINK = /\bgithub\.com\/descentvtt\b/i;
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const MOVED = '2026-10-26';

const HEADING = /^ {0,3}(#{1,6})\s/;
const ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+/;
const FENCE = /^\s*(?:```|~~~)/;

/** How a file keeps history: all of it, its dated parts, or the passages that name the move. */
type Keeps = 'all' | 'dated' | 'move';

function keepsOf(file: string): Keeps {
  if (file === 'CHANGELOG.md') return 'all';
  return file.startsWith('docs/adr/') ? 'dated' : 'move';
}

/**
 * The passage each line stands in, as text: a run of lines up to a blank
 * line, a heading or the next list item, so that one item of a list is not
 * dated by its neighbour.
 */
function passagesOf(lines: readonly string[]): string[] {
  const out: string[] = [];
  let start = 0;
  const close = (end: number): void => {
    const text = lines.slice(start, end).join('\n');
    for (let at = start; at < end; at += 1) out[at] = text;
    start = end;
  };
  lines.forEach((line, at) => {
    if (line.trim() === '' || HEADING.test(line) || ITEM.test(line)) {
      close(at);
      if (line.trim() === '' || HEADING.test(line)) close(at + 1);
    }
  });
  close(lines.length);
  return out;
}

/**
 * Whether each line of a record stands under a heading that names a date, or
 * in a list item whose first passage does - an amendment written as an item,
 * with the paragraphs indented under it.
 */
function datedOf(lines: readonly string[]): boolean[] {
  const headings: { level: number; dated: boolean }[] = [];
  const items: { content: number; dated: boolean }[] = [];
  const passages = passagesOf(lines);
  let fenced = false;
  let blank = true;
  return lines.map((line, at) => {
    if (FENCE.test(line)) fenced = !fenced;
    const heading = fenced ? null : HEADING.exec(line);
    if (heading !== null) {
      const level = heading[1]!.length;
      while (headings.length > 0 && headings[headings.length - 1]!.level >= level) headings.pop();
      headings.push({ level, dated: DATE.test(line) });
      items.length = 0;
    } else if (line.trim() !== '') {
      const lead = line.length - line.trimStart().length;
      const item = fenced ? null : ITEM.exec(line);
      // A line that opens a passage, or another item, ends the items it is not indented under.
      if (blank || item !== null) while (items.length > 0 && items[items.length - 1]!.content > lead) items.pop();
      if (item !== null) items.push({ content: item[0].length, dated: DATE.test(passages[at]!) });
    }
    blank = line.trim() === '';
    return headings.some((h) => h.dated) || items.some((i) => i.dated);
  });
}

/** Each line of `text` that names the old home as present, as `line: text`. */
function presentOf(text: string, keeps: Keeps): string[] {
  const lines = text.split('\n');
  const passages = passagesOf(lines);
  const dated = keeps === 'dated' ? datedOf(lines) : [];
  return lines.flatMap((line, at) => {
    if (!OLD.test(line)) return [];
    const kept =
      keeps === 'all' || (!LINK.test(line) && (keeps === 'dated' ? dated[at]! || DATE.test(passages[at]!) : passages[at]!.includes(MOVED)));
    return kept ? [] : [`${at + 1}: ${line.trim()}`];
  });
}

/**
 * Every file a reader or a tool takes a name from: the documents, records
 * included, the workflows, the scripts, the sources and package.json. The
 * tests stay out, as in tests/names.test.ts: their cases name the old scope
 * to be found.
 */
function files(): string[] {
  const skip = new Set(['node_modules', 'dist', 'coverage', 'reports', '.stryker-tmp', '.git', '.claude', 'tests', 'package-lock.json']);
  const below = (directory: string): string[] =>
    readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
      if (skip.has(entry.name)) return [];
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) return below(path);
      return /\.(?:md|ya?ml|json|[cm]?[jt]s|sh)$/.test(entry.name) ? [path] : [];
    });
  return below('').sort();
}

describe('reading a file for the old home named as present', () => {
  it('finds the old scope and the old owner in a path, whatever the case', () => {
    expect(presentOf('npm install --save-dev @descent-vtt/spec-graph', 'move')).toEqual(['1: npm install --save-dev @descent-vtt/spec-graph']);
    expect(presentOf('import x from "@Descent-VTT/spec-graph";', 'move')).toHaveLength(1);
    expect(presentOf('Clone DescentVTT/spec-graph.', 'move')).toHaveLength(1);
    expect(presentOf('see https://github.com/descentvtt/spec-graph/pull/68', 'move')).toHaveLength(1);
  });

  it('reads past a name that only resembles one', () => {
    for (const text of ['a repository outside DescentVTT.', 'descent-vtt alone', '@spec-family/spec-graph', 'email@descent-vttx.org', 'xdescentvtt/']) {
      expect(presentOf(text, 'move'), text).toEqual([]);
    }
  });

  it('keeps a passage that names the date of the move, and no other date, outside the records', () => {
    const passage = ['Until 2026-10-26 the tools were published as', '`@descent-vtt/<name>`, and moving is a reinstall.'].join('\n');
    expect(presentOf(passage, 'move')).toEqual([]);
    expect(presentOf(passage.replace('2026-10-26', '2026-10-07'), 'move')).toHaveLength(1);
    // A blank line ends the passage, and so does a heading or another item.
    expect(presentOf(`Until 2026-10-26 it was elsewhere.\n\nInstall @descent-vtt/spec-graph.`, 'move')).toHaveLength(1);
    expect(presentOf(`- Moved on 2026-10-26.\n- Install @descent-vtt/spec-graph.`, 'move')).toHaveLength(1);
  });

  it('keeps everything in the changelog, a link too, and a link nowhere else', () => {
    expect(presentOf('- `npm uninstall @descent-vtt/<name>`', 'all')).toEqual([]);
    expect(presentOf('[VirtualCortex](https://github.com/DescentVTT/VirtualCortex)', 'all')).toEqual([]);
    expect(presentOf('Until 2026-10-26 (https://github.com/DescentVTT/spec-graph/pull/3)', 'move')).toHaveLength(1);
  });

  it('keeps what a record dates: a dated heading, a dated amendment and the paragraphs under it, a dated paragraph', () => {
    const record = [
      '# ADR-0099: names',
      '',
      '## Decision',
      '',
      'The core is `@descent-vtt/spec-core`.',
      '',
      '- *Amended 2026-10-07*: **a command names its package**, as',
      '  `npx --no-install @descent-vtt/<name>`.',
      '',
      '  Under the item, `@descent-vtt/<name>` again.',
      '  ```bash',
      '  # not a heading',
      '  npx @descent-vtt/spec-guard',
      '  ```',
      '- Another item, `@descent-vtt/spec-brief`.',
      '',
      'After the list, `@descent-vtt/spec-graph`.',
      '',
      'Read on 2026-09-30: `@descent-vtt/spec-guard`.',
      '',
      '## Amended 2026-10-26: the move',
      '',
      '### What it changed',
      '',
      'It was `@descent-vtt/spec-guard`.',
      '',
      '## Alternatives',
      '',
      '| A dependency on `@descent-vtt/spec-core` | no |',
    ].join('\n');
    expect(presentOf(record, 'dated')).toEqual([
      '5: The core is `@descent-vtt/spec-core`.',
      '15: - Another item, `@descent-vtt/spec-brief`.',
      '17: After the list, `@descent-vtt/spec-graph`.',
      '29: | A dependency on `@descent-vtt/spec-core` | no |',
    ]);
    expect(presentOf('## Amended 2026-10-26\n\nhttps://github.com/DescentVTT/spec-core', 'dated')).toHaveLength(1);
  });
});

describe('the package', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    name: string;
    repository: { type: string; url: string };
    bugs: { url: string };
    homepage: string;
  };

  it('names the repository its trusted publisher is set up for', () => {
    // npm accepts a staged version only from the workflow of the repository
    // `repository.url` names, and the provenance it signs names the same one
    // (ADR-0021): a url left at the old home is a release npm refuses.
    expect(pkg.name).toBe('@spec-family/spec-graph');
    expect(pkg.repository).toEqual({ type: 'git', url: 'git+https://github.com/spec-family/spec-graph.git' });
    expect(pkg.bugs.url).toBe('https://github.com/spec-family/spec-graph/issues');
    expect(pkg.homepage).toBe('https://spec-family.github.io');
  });
});

describe('the files of this repository', () => {
  const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
  const all = files();

  it('are read: the documents, the records, the workflows, the scripts, the sources and the manifest', () => {
    // A directory that moved, or an extension this file no longer reads,
    // would leave the check below nothing to fail on.
    expect(all).toEqual(
      expect.arrayContaining([
        'README.md',
        'CHANGELOG.md',
        'CONTRIBUTING.md',
        'CLAUDE.md',
        'docs/adr/0021-releases-are-published-by-ci.md',
        '.github/workflows/release.yml',
        'package.json',
        'scripts/mutation-shards.mjs',
        'src/cli.ts',
        'bin/spec-graph.js',
      ]),
    );
    // The records that say what moved do name the old scope.
    expect(all.filter((file) => OLD.test(read(file)))).toEqual(expect.arrayContaining(['CHANGELOG.md', 'docs/adr/0021-releases-are-published-by-ci.md']));
  });

  it('name the old organization and scope only as history', () => {
    expect(all.flatMap((file) => presentOf(read(file), keepsOf(file)).map((line) => `${file}:${line}`))).toEqual([]);
  });
});
