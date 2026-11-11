import { mkdir, rm, writeFile } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';

import { main } from '../src/cli.js';
import { parseConfig } from '../src/config.js';
import { analyseSources, createHistoryMatcher, createStatusFilter, type Source } from '../src/runner.js';

/**
 * `ignoreStatus`: documents whose own status is not read.
 *
 * Spec Kit writes `**Status**: Draft` under the title of every specification
 * and never changes it, so each reads as a draft for as long as it exists. A
 * repository that knows its format writes a word nobody maintains says so,
 * for every document or for the paths a list matches, and each reads as a
 * document that declares no status: its directory still says what it says,
 * as for any document that writes none. spec-guard reads the same key with
 * the same meaning (spec-core ADR-0005; ADR-0002 here, 2026-11-11).
 */

// Named for the process: Stryker runs a test file in several workers at once,
// in one sandbox, and a fixed path is one they write and delete under each other.
const ROOT = `tests/fixtures/.tmp/ignore-status-${process.pid}`;

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

const sources = (files: Record<string, string>): Source[] => Object.entries(files).map(([path, text]) => ({ path, text }));

/** What Spec Kit's `specify` writes at the top of a specification. */
const specKit = (title: string): string =>
  [`# Feature Specification: ${title}`, '', '**Feature Branch**: `001-login`', '**Created**: 2026-11-11', '**Status**: Draft', '', '## User Scenarios', ''].join('\n');

const SPEC = 'specs/001-login/spec.md';

describe('the configuration key', () => {
  const parse = (value: unknown) => parseConfig(JSON.stringify({ ignoreStatus: value }), '.spec-graph.json');

  it('takes true, false, or the patterns of the documents whose status is not read', () => {
    expect(parse(true)).toEqual({ config: { ignoreStatus: true }, source: '.spec-graph.json', problems: [] });
    expect(parse(false)).toEqual({ config: { ignoreStatus: false }, source: '.spec-graph.json', problems: [] });
    expect(parse(['specs/**/spec.md', 'docs/legacy'])).toEqual({
      config: { ignoreStatus: ['specs/**/spec.md', 'docs/legacy'] },
      source: '.spec-graph.json',
      problems: [],
    });
  });

  it.each([[[]], [['']], [['specs', ' ']], ['specs/**'], [3], [[3]], [null], [{ files: ['specs'] }]])(
    'refuses %j, and reads no value for it',
    (value) => {
      // An empty list names no document and reads as applied: `false` says none.
      expect(parse(value)).toEqual({
        config: {},
        source: '.spec-graph.json',
        problems: [
          '.spec-graph.json: "ignoreStatus" must be true, false or a non-empty array of patterns of the documents whose status is not read, such as ["specs/**/spec.md"]',
        ],
      });
    },
  );
});

describe('the documents it names', () => {
  it('are every document for true, and none for false, an empty list or no key', () => {
    const every = createStatusFilter(true);
    expect([every?.('README.md'), every?.('docs/adr/0001-a.md')]).toEqual([true, true]);
    expect([createStatusFilter(false), createStatusFilter([]), createStatusFilter(undefined)]).toEqual([undefined, undefined, undefined]);
  });

  it('are those a pattern matches: a glob, or a directory and what is beneath it', () => {
    const named = createStatusFilter(['specs/**/spec.md', 'docs/legacy']);
    expect(
      [SPEC, 'specs/001-login/plan.md', 'docs/legacy/a.md', 'docs/legacy/old/b.md', 'docs/adr/0001-a.md'].map((path) => named?.(path)),
    ).toEqual([true, false, true, true, false]);
  });

  it('take no pattern that starts with a !: neither tool takes a negation in this key', () => {
    // Read as taking documents back here and as a file's name in spec-guard,
    // the one list left `docs/legacy/kept.md` unread in one tool and read in
    // the other; each refuses it, as each refuses `.` (spec-core ADR-0005).
    const refusal = (pattern: string) =>
      `"ignoreStatus" takes no negation, and "${pattern}" starts with "!": neither spec-graph nor spec-guard reads one in this key, so name only the documents whose status is not read`;
    expect(() => createStatusFilter(['docs/legacy', '!docs/legacy/kept.md'])).toThrow(refusal('!docs/legacy/kept.md'));
    expect(() => createStatusFilter([' !docs/legacy/kept.md'])).toThrow(refusal(' !docs/legacy/kept.md'));
    // A `!` inside a pattern is a class's or a name's, and is no negation.
    expect(createStatusFilter(['adr/[!0-9]*.md', 'docs/why!.md'])?.('docs/why!.md')).toBe(true);
    expect(parseConfig(JSON.stringify({ ignoreStatus: ['docs/legacy', '!docs/legacy/kept.md', '! docs/a.md'] }), '.spec-graph.json')).toEqual({
      config: {},
      source: '.spec-graph.json',
      problems: [`.spec-graph.json: ${refusal('!docs/legacy/kept.md')}`, `.spec-graph.json: ${refusal('! docs/a.md')}`],
    });
  });
});

describe('a document whose status is not read', () => {
  it('declares none, where Spec Kit wrote Draft', () => {
    const files = { [SPEC]: specKit('Login') };
    expect(analyseSources(sources(files)).graph.document('specs/001-login/spec')?.phase).toBe('draft');
    const read = analyseSources(sources(files), { isStatusUnread: createStatusFilter([SPEC]) }).graph.document('specs/001-login/spec');
    expect([read?.phase, read?.rawStatus, read?.statusAt]).toEqual(['unknown', null, null]);
  });

  it('is not superseded while it reads as a draft', () => {
    const files = {
      [SPEC]: specKit('Login'),
      'docs/adr/0002-sessions.md': '---\nstatus: accepted\nsupersedes: ../../specs/001-login/spec.md\n---\n\n# ADR-0002: Sessions\n',
    };
    const rules = (isStatusUnread?: (path: string) => boolean) =>
      analyseSources(sources(files), { isStatusUnread }).diagnostics.map((diagnostic) => `${diagnostic.rule} ${diagnostic.message}`);
    expect(rules()).toEqual(['live-supersession specs/001-login/spec is superseded by ADR-0002 but still reads as draft']);
    expect(rules(createStatusFilter(['specs']))).toEqual([]);
  });

  it.each([
    ['a directive', '# ADR-0001: A\n\n<!-- @spec-node status="superseded" -->\n'],
    ['front matter', '---\nstatus: superseded\n---\n\n# ADR-0001: A\n'],
    ['a status section', '# ADR-0001: A\n\n## Status\n\nSuperseded\n'],
    ['a table above the first section', '# ADR-0001: A\n\n| Status | Superseded |\n| --- | --- |\n\n## Context\n'],
    ['a label', '# ADR-0001: A\n\nStatus: Superseded\n'],
  ])('is not read from %s', (_, text) => {
    const phase = (isStatusUnread?: (path: string) => boolean) =>
      analyseSources(sources({ 'docs/adr/0001-a.md': text }), { isStatusUnread }).graph.document('ADR-0001')?.phase;
    expect([phase(), phase(() => true)]).toEqual(['retired', 'unknown']);
  });

  it('names no successor in a status it does not read', () => {
    const files = {
      'docs/adr/0001-a.md': '---\nstatus: Superseded by ADR-0002\n---\n\n# ADR-0001: A\n',
      'docs/adr/0002-b.md': '---\nstatus: accepted\n---\n\n# ADR-0002: B\n',
    };
    const supersessions = (isStatusUnread?: (path: string) => boolean) =>
      analyseSources(sources(files), { isStatusUnread })
        .graph.edges.filter((edge) => edge.kind === 'supersedes')
        .map((edge) => `${edge.from} -> ${edge.to}`);
    expect(supersessions()).toEqual(['ADR-0002 -> ADR-0001']);
    expect(supersessions(createStatusFilter(['docs/adr/0001-a.md']))).toEqual([]);
  });

  it('still takes its phase from its directory, and is still a record where one is named', () => {
    const files = {
      'docs/adr/archive/0001-a.md': '---\nstatus: accepted\n---\n\n# ADR-0001: A\n',
      'docs/JOURNAL.md': '---\nstatus: accepted\n---\n\n# Journal\n',
    };
    const { graph } = analyseSources(sources(files), { isStatusUnread: () => true, isRecord: createHistoryMatcher(['docs/JOURNAL.md']) });
    expect([graph.document('ADR-0001')?.phase, graph.document('JOURNAL')?.phase]).toEqual(['retired', 'record']);
  });

  it('leaves the statuses of the rows and sections it holds read, each written by its own', () => {
    const files = {
      'docs/decisions.md': [
        '---',
        'status: superseded',
        '---',
        '',
        '# Decisions',
        '',
        '| ID | Title | Status |',
        '| --- | --- | --- |',
        '| ADR-0100 | Kept | Accepted |',
        '| ADR-0101 | Gone | Superseded |',
        '',
        '## ADR-0200: A section',
        '',
        '**Status:** draft',
        '',
      ].join('\n'),
    };
    const { graph } = analyseSources(sources(files), { isStatusUnread: () => true });
    expect(['decisions', 'ADR-0100', 'ADR-0101', 'ADR-0200'].map((id) => graph.document(id)?.phase)).toEqual([
      'unknown',
      'active',
      'retired',
      'draft',
    ]);
  });

  it('is only one a pattern names: every other document keeps its status', () => {
    const files = { [SPEC]: specKit('Login'), 'docs/adr/0001-a.md': '---\nstatus: superseded\n---\n\n# ADR-0001: A\n' };
    const { graph } = analyseSources(sources(files), { isStatusUnread: createStatusFilter(['specs/**/spec.md']) });
    expect([graph.document('specs/001-login/spec')?.phase, graph.document('ADR-0001')?.phase]).toEqual(['unknown', 'retired']);
  });
});

describe('a run with the key in its configuration', () => {
  it('reads it from the file, and changes nothing without it', async () => {
    await rm(ROOT, { recursive: true, force: true });
    await mkdir(`${ROOT}/specs/001-login`, { recursive: true });
    await mkdir(`${ROOT}/docs/adr`, { recursive: true });
    await writeFile(`${ROOT}/${SPEC}`, specKit('Login'));
    await writeFile(`${ROOT}/docs/adr/0002-sessions.md`, '---\nstatus: accepted\nsupersedes: ../../specs/001-login/spec.md\n---\n\n# ADR-0002: Sessions\n');
    const run = async (config: string) => {
      await writeFile(`${ROOT}/.spec-graph.json`, config);
      let out = '';
      let err = '';
      const code = await main({
        argv: ['check', '--root', ROOT, '--format', 'json'],
        cwd: process.cwd(),
        stdout: (text) => {
          out += text;
        },
        stderr: (text) => {
          err += text;
        },
      });
      return { code, out, err };
    };
    const findings = async (config: string) => {
      const { code, out } = await run(config);
      return [code, (JSON.parse(out) as { diagnostics: { rule: string }[] }).diagnostics.map((diagnostic) => diagnostic.rule)];
    };
    expect(await findings('{ "ignoreStatus": false }\n')).toEqual([1, ['live-supersession']]);
    expect(await findings('{ "ignoreStatus": ["specs"] }\n')).toEqual([0, []]);
    expect(await findings('{ "ignoreStatus": true }\n')).toEqual([0, []]);
    // A pattern that is no glob is refused as any other is, by the pattern,
    // and so is `.`, which neither tool takes in this key: `true` names every document.
    for (const [pattern, said] of [
      ['specs/[x', 'invalid glob "specs/[x"'],
      ['.', 'invalid glob ".": the pattern names no path'],
    ]) {
      const refused = await run(`{ "ignoreStatus": ["${pattern}"] }\n`);
      expect([refused.code, refused.out]).toEqual([2, '']);
      expect(refused.err).toContain(said);
    }
  });
});
