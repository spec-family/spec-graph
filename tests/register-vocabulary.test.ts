import { describe, expect, it } from 'vitest';

import { EXIT_FAILED, main } from '../src/cli.js';
import { parseConfig } from '../src/config.js';
import { historyOf } from '../src/history.js';
import { createRegisterCheck, statusWord, summariseRegisters } from '../src/registers.js';
import { formatJson, formatReport } from '../src/report.js';
import { analyseSources } from '../src/runner.js';
import type { RegistersConfig } from '../src/types.js';

/**
 * A register the configuration names, held to its status vocabulary, and a
 * row cited by its key as an anchor (ADR-0027).
 */

const doc = (...lines: string[]): string => lines.join('\n');
const CONFIG: RegistersConfig = {
  files: ['review.md'],
  resolution: 'Proposed resolution',
  statuses: {
    open: {},
    proposed: { needs: ['resolution'] },
    decided: { needs: ['resolution'] },
    done: { closes: true, needs: ['citation', 'commit'] },
  },
};
const HEAD = historyOf('HEAD', 'abcdef0\u001fRefuse a refund over its capture\n');
const header = ['| Key | Problem | Proposed resolution | Status |', '| :--- | :--- | :--- | :--- |'];
const register = (...rows: string[]): string => doc('# Review', '', ...header, ...rows, '');

function analysed(files: Record<string, string>, config: RegistersConfig | undefined = CONFIG) {
  const check = createRegisterCheck(config);
  return {
    check,
    ...analyseSources(
      Object.entries({ 'spec/refunds.md': '# Refunds\n', ...files }).map(([path, text]) => ({ path, text })),
      { registers: check, history: HEAD },
    ),
  };
}

const findings = (files: Record<string, string>, config?: RegistersConfig): string[] =>
  analysed(files, config)
    .diagnostics.filter((d) => ['duplicate-key', 'unknown-register-status', 'incomplete-register-row', 'unknown-commit', 'broken-reference'].includes(d.rule))
    .map((d) => `${d.rule} ${d.at.span.start.line}: ${d.message}`);

describe('a row cited by its key as an anchor', () => {
  it('is reached, in any case, in a register nobody configured, and a key no row has is a broken anchor', () => {
    const files = {
      'review.md': register('| `refund-limit` | Over the capture. | Refuse them. | proposed |'),
      'brief.md': doc('# Brief', '', 'See [the limit](review.md#refund-limit), [again](review.md#Refund-Limit) and [nothing](review.md#refund-none).', ''),
    };
    const { corpus } = analysed(files, undefined);
    expect(corpus.edges.filter((edge) => edge.from === 'brief').map((edge) => edge.to)).toEqual(['refund-limit']);
    expect(corpus.dangling.map((ref) => [ref.target, ref.reason])).toEqual([['review.md#refund-none', 'unknown-anchor']]);
  });

  it('is reached for a specification a heading declares, by its id, where the heading slug says more', () => {
    const files = {
      'register.md': doc('# Register', '', '## RFC-0007: Refund limits', '', '**Status:** Accepted', ''),
      'brief.md': doc('# Brief', '', 'See [the limit](register.md#rfc-0007) and [the heading](register.md#rfc-0007-refund-limits).', ''),
    };
    const { corpus } = analysed(files, undefined);
    expect(corpus.edges.filter((edge) => edge.from === 'brief').map((edge) => edge.to)).toEqual(['RFC-0007', 'register']);
    expect(corpus.dangling).toEqual([]);
  });

  it('reaches the first of two rows whose keys differ only in case', () => {
    const files = {
      'review.md': register('| `Refund-Limit` | First. | Refuse them. | proposed |', '| `refund-limit` | Second. | Keep them. | proposed |'),
      'brief.md': doc('# Brief', '', '[limit](review.md#refund-limit)', ''),
    };
    const { corpus } = analysed(files, undefined);
    expect(corpus.edges.find((edge) => edge.from === 'brief')!.to).toBe('Refund-Limit');
  });

  it('reaches the first of two rows that give one key', () => {
    const files = {
      'review.md': register('| `refund-limit` | First. | Refuse them. | proposed |', '| `refund-limit` | Second. | | open |'),
      'brief.md': doc('# Brief', '', '[limit](review.md#refund-limit)', ''),
    };
    const { corpus } = analysed(files, undefined);
    const to = corpus.edges.find((edge) => edge.from === 'brief')!.to;
    expect(corpus.nodes.get(to)?.at.span.start.line).toBe(5);
  });
});

describe('a configured register', () => {
  it('passes rows that have what their status asks for, in any case the status is written', () => {
    const files = {
      'review.md': register(
        '| `refund-limit` | Over the capture. | Refuse them. | Done: [refunds](spec/refunds.md) (commit "Refuse a refund over its capture") |',
        '| `refund-reason` | No reason. | Keep one. | proposed |',
        '| `refund-fee` | Fees. | | open |',
        '| `refund-bank` | Banks. | Ask each. | decided, with the banks |',
        '| `refund-part` | Parts. | Allow them. | done: [refunds](spec/refunds.md) (commit abcdef0) |',
      ),
    };
    expect(findings(files)).toEqual([]);
  });

  it('fails a status no configured word names, and a row with none, at the status cell', () => {
    const files = { 'review.md': register('| `refund-limit` | Over. | Refuse. | shipped |', '| `refund-reason` | No reason. | Keep one. | |') };
    expect(findings(files)).toEqual([
      'unknown-register-status 5: "refund-limit" has the status "shipped", which the configuration does not know',
      'unknown-register-status 6: "refund-reason" has no status',
    ]);
    const [found] = analysed(files).diagnostics;
    expect(found).toMatchObject({ severity: 'error', nodes: ['refund-limit'], hint: 'give it one of open, proposed, decided, done, or add the word to "registers.statuses"' });
  });

  it('fails a row that lacks what its status asks for, naming each thing it lacks', () => {
    const files = {
      'review.md': register(
        '| `refund-reason` | No reason. | | proposed |',
        '| `refund-bank` | Banks. | TBD | decided |',
        '| `refund-limit` | Over. | Refuse. | done |',
        '| `refund-fee` | Fees. | Charge one. | done: [refunds](spec/refunds.md) |',
        '| `refund-part` | Parts. | Allow them. | done (commit "Refuse a refund over its capture") |',
      ),
    };
    expect(findings(files)).toEqual([
      'incomplete-register-row 5: "refund-reason" is proposed and lacks a resolution',
      'incomplete-register-row 6: "refund-bank" is decided and lacks a resolution',
      'incomplete-register-row 7: "refund-limit" is done and lacks a link to what it changed and the commit that changed it',
      'incomplete-register-row 8: "refund-fee" is done and lacks the commit that changed it',
      'incomplete-register-row 9: "refund-part" is done and lacks a link to what it changed',
    ]);
    const found = analysed(files).diagnostics.find((d) => d.message.startsWith('"refund-limit"'));
    expect(found).toMatchObject({ nodes: ['refund-limit'], related: [] });
    expect(found?.hint).toBe('a row that is done has a link to what it changed and the commit that changed it: write what it lacks, or give it the status it has');
  });

  it('counts a citation that does not resolve, and a commit the history lacks, as named: each is its own finding', () => {
    const files = { 'review.md': register('| `refund-limit` | Over. | Refuse. | done: [refunds](spec/gone.md) (commit "Charge a fee") |') };
    expect(findings(files)).toEqual([
      'broken-reference 5: "spec/gone.md" does not resolve to any document',
      'unknown-commit 5: commit "Charge a fee" is not in the history of HEAD',
    ]);
  });

  it('names each of three things a row lacks, and a status that asks for all three', () => {
    const files = { 'review.md': register('| `refund-limit` | Over. | | done |') };
    const all: RegistersConfig = { ...CONFIG, statuses: { done: { closes: true, needs: ['resolution', 'citation', 'commit'] } } };
    expect(findings(files, all)).toEqual([
      'incomplete-register-row 5: "refund-limit" is done and lacks a resolution, a link to what it changed and the commit that changed it',
    ]);
  });

  it('reads a citation in the status cell and not in a column after it', () => {
    const text = doc('# Review', '', '| Key | Status | Notes |', '| --- | --- | --- |', '| `refund-limit` | done (commit abcdef0) | [refunds](spec/refunds.md) |', '');
    expect(findings({ 'review.md': text }, { ...CONFIG, resolution: undefined, statuses: { done: { needs: ['citation'] } } })).toEqual([
      'incomplete-register-row 5: "refund-limit" is done and lacks a link to what it changed',
    ]);
  });

  it('counts a broken citation only where the row writes it in its status cell', () => {
    const review = register('| `refund-limit` | [the problem](spec/gone.md) | Refuse. | done (commit abcdef0) |');
    const other = `${'a'.repeat(review.indexOf('done (commit'))} [r](spec/missing.md)\n`;
    expect(findings({ 'review.md': review, 'other.md': other })).toEqual([
      'broken-reference 1: "spec/missing.md" does not resolve to any document',
      'broken-reference 5: "spec/gone.md" does not resolve to any document',
      'incomplete-register-row 5: "refund-limit" is done and lacks a link to what it changed',
    ]);
  });

  it('reads no cell past the last header', () => {
    const text = doc('# Review', '', '| Key | Status |', '| --- | --- |', '| `refund-limit` | proposed | Refuse them. |', '');
    expect(findings({ 'review.md': text }, { ...CONFIG, statuses: { proposed: { needs: ['resolution'] } } })).toEqual([
      'incomplete-register-row 5: "refund-limit" is proposed and lacks a resolution',
    ]);
  });

  it('reads a citation only in the status cell, and a resolution only under its column', () => {
    const files = {
      'review.md': doc('# Review', '', '| Key | Problem | Status |', '| --- | --- | --- |', '| `refund-limit` | [refunds](spec/refunds.md) | proposed |', '| `refund-fee` | [refunds](spec/refunds.md) | done (commit abcdef0) |', ''),
    };
    expect(findings(files)).toEqual([
      'incomplete-register-row 5: "refund-limit" is proposed and lacks a resolution',
      'incomplete-register-row 6: "refund-fee" is done and lacks a link to what it changed',
    ]);
  });

  it('fails a key given to a second row, at the second, pointing at the first', () => {
    const files = { 'review.md': register('| `refund-limit` | First. | Refuse. | proposed |', '| `refund-limit` | Second. | Keep. | proposed |') };
    expect(findings(files)).toEqual(['duplicate-key 6: "refund-limit" is a key already, given at review.md:5:1']);
    const found = analysed(files).diagnostics.find((d) => d.rule === 'duplicate-key');
    expect(found).toMatchObject({ nodes: ['refund-limit'], target: 'review.md:6', related: [{ note: 'the row that keeps the key' }], hint: 'give the row a key of its own: a citation of this one reaches the first' });
  });

  it('counts no citation another document writes, wherever in its text it stands', () => {
    const review = register('| `refund-limit` | Over. | Refuse. | done (commit "Refuse a refund over its capture") |');
    // A link in another file, written at an offset inside the row's status cell.
    const other = `${'a'.repeat(review.indexOf('done (commit'))} [r](spec/refunds.md)\n`;
    expect(findings({ 'review.md': review, 'other.md': other })).toEqual(['incomplete-register-row 5: "refund-limit" is done and lacks a link to what it changed']);
  });

  it('holds no register the configuration does not name, and no specification a heading declares', () => {
    const files = {
      'other.md': register('| `refund-limit` | Over. | | shipped |', '| `refund-limit` | Again. | | open |'),
      'review.md': doc('# Review', '', '## RFC-0001: Refunds', '', '**Status:** shipped', ''),
    };
    expect(findings(files)).toEqual([]);
  });
});

describe('the rows still open', () => {
  const files = {
    'review.md': register(
      '| `refund-limit` | Over. | Refuse. | done: [refunds](spec/refunds.md) (commit abcdef0) |',
      '| `refund-reason` | No reason. | Keep one. | proposed |',
      '| `refund-fee` | Fees. | | open |',
      '| `refund-bank` | Banks. | | shipped |',
    ),
  };

  it('are counted by status, the configured words first, and listed by key, status and line', () => {
    const { corpus, check } = analysed(files);
    expect(summariseRegisters(corpus, check!)).toEqual([
      {
        file: 'review.md',
        statuses: { open: 1, proposed: 1, decided: 0, done: 1, shipped: 1 },
        open: [
          { key: 'refund-reason', status: 'proposed', line: 6 },
          { key: 'refund-fee', status: 'open', line: 7 },
          { key: 'refund-bank', status: 'shipped', line: 8 },
        ],
      },
    ]);
  });

  it('are printed one line per register, listed under --verbose, and in JSON', async () => {
    const { mkdir, rm, writeFile } = await import('node:fs/promises');
    const root = `tests/fixtures/.tmp/registers-${process.pid}`;
    await rm(root, { recursive: true, force: true });
    try {
      await mkdir(root, { recursive: true });
      await writeFile(`${root}/.spec-graph.json`, JSON.stringify({ patterns: ['*.md'], registers: { ...CONFIG, statuses: { ...CONFIG.statuses, done: { closes: true } } } }));
      // No commit named, so no git is asked: the root lies inside this
      // repository, whose clone in CI is shallow.
      await writeFile(`${root}/review.md`, files['review.md'].replace(' (commit abcdef0)', ''));
      await mkdir(`${root}/spec`, { recursive: true });
      await writeFile(`${root}/spec/refunds.md`, '# Refunds\n');
      const run = async (...argv: string[]): Promise<{ code: number; out: string }> => {
        let out = '';
        const code = await main({ argv, cwd: `${process.cwd()}/${root}`, stdout: (text) => (out += text), stderr: () => {}, env: { NO_COLOR: '1', SPEC_GRAPH_ASCII: '1' }, isTTY: false });
        return { code, out };
      };
      const plain = await run('check');
      expect(plain.code).toBe(EXIT_FAILED);
      expect(plain.out).toContain('\ni review.md  3 open - open 1, proposed 1, decided 0, done 1, shipped 1\n\n');
      expect(plain.out).not.toContain('refund-fee  open');
      const verbose = await run('check', '--verbose');
      expect(verbose.out).toContain('3 open - open 1, proposed 1, decided 0, done 1, shipped 1\n    review.md:6  refund-reason  proposed\n    review.md:7  refund-fee  open\n    review.md:8  refund-bank  shipped\n');
      const json = JSON.parse((await run('check', '--format', 'json')).out);
      expect(json.registers).toEqual([
        { file: 'review.md', statuses: { open: 1, proposed: 1, decided: 0, done: 1, shipped: 1 }, open: expect.arrayContaining([{ key: 'refund-fee', status: 'open', line: 7 }]) },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('are not in the JSON of a run with no register configured', async () => {
    const { mkdir, rm, writeFile } = await import('node:fs/promises');
    const root = `tests/fixtures/.tmp/registers-none-${process.pid}`;
    await rm(root, { recursive: true, force: true });
    try {
      await mkdir(root, { recursive: true });
      await writeFile(`${root}/.spec-graph.json`, JSON.stringify({ patterns: ['*.md'] }));
      await writeFile(`${root}/review.md`, register('| `refund-fee` | Fees. | | open |'));
      let out = '';
      await main({ argv: ['check', '--format', 'json'], cwd: `${process.cwd()}/${root}`, stdout: (text) => (out += text), stderr: () => {}, env: { NO_COLOR: '1' }, isTTY: false });
      expect(Object.keys(JSON.parse(out))).not.toContain('registers');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('are in no report and no JSON where no register is configured', () => {
    const result = { ...analysed(files, undefined), files: [], summary: { documents: 0, items: 0, edges: 0, openObligations: 0, errors: 0, warnings: 0, infos: 0, durationMs: 0 }, problems: [], ok: true };
    expect(formatReport(result)).not.toContain(' open - ');
    expect(Object.keys(JSON.parse(formatJson(result)))).not.toContain('registers');
  });
});

describe('a status word', () => {
  it('is the word a status opens with, in lower case, and empty for none', () => {
    expect(['done: the rules (commit "x")', 'done, as two types', 'Done', 'done;', 'proposed', ' open ', 'decided(with banks)'].map(statusWord)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'proposed',
      'open',
      'decided',
    ]);
    expect(statusWord(null)).toBe('');
    expect(statusWord('')).toBe('');
  });
});

describe('registers in the configuration', () => {
  const problems = (registers: unknown): readonly string[] => parseConfig(JSON.stringify({ registers }), '.spec-graph.json').problems;
  const at = (rest: string): string => `.spec-graph.json: ${rest}`;

  it('reads the files, the resolution column and each status with what it asks for', () => {
    expect(parseConfig(JSON.stringify({ registers: CONFIG }), '.spec-graph.json')).toMatchObject({ problems: [], config: { registers: CONFIG } });
    const bare = { files: ['review.md'], statuses: { open: {}, done: { closes: true } } };
    expect(parseConfig(JSON.stringify({ registers: bare }), 'x').config.registers).toStrictEqual(bare);
    expect(createRegisterCheck(undefined)).toBeUndefined();
    expect(createRegisterCheck(bare)).toMatchObject({ resolution: null, statuses: new Map([['open', { closes: false, needs: [] }], ['done', { closes: true, needs: [] }]]) });
  });

  it('refuses each part that is missing or of the wrong kind, and leaves registers out then', () => {
    const example = '{ "files": ["docs/review.md"], "resolution": "Proposed resolution", "statuses": { "open": {}, "done": { "closes": true, "needs": ["citation", "commit"] } } }';
    expect(problems([])).toEqual([at(`"registers" must be an object such as ${example}`)]);
    expect(problems({})).toEqual([
      at('"registers.files" must be a non-empty array of patterns'),
      at(`"registers.statuses" must be an object of status word to what it asks for, such as ${example}`),
    ]);
    expect(problems({ files: ['  '], statuses: { open: {} }, resolution: ' ' })).toEqual([
      at('"registers.files" must be a non-empty array of patterns'),
      at('"registers.resolution" must be the header of the column a resolution is written in'),
    ]);
    expect(problems({ files: ['review.md'], statuses: {}, resolution: 3 })).toEqual([
      at('"registers.resolution" must be the header of the column a resolution is written in'),
      at(`"registers.statuses" must be an object of status word to what it asks for, such as ${example}`),
    ]);
    expect(problems({ files: ['review.md', 3], statuses: [] })).toEqual([
      at('"registers.files" must be a non-empty array of patterns'),
      at(`"registers.statuses" must be an object of status word to what it asks for, such as ${example}`),
    ]);
    expect(parseConfig(JSON.stringify({ registers: { files: [], statuses: { open: {} } } }), 'x').config.registers).toBeUndefined();
  });

  it('refuses a status word no cell could say, a status that is no object, and what a status cannot ask for', () => {
    expect(
      problems({
        files: ['review.md'],
        statuses: { 'in progress': {}, 'done:': {}, open: true, done: { closes: 'yes', needs: ['tests'], after: 1 }, decided: { needs: 'resolution' } },
      }),
    ).toEqual([
      at('"registers.statuses.in progress" is no status word: a status is the word a status cell opens with'),
      at('"registers.statuses.done:" is no status word: a status is the word a status cell opens with'),
      at('"registers.statuses.open" must be an object, {} for a status that asks for nothing'),
      at('"registers.statuses.done" has an unknown key "after"'),
      at('"registers.statuses.done".closes must be true or false'),
      at('"registers.statuses.done".needs must list some of resolution, citation, commit'),
      at('"registers.statuses.decided".needs must list some of resolution, citation, commit'),
    ]);
    expect(problems({ files: ['review.md'], resolution: 'R', statuses: { done: { needs: ['resolution', 'tests'] } } })).toEqual([
      at('"registers.statuses.done".needs must list some of resolution, citation, commit'),
    ]);
  });

  it('refuses a resolution asked for with no column to read it in, and a key it does not know', () => {
    expect(problems({ files: ['review.md'], statuses: { proposed: { needs: ['resolution'] } } })).toEqual([
      at('a status in "registers.statuses" needs a resolution, and "registers.resolution" names no column to read it in'),
    ]);
    expect(problems({ files: ['review.md'], statuses: { open: {} }, keys: 'Key' })).toEqual([at('unknown key "registers.keys"')]);
  });
});
