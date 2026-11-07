import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXIT_ERROR, EXIT_FAILED, EXIT_OK, main } from '../src/cli.js';
import { parseConfig } from '../src/config.js';
import { extractDocument } from '../src/extract.js';
import { HistoryError, readHistory } from '../src/git.js';
import { historyOf, holdsCommit, type CommitHistory } from '../src/history.js';
import { buildGraph } from '../src/graph.js';
import { runRules } from '../src/rules.js';
import { analyseSources, createClaimReader, createPathMatcher } from '../src/runner.js';
import type { ClaimsConfig, Diagnostic } from '../src/types.js';

/**
 * A done item held to what it cites (ADR-0026), and a commit a checked
 * document names looked for in the history of a ref (ADR-0025).
 */

const doc = (...lines: string[]): string => lines.join('\n');
const CLAIMS: ClaimsConfig = { files: ['spec/*.md'], labels: { Implemented: 'done', Specified: 'open', Withdrawn: 'rejected' } };
const SPEC = doc(
  '# Refunds',
  '',
  '<!-- @spec-item id="refund-limit" -->',
  '- `Implemented`: a refund over the captured amount is refused.',
  '<!-- @spec-item id="refund-reason" -->',
  '- `Specified`: a partial refund carries a reason.',
  '<!-- @spec-item id="refund-retry" -->',
  '- `Specified`: a failed refund is retried.',
  '',
);
const HISTORY: CommitHistory = historyOf('HEAD', ['1a2b3c4d5e6f\u001fRefuse a refund over its capture', 'ffff000011112222\u001fRefund part of a capture', ''].join('\n'));

function findings(files: Record<string, string>, options: { history?: CommitHistory } = { history: HISTORY }): string[] {
  const { diagnostics } = analyseSources(
    Object.entries({ 'spec/refunds.md': SPEC, ...files }).map(([path, text]) => ({ path, text })),
    {
      claimsIn: createClaimReader(CLAIMS),
      isChecklist: createPathMatcher(['ROADMAP.md']),
      isLedger: createPathMatcher(['docs/STATUS.md']),
      history: options.history,
    },
  );
  return diagnostics
    .filter((d: Diagnostic) => ['unevidenced-completion', 'premature-completion', 'unknown-commit'].includes(d.rule))
    .map((d) => `${d.rule} ${d.at.file}:${d.at.span.start.line} ${d.message}`);
}

describe('a checklist', () => {
  it('fails a done item that cites no claim and names no commit, and passes one that does either', () => {
    const roadmap = doc(
      '# Roadmap',
      '',
      '- [x] Refund limits ([the claim](spec/refunds.md#refund-limit)).',
      '- [x] Partial refunds (commit "Refund part of a capture").',
      '- [x] By hash, commit 1A2B3C4.',
      '- [x] Retries.',
      '',
    );
    expect(findings({ 'ROADMAP.md': roadmap })).toEqual(['unevidenced-completion ROADMAP.md:6 "Retries." is done and cites no claim or commit']);
  });

  it('holds only what is done: an open, a rejected or a debt item, and a claim in it, are held to nothing', () => {
    const roadmap = doc('# Roadmap', '', '- [ ] Retries.', '- [-] Refund fees.', '- Accepted debt: refund limits per bank.', '');
    expect(findings({ 'ROADMAP.md': roadmap })).toEqual([]);
  });

  it('fails a done item that cites a claim its label leaves open, naming the claim, and only that', () => {
    const roadmap = doc(
      '# Roadmap',
      '',
      '- [x] Reasons ([reason](spec/refunds.md#refund-reason)).',
      '- [x] Both ([reason](spec/refunds.md#refund-reason), [retry](spec/refunds.md#refund-retry), [limit](spec/refunds.md#refund-limit)).',
      '- [x] Limits ([limit](spec/refunds.md#refund-limit)).',
      '',
    );
    expect(findings({ 'ROADMAP.md': roadmap })).toEqual([
      'premature-completion ROADMAP.md:3 "Reasons (reason)." is done, and the claim it cites is `Specified`, which leaves work open',
      'premature-completion ROADMAP.md:4 "Both (reason, retry, limit)." is done, and 2 claims it cites leave work open',
    ]);
  });

  it('points a premature item at each open claim it cites', () => {
    const { diagnostics } = analyseSources(
      [
        { path: 'spec/refunds.md', text: SPEC },
        { path: 'ROADMAP.md', text: doc('# Roadmap', '', '- [x] Reasons ([reason](spec/refunds.md#refund-reason)).', '') },
      ],
      { claimsIn: createClaimReader(CLAIMS), isChecklist: createPathMatcher(['ROADMAP.md']) },
    );
    const [found] = diagnostics.filter((d) => d.rule === 'premature-completion');
    expect(found).toMatchObject({
      severity: 'error',
      nodes: ['ROADMAP#roadmap.1', 'refunds#refund-reason'],
      related: [{ note: 'refunds#refund-reason is Specified', at: { file: 'spec/refunds.md', span: { start: { line: 6 } } } }],
      hint: "raise the claim's label once its evidence holds, or reopen the item until it does",
    });
  });

  it('counts a claim closed without being done as open, and a document that is no claim as no evidence', () => {
    const spec = doc('# Fees', '', '<!-- @spec-item id="fee" -->', '- `Withdrawn`: a refund fee.', '');
    const roadmap = doc('# Roadmap', '', '- [x] Fees ([fee](spec/fees.md#fee)).', '- [x] Docs ([the spec](spec/refunds.md)).', '');
    expect(findings({ 'spec/fees.md': spec, 'ROADMAP.md': roadmap })).toEqual([
      'premature-completion ROADMAP.md:3 "Fees (fee)." is done, and the claim it cites is `Withdrawn`, which leaves work open',
      'unevidenced-completion ROADMAP.md:4 "Docs (the spec)." is done and cites no claim or commit',
    ]);
  });

  it('fails a done item whose only citation is an item that is no claim, and says how to cite one', () => {
    const roadmap = doc('# Roadmap', '', '## Open Questions', '', '<!-- @spec-item id="retry-policy" -->', '- Which retry policy?', '', '## Done', '', '- [x] Retries ([policy](#retry-policy)).', '');
    const { diagnostics } = analyseSources([{ path: 'ROADMAP.md', text: roadmap }], { isChecklist: createPathMatcher(['ROADMAP.md']), history: HISTORY });
    expect(diagnostics.filter((d) => d.rule === 'unevidenced-completion')).toMatchObject([
      {
        nodes: ['ROADMAP#done.1'],
        related: [],
        hint: 'cite the claim that shows it, as [name](spec/file.md#claim-id), or name the commit that did it, as commit "Subject"',
      },
    ]);
  });

  it('leaves a claim in a checklist to its own evidence', () => {
    const { diagnostics } = analyseSources([{ path: 'ROADMAP.md', text: doc('# Roadmap', '', '- [x] `Implemented`: a claim, ticked.', '') }], {
      claimsIn: createClaimReader({ files: ['ROADMAP.md'], labels: { Implemented: 'done' } }),
      isChecklist: createPathMatcher(['ROADMAP.md']),
    });
    expect(diagnostics.map((d) => d.rule)).toEqual([]);
  });

  it('leaves a document that is no checklist alone', () => {
    expect(findings({ 'docs/plan.md': doc('# Plan', '', '- [x] Retries.', '- [x] Reasons ([r](../spec/refunds.md#refund-reason)).', '') })).toEqual([]);
  });
});

describe('a ledger', () => {
  const STATUS = doc(
    '# Status',
    '',
    '## Features',
    '',
    '| Feature | Status | Claims |',
    '| --- | --- | --- |',
    '| Refund limits | Implemented | [limit](../spec/refunds.md#refund-limit) |',
    '| Reasons | done: shipped | [reason](../spec/refunds.md#refund-reason) |',
    '| Retries | planned | [retry](../spec/refunds.md#refund-retry) |',
    '| Fees | in progress | |',
    '| Exports | done | |',
    '',
  );

  it('reads each row whose status says a state as an item, its links its own', () => {
    const extracted = extractDocument({ path: 'docs/STATUS.md', text: STATUS, ledger: true });
    expect(extracted?.items.map((item) => [item.id, item.title, item.disposition, item.evidence.raw])).toEqual([
      ['STATUS#features-row.1', 'Refund limits', 'satisfied', 'Implemented'],
      ['STATUS#features-row.2', 'Reasons', 'satisfied', 'done'],
      ['STATUS#features-row.3', 'Fees', 'narrowed', 'in progress'],
      ['STATUS#features-row.4', 'Exports', 'satisfied', 'done'],
    ]);
    expect(extractDocument({ path: 'docs/STATUS.md', text: STATUS })?.items).toEqual([]);
  });

  it('fails a done row that cites an open claim, and holds no row to evidence', () => {
    expect(findings({ 'docs/STATUS.md': STATUS })).toEqual([
      'premature-completion docs/STATUS.md:8 "Reasons" is done, and the claim it cites is `Specified`, which leaves work open',
    ]);
  });

  it('reads no register and no table without a status column as a ledger', () => {
    const text = doc('# S', '', '| ID | Status |', '| --- | --- |', '| RFC-0001 | done |', '', '| Feature | Owner |', '| --- | --- |', '| Refunds | done |', '');
    // Every specification the file holds, its register's rows among them.
    const { corpus } = analyseSources([{ path: 'docs/STATUS.md', text }], { isLedger: createPathMatcher(['docs/STATUS.md']) });
    expect(corpus.documents.map((document) => document.id)).toEqual(['STATUS', 'RFC-0001']);
    expect(corpus.items).toEqual([]);
  });

  it('names a row by the section it is in, or the document above every heading, and says it was not declared', () => {
    const text = doc('| Feature | Status |', '| --- | --- |', '| Refunds | done (in 0.3) |', '', '# Status', '');
    const [row] = extractDocument({ path: 'docs/STATUS.md', text, ledger: true })!.items;
    expect(row).toMatchObject({
      id: 'STATUS#item-row.1',
      kind: 'item',
      declared: false,
      disposition: 'satisfied',
      body: '| Refunds | done (in 0.3) |',
      evidence: { source: 'marker', raw: 'done', at: { span: { start: { line: 3, column: 13 } } } },
    });
  });

  it('is read only where the configuration says a document is one', () => {
    const table = doc('# Plan', '', '| Feature | Status |', '| --- | --- |', '| Refunds | done |', '');
    const { corpus } = analyseSources([{ path: 'docs/plan.md', text: table }], { isLedger: createPathMatcher(['docs/STATUS.md']) });
    expect(corpus.items).toEqual([]);
  });

  it('holds a done list item in a ledger as a checklist holds one, but not to evidence', () => {
    const text = doc('# Status', '', '- [x] Reasons ([r](../spec/refunds.md#refund-reason)).', '- [x] Exports.', '');
    expect(findings({ 'docs/STATUS.md': text })).toEqual([
      'premature-completion docs/STATUS.md:3 "Reasons (r)." is done, and the claim it cites is `Specified`, which leaves work open',
    ]);
  });
});

describe('a commit a checked document names', () => {
  it('is found by its subject as written, or by the start of its hash, and fails where it is not', () => {
    const roadmap = doc(
      '# Roadmap',
      '',
      '- [x] Limits (commit "Refuse a refund over its capture").',
      '- [x] Fees (commit "Refuse a refund over its Capture").',
      '- [x] Parts (commit ffff0000).',
      '- [x] Retries (commit 1a2b3c5).',
      '',
    );
    expect(findings({ 'ROADMAP.md': roadmap })).toEqual([
      'unknown-commit ROADMAP.md:4 commit "Refuse a refund over its Capture" is not in the history of HEAD',
      'unknown-commit ROADMAP.md:6 commit 1a2b3c5 is not in the history of HEAD',
    ]);
  });

  it('names the commit as its finding\'s target, and says what to do', () => {
    const { diagnostics } = analyseSources([{ path: 'ROADMAP.md', text: doc('# R', '', '- [x] Retries (commit 9999999).', '') }], {
      isChecklist: createPathMatcher(['ROADMAP.md']),
      history: historyOf('origin/main', ''),
    });
    expect(diagnostics.find((d) => d.rule === 'unknown-commit')).toMatchObject({
      severity: 'error',
      target: 'hash:9999999',
      nodes: ['ROADMAP#r.1'],
      message: 'commit 9999999 is not in the history of origin/main',
      hint: 'name a commit origin/main reaches, by its subject as written or by the start of its hash',
    });
  });

  it('is looked for only in a checklist or a ledger, and nowhere else is a history needed', () => {
    const notes = { 'docs/notes.md': doc('# Notes', '', 'Fixed in commit 9999999.', '') };
    expect(findings(notes, {})).toEqual([]);
    expect(findings(notes)).toEqual([]);
  });

  it('is looked for in a checklist alone, where no ledger is configured', () => {
    const sources = [
      { path: 'ROADMAP.md', text: doc('# R', '', '- [x] Retries (commit 9999999).', '') },
      { path: 'docs/notes.md', text: doc('# Notes', '', 'Fixed in commit 8888888.', '') },
    ];
    const { diagnostics } = analyseSources(sources, { isChecklist: createPathMatcher(['ROADMAP.md']), history: HISTORY });
    expect(diagnostics.map((d) => `${d.rule} ${d.at.file}`)).toEqual(['unknown-commit ROADMAP.md']);
    // And no history is needed where only an unchecked document names one.
    expect(analyseSources([sources[1]!], { isChecklist: createPathMatcher(['ROADMAP.md']) }).diagnostics).toEqual([]);
  });

  it('is looked for in a ledger, with or without a checklist configured', () => {
    const status = doc('# Status', '', '- [x] Exports (commit 9999999).', '');
    expect(findings({ 'docs/STATUS.md': status })).toEqual(['unknown-commit docs/STATUS.md:3 commit 9999999 is not in the history of HEAD']);
    const alone = analyseSources([{ path: 'docs/STATUS.md', text: status }], { isLedger: createPathMatcher(['docs/STATUS.md']), history: HISTORY });
    expect(alone.diagnostics.map((d) => d.rule)).toEqual(['unknown-commit']);
    expect(() => analyseSources([{ path: 'docs/STATUS.md', text: status }], { isLedger: createPathMatcher(['docs/STATUS.md']) })).toThrow('no history was given');
  });

  it('is looked for by no rule given no history, as runRules is called on its own', () => {
    const { corpus } = analyseSources([{ path: 'ROADMAP.md', text: doc('# R', '', '- [x] Retries (commit 9999999).', '') }], {
      isChecklist: createPathMatcher(['ROADMAP.md']),
      history: HISTORY,
    });
    const graph = buildGraph({ nodes: corpus.nodes, edges: corpus.edges });
    expect(runRules(graph, corpus, { isChecklist: createPathMatcher(['ROADMAP.md']) }).map((d) => d.rule)).toEqual([]);
  });

  it('refuses to run unlooked-for, where a checked document names one and no history was given', () => {
    expect(() => findings({ 'ROADMAP.md': doc('# R', '', '- [x] Limits (commit 1a2b3c4).', '') }, {})).toThrow(
      'a checklist, a ledger or a register names a commit, and no history was given to look for it in: pass "history"',
    );
  });
});

describe('the history of a ref', () => {
  it('reads each line of a log as an id and a subject, in lower case and sorted', () => {
    const history = historyOf('main', 'BBB2222\u001fSecond\r\nAAA1111\u001fFirst: with a colon\u001f and a separator\nnot a commit line\n');
    expect(history).toEqual({ ref: 'main', hashes: ['aaa1111', 'bbb2222'], subjects: new Set(['Second', 'First: with a colon\u001f and a separator']) });
  });

  it('holds a hash that starts an id, before, between or after the others, and none that starts no id', () => {
    const history = historyOf('main', ['0000aaa', '5555bbb', '5555ccc', 'ffffddd'].map((id) => `${id}\u001fs`).join('\n'));
    for (const hash of ['0000', '5555b', '5555c', '5555', 'ffffddd']) expect(holdsCommit(history, { kind: 'hash', value: hash }), hash).toBe(true);
    for (const hash of ['00001', '5555d', 'fffff', '1234', 'ffffdddd']) expect(holdsCommit(history, { kind: 'hash', value: hash }), hash).toBe(false);
    expect(holdsCommit(historyOf('main', ''), { kind: 'hash', value: '0000' })).toBe(false);
    expect(holdsCommit(history, { kind: 'subject', value: 's' })).toBe(true);
    expect(holdsCommit(history, { kind: 'subject', value: 'S' })).toBe(false);
  });

  it('is asked of no file where no pattern names one', () => {
    expect(createPathMatcher([])).toBeUndefined();
    expect(createPathMatcher(undefined)).toBeUndefined();
    expect(createPathMatcher(['ROADMAP.md'])!('ROADMAP.md')).toBe(true);
  });
});

describe('the configuration', () => {
  const problems = (fields: Record<string, unknown>): readonly string[] => parseConfig(JSON.stringify(fields), '.spec-graph.json').problems;

  it('reads checklists, ledgers and a ref', () => {
    const loaded = parseConfig(JSON.stringify({ checklists: ['ROADMAP.md'], ledgers: ['docs/STATUS.md'], gitRef: 'origin/main' }), '.spec-graph.json');
    expect(loaded).toMatchObject({ problems: [], config: { checklists: ['ROADMAP.md'], ledgers: ['docs/STATUS.md'], gitRef: 'origin/main' } });
  });

  it('refuses a list that is not one of strings, and a ref that is empty, spaced, not a string or opens with a dash', () => {
    expect(problems({ checklists: 'ROADMAP.md', ledgers: [1] })).toEqual([
      '.spec-graph.json: "checklists" must be an array of strings',
      '.spec-graph.json: "ledgers" must be an array of strings',
    ]);
    const ref = '.spec-graph.json: "gitRef" must be a branch, a tag or a commit, such as "origin/main"';
    for (const gitRef of ['', ' main', 'main ', 3, '--output=x']) expect(problems({ gitRef }), String(gitRef)).toEqual([ref]);
    expect(parseConfig(JSON.stringify({ gitRef: '-x' }), 'x').config.gitRef).toBeUndefined();
  });
});

describe('git, at the edge', () => {
  const root = `${process.cwd()}/tests/fixtures/.tmp/git-${process.pid}`;
  const git = (cwd: string, ...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });

  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    git(root, 'init', '-q');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'Refuse a refund over its capture');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'Refund part of a capture', '-m', 'A body, which is no subject.');
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads every commit a ref reaches, with its subject', async () => {
    const history = await readHistory(root, 'HEAD');
    expect(history.ref).toBe('HEAD');
    expect([...history.subjects].sort()).toEqual(['Refund part of a capture', 'Refuse a refund over its capture']);
    const head = git(root, 'rev-parse', 'HEAD').trim();
    expect(history.hashes).toHaveLength(2);
    expect(holdsCommit(history, { kind: 'hash', value: head.slice(0, 7) })).toBe(true);
    expect([...(await readHistory(root, 'HEAD~1')).subjects]).toEqual(['Refuse a refund over its capture']);
  });

  it('refuses a ref the repository lacks, one that would read as an option, and a directory in no repository', async () => {
    await expect(readHistory(root, 'no-such-branch')).rejects.toThrow(new HistoryError('"no-such-branch" names no commit the repository has: give "gitRef" a branch, a tag or a commit it holds'));
    const outside = `${tmpdir()}/spec-graph-nogit-${process.pid}`;
    await mkdir(outside, { recursive: true });
    try {
      await expect(readHistory(outside, 'HEAD')).rejects.toThrow(`${outside} is in no git repository, and the documents name commits only its history holds`);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('refuses a shallow clone, saying how to fetch the whole history', async () => {
    const shallow = `${root}-shallow`;
    await rm(shallow, { recursive: true, force: true });
    try {
      git(process.cwd(), 'clone', '-q', '--depth', '1', `file://${root}`, shallow);
      await expect(readHistory(shallow, 'HEAD')).rejects.toThrow(/^the repository is a shallow clone, which holds only its newest commits, .*fetch-depth: 0$/);
    } finally {
      await rm(shallow, { recursive: true, force: true });
    }
  });

  it('names its refusals as a history that cannot be read', async () => {
    await expect(readHistory(root, 'no-such-branch')).rejects.toMatchObject({ name: 'HistoryError' });
  });

  it('reads a log past a megabyte, as a history of tens of thousands of commits writes', async () => {
    const big = `${root}-big`;
    await rm(big, { recursive: true, force: true });
    await mkdir(big, { recursive: true });
    try {
      git(big, 'init', '-q');
      // fast-import writes twenty thousand commits in one process, where a
      // commit at a time would take minutes.
      const subject = 'x'.repeat(80);
      const stream = Array.from({ length: 20_000 }, (_, at) => {
        const message = `${subject} ${at}\n`;
        return `commit refs/heads/main\ncommitter Test <test@example.invalid> ${1_700_000_000 + at} +0000\ndata ${Buffer.byteLength(message)}\n${message}`;
      }).join('');
      execFileSync('git', ['fast-import', '--quiet'], { cwd: big, input: stream });
      const history = await readHistory(big, 'refs/heads/main');
      expect(history.hashes).toHaveLength(20_000);
      expect(history.subjects.has(`${subject} 19999`)).toBe(true);
    } finally {
      await rm(big, { recursive: true, force: true });
    }
  }, 60_000);

  it('refuses to run where git is not on PATH', async () => {
    const path = process.env['PATH'];
    process.env['PATH'] = '';
    try {
      await expect(readHistory(root, 'HEAD')).rejects.toThrow('git is not on PATH, and the documents name commits only git can look for: install git, or run where it is');
    } finally {
      process.env['PATH'] = path;
    }
  });

  it('is read by a check whose checklist names a commit, and its findings fail the run', async () => {
    await writeFile(`${root}/.spec-graph.json`, JSON.stringify({ patterns: ['*.md'], checklists: ['ROADMAP.md'] }));
    await writeFile(`${root}/ROADMAP.md`, doc('# Roadmap', '', '- [x] Limits (commit "Refuse a refund over its capture").', '- [x] Fees (commit "Charge a refund fee").', ''));
    let out = '';
    const code = await main({ argv: ['check', '--format', 'json'], cwd: root, stdout: (text) => (out += text), stderr: () => {}, env: { NO_COLOR: '1' }, isTTY: false });
    expect(code).toBe(EXIT_FAILED);
    expect(JSON.parse(out).diagnostics.map((d: Diagnostic) => [d.rule, d.message])).toEqual([['unknown-commit', 'commit "Charge a refund fee" is not in the history of HEAD']]);

    await writeFile(`${root}/.spec-graph.json`, JSON.stringify({ patterns: ['*.md'], checklists: ['ROADMAP.md'], gitRef: 'no-such-branch' }));
    let err = '';
    expect(await main({ argv: ['check'], cwd: root, stdout: () => {}, stderr: (text) => (err += text), env: { NO_COLOR: '1' }, isTTY: false })).toBe(EXIT_ERROR);
    expect(err).toContain('"no-such-branch" names no commit the repository has');

    await writeFile(`${root}/ROADMAP.md`, doc('# Roadmap', '', '- [ ] Fees.', ''));
    expect(await main({ argv: ['check'], cwd: root, stdout: () => {}, stderr: () => {}, env: { NO_COLOR: '1' }, isTTY: false })).toBe(EXIT_OK);
  });
});
