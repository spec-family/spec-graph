import { describe, expect, it } from 'vitest';

import { EXIT_ERROR, EXIT_OK, main } from '../src/cli.js';
import { parseConfig } from '../src/config.js';
import { extractDocument } from '../src/extract.js';
import { formatGraph } from '../src/report.js';
import { analyseSources, createClaimReader } from '../src/runner.js';
import { query } from '../src/select.js';
import type { ClaimsConfig, ItemNode } from '../src/types.js';

/**
 * A claim is an item whose state is its label (ADR-0024): which documents
 * hold claims, and what each label means for work, are the configuration's,
 * and which item is a claim is spec-core's reading, the one spec-guard holds
 * a claim to its evidence by.
 */

const CLAIMS: ClaimsConfig = {
  files: ['spec/*.md'],
  labels: { Implemented: 'done', Specified: 'open', Target: 'open', Hypothesis: 'todo' },
};
const doc = (...lines: string[]): string => lines.join('\n');

/** `null` for a run with no claims configured. */
function analysed(files: Record<string, string>, claims: ClaimsConfig | null = CLAIMS) {
  return analyseSources(
    Object.entries(files).map(([path, text]) => ({ path, text })),
    { claimsIn: createClaimReader(claims ?? undefined) },
  );
}

/** Each item as [id, label, disposition, the signal that decided it]. */
const itemsOf = (files: Record<string, string>, claims: ClaimsConfig | null = CLAIMS): [string, string | null, string, string][] =>
  analysed(files, claims).corpus.items.map((item) => [item.id, item.label, item.disposition, item.evidence.source]);

const REFUNDS = doc(
  '# Refunds',
  '',
  '## Limits',
  '',
  '- `Implemented`: a refund over the captured amount is refused.',
  '- `Specified`: a partial refund carries a reason.',
  '- A bullet that is no claim.',
  '- `Hypothesis` retries cut failed captures.',
  '',
);

describe('a claim in a document claims.files names', () => {
  it('is an item whose state is what its label means, decided by the label', () => {
    expect(itemsOf({ 'spec/refunds.md': REFUNDS })).toEqual([
      ['refunds#limits.1', 'Implemented', 'satisfied', 'label'],
      ['refunds#limits.2', 'Specified', 'unresolved', 'label'],
      ['refunds#limits.3', 'Hypothesis', 'unresolved', 'label'],
    ]);
  });

  it('is no claim in a document the patterns do not name, or with no claims configured', () => {
    expect(itemsOf({ 'docs/refunds.md': REFUNDS })).toEqual([]);
    expect(itemsOf({ 'spec/refunds.md': REFUNDS }, null)).toEqual([]);
  });

  it('points at its label, and says the state came from it', () => {
    const [claim] = analysed({ 'spec/refunds.md': REFUNDS }).corpus.items;
    expect(claim?.evidence).toMatchObject({ source: 'label', raw: 'Implemented', at: { file: 'spec/refunds.md', span: { start: { line: 5, column: 3 }, end: { line: 5, column: 16 } } } });
  });

  it('opens after a checkbox, a number or a quote, and nested items are claims of their own', () => {
    const text = doc('# A', '', '1. `Implemented`: the outer claim.', '   - [ ] `Target`: the inner claim.', '> - `Specified`: in a quote.', '');
    expect(itemsOf({ 'spec/a.md': text }).map(([, label, disposition]) => [label, disposition])).toEqual([
      ['Implemented', 'satisfied'],
      ['Target', 'unresolved'],
      ['Specified', 'unresolved'],
    ]);
  });

  it('is named by @spec-item, and a link to that name reaches it', () => {
    const files = {
      'spec/refunds.md': doc('# Refunds', '', '<!-- @spec-item id="refund-limit" -->', '- `Implemented`: a refund over the capture is refused.', ''),
      'docs/roadmap.md': doc('# Roadmap', '', '- [x] Refund limits ([the claim](../spec/refunds.md#refund-limit)).', ''),
    };
    const { corpus } = analysed(files);
    expect(corpus.items.map((item) => [item.id, item.declared, item.label])).toEqual([
      ['refunds#refund-limit', true, 'Implemented'],
      ['roadmap#roadmap.1', false, null],
    ]);
    expect(corpus.edges.filter((edge) => edge.to === 'refunds#refund-limit').map((edge) => [edge.kind, edge.from])).toEqual([
      ['contains', 'refunds'],
      ['references', 'roadmap#roadmap.1'],
    ]);
    expect(corpus.dangling).toEqual([]);
  });

  it('yields to a directive, and outranks a marker and a checkbox, each said as a conflict', () => {
    const text = doc(
      '# A',
      '',
      '<!-- @spec-item state="open" -->',
      '- `Implemented`: reopened by a directive.',
      '- `Specified`: a reason on refunds. Done: a marker below the label.',
      '- [x] `Specified`: ticked, and still open.',
      '',
    );
    const items = analysed({ 'spec/a.md': text }).corpus.items;
    expect(items.map((item) => [item.disposition, item.evidence.source, item.conflicts.map((c) => c.source)])).toEqual([
      ['unresolved', 'directive', ['label']],
      ['unresolved', 'label', ['marker']],
      ['unresolved', 'label', ['checkbox']],
    ]);
  });

  it('under a heading that holds obligations is decided by its label, not the heading', () => {
    expect(itemsOf({ 'spec/a.md': doc('# A', '', '## Open Questions', '', '- `Implemented`: settled.', '') })).toEqual([
      ['a#open-questions.1', 'Implemented', 'satisfied', 'label'],
    ]);
  });

  it('reads a label exactly, in its case, and only as the code span the item opens with', () => {
    const text = doc('# A', '', '- `implemented`: another case.', '- The rule is `Implemented`.', '- **Implemented**: emphasis.', '- `` Implemented ``: two backticks.', '');
    expect(itemsOf({ 'spec/a.md': text })).toEqual([['a#a.1', 'Implemented', 'satisfied', 'label']]);
  });

  it('in a register is the item of the specification whose region holds it', () => {
    const text = doc('# Register', '', '## RFC-0001: Refunds', '', '**Status:** Accepted', '', '- `Specified`: a reason on every refund.', '');
    expect(itemsOf({ 'spec/register.md': text }).map(([id]) => id)).toEqual(['RFC-0001#rfc-0001-refunds.1']);
  });

  it('answers to [label] in a selector, and an item that is no claim does not', () => {
    const files = { 'spec/refunds.md': REFUNDS, 'docs/q.md': doc('# Q', '', '## Open Questions', '', '- Which bank?', '') };
    const { graph } = analysed(files);
    const ids = (selector: string): string[] => query(graph, selector).map((match) => match.nodes[0]!.id).sort();
    expect(ids('item[label=Specified]')).toEqual(['refunds#limits.2']);
    expect(ids('item[label]')).toEqual(['refunds#limits.1', 'refunds#limits.2', 'refunds#limits.3']);
    expect(ids('item[openness=open][label!=Hypothesis]')).toEqual(['q#open-questions.1', 'refunds#limits.2']);
  });
});

describe('extraction, given the labels of one file', () => {
  it('reads a claim with what its label means, and leaves every other item as it was', () => {
    const extracted = extractDocument({ path: 'spec/a.md', text: REFUNDS, claims: new Map([['Implemented', 'satisfied']]) });
    expect(extracted?.items.map((item: ItemNode) => [item.text, item.label, item.disposition])).toEqual([
      ['`Implemented`: a refund over the captured amount is refused.', 'Implemented', 'satisfied'],
    ]);
    expect(extractDocument({ path: 'spec/a.md', text: REFUNDS })?.items).toEqual([]);
  });
});

describe('the reader of which documents hold claims', () => {
  it('gives the labels of a file the patterns name, and nothing for one they do not', () => {
    const reader = createClaimReader(CLAIMS)!;
    expect([...(reader('spec/a.md') ?? [])]).toEqual([
      ['Implemented', 'satisfied'],
      ['Specified', 'unresolved'],
      ['Target', 'unresolved'],
      ['Hypothesis', 'unresolved'],
    ]);
    expect(reader('docs/a.md')).toBeUndefined();
    expect(createClaimReader(undefined)).toBeUndefined();
  });

  it('refuses a label given a word that names no state, in any case the words take', () => {
    expect(() => createClaimReader({ files: ['spec/*.md'], labels: { Implemented: 'finished' } })).toThrow(
      /^claims: "Implemented" is given "finished", which names no state: give one of open, unresolved, todo, /,
    );
    expect([...(createClaimReader({ files: ['spec/*.md'], labels: { Implemented: 'DONE' } })!('spec/a.md') ?? [])]).toEqual([['Implemented', 'satisfied']]);
  });
});

describe('claims in the configuration', () => {
  const problems = (claims: unknown): readonly string[] => parseConfig(JSON.stringify({ claims }), '.spec-graph.json').problems;

  it('reads the files and each label with the state it means', () => {
    const loaded = parseConfig(JSON.stringify({ claims: CLAIMS }), '.spec-graph.json');
    expect(loaded).toMatchObject({ problems: [], config: { claims: CLAIMS } });
  });

  it('refuses a part that is missing, empty or of the wrong kind, and leaves claims out then', () => {
    const shape = '.spec-graph.json: "claims" must be an object such as { "files": ["spec/*.md"], "labels": { "Implemented": "done", "Specified": "open" } }';
    expect(problems(['spec/*.md'])).toEqual([shape]);
    expect(problems(null)).toEqual([shape]);
    const files = '.spec-graph.json: "claims.files" must be a non-empty array of patterns';
    const labels = '.spec-graph.json: "claims.labels" must be an object of label to state, such as { "Implemented": "done", "Specified": "open" }';
    expect(problems({})).toEqual([files, labels]);
    expect(problems({ files: [], labels: {} })).toEqual([files, labels]);
    expect(problems({ files: 'spec/*.md', labels: ['done'] })).toEqual([files, labels]);
    expect(problems({ files: ['spec/*.md', 3], labels: { Implemented: 'done' } })).toEqual([files]);
    expect(problems({ files: ['  '], labels: { Implemented: 'done' } })).toEqual([files]);
    expect(parseConfig(JSON.stringify({ claims: { files: [], labels: { Implemented: 'done' } } }), 'x').config.claims).toBeUndefined();
  });

  it('refuses a label with space around it or none at all, a word that names no state, and a key it does not know', () => {
    expect(problems({ files: ['spec/*.md'], labels: { ' Implemented': 'done', '': 'open' } })).toEqual([
      '.spec-graph.json: "claims.labels" has " Implemented", and a label is the word a claim\'s code span holds, with no space around it',
      '.spec-graph.json: "claims.labels" has "", and a label is the word a claim\'s code span holds, with no space around it',
    ]);
    const state = (label: string): string =>
      `.spec-graph.json: "claims.labels.${label}" must be a state, one of open, unresolved, todo, narrowed, partial, delegated, satisfied, resolved, done, closed, accepted-debt, debt, wontfix, rejected, declined, obviated, moot`;
    expect(problems({ files: ['spec/*.md'], labels: { Implemented: 'finished', Specified: true } })).toEqual([state('Implemented'), state('Specified')]);
    expect(problems({ files: ['spec/*.md'], labels: { Implemented: 'done' }, testPrefixes: ['fn test_'] })).toEqual([
      '.spec-graph.json: unknown key "claims.testPrefixes"',
    ]);
  });
});

describe('claims through the command line', () => {
  async function withRepo(files: Record<string, string>, body: (root: string) => Promise<void>): Promise<void> {
    const { mkdir, rm, writeFile } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    const root = `tests/fixtures/.tmp/claims-${process.pid}`;
    await rm(root, { recursive: true, force: true });
    try {
      for (const [path, text] of Object.entries(files)) {
        await mkdir(dirname(`${root}/${path}`), { recursive: true });
        await writeFile(`${root}/${path}`, text);
      }
      await body(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  async function run(cwd: string, ...argv: string[]): Promise<{ code: number; out: string; err: string }> {
    let out = '';
    let err = '';
    const code = await main({
      argv,
      cwd,
      stdout: (text) => {
        out += text;
      },
      stderr: (text) => {
        err += text;
      },
      env: { NO_COLOR: '1', SPEC_GRAPH_ASCII: '1' },
      isTTY: false,
    });
    return { code, out, err };
  }

  it('reads claims where the configuration names them, and a query gives each claim its label and no other item one', async () => {
    const files = {
      '.spec-graph.json': JSON.stringify({ patterns: ['spec/*.md', 'docs/*.md'], claims: CLAIMS }),
      'spec/refunds.md': REFUNDS,
      'docs/q.md': doc('# Q', '', '## Open Questions', '', '- Which bank?', ''),
    };
    await withRepo(files, async (root) => {
      const { code, out } = await run(`${process.cwd()}/${root}`, 'query', 'item', '--format', 'json');
      expect(code).toBe(EXIT_OK);
      const nodes = JSON.parse(out).matches.map((match: { nodes: Record<string, string>[] }) => match.nodes[0]!);
      expect(nodes.map((node: Record<string, string>) => [node['id'], node['state'], node['label'] ?? 'none']).sort()).toEqual([
        ['q#open-questions.1', 'unresolved', 'none'],
        ['refunds#limits.1', 'satisfied', 'Implemented'],
        ['refunds#limits.2', 'unresolved', 'Specified'],
        ['refunds#limits.3', 'unresolved', 'Hypothesis'],
      ]);
      expect(Object.keys(nodes.find((node: Record<string, string>) => node['id'] === 'q#open-questions.1'))).not.toContain('label');
    });
  });

  it('stops with exit 2 on a configuration whose claims cannot be read', async () => {
    await withRepo({ '.spec-graph.json': JSON.stringify({ patterns: ['spec/*.md'], claims: { files: ['spec/*.md'] } }), 'spec/refunds.md': REFUNDS }, async (root) => {
      const { code, err } = await run(`${process.cwd()}/${root}`, 'check');
      expect(code).toBe(EXIT_ERROR);
      expect(err).toContain('"claims.labels" must be an object of label to state');
    });
  });
});

describe('claims that match no document the run reads', () => {
  it('stop the run with exit 2, saying where to add them', async () => {
    const { mkdir, rm, writeFile } = await import('node:fs/promises');
    const root = `tests/fixtures/.tmp/claims-unread-${process.pid}`;
    await rm(root, { recursive: true, force: true });
    try {
      await mkdir(`${root}/spec`, { recursive: true });
      await mkdir(`${root}/docs`, { recursive: true });
      await writeFile(`${root}/.spec-graph.json`, JSON.stringify({ patterns: ['docs/*.md'], claims: CLAIMS }));
      await writeFile(`${root}/docs/a.md`, '# A\n');
      await writeFile(`${root}/spec/refunds.md`, REFUNDS);
      let err = '';
      const code = await main({ argv: ['check'], cwd: `${process.cwd()}/${root}`, stdout: () => {}, stderr: (text) => (err += text), env: { NO_COLOR: '1' }, isTTY: false });
      expect(code).toBe(EXIT_ERROR);
      expect(err).toMatch(/^spec-graph: "claims\.files" in .*\.spec-graph\.json matched no file the run read: "spec\/\*\.md"\n {2}add the documents to "patterns", or correct "claims\.files"\n$/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('the graph export', () => {
  it('gives a claim its label, and an item that is no claim none', () => {
    const files = { 'spec/refunds.md': REFUNDS, 'docs/q.md': doc('# Q', '', '## Open Questions', '', '- Which bank?', '') };
    const exported = JSON.parse(formatGraph(analysed(files).graph, 'json'));
    const items = exported.nodes.filter((node: { kind: string }) => node.kind === 'item');
    expect(items.map((node: { id: string; label?: string }) => [node.id, node.label ?? 'none']).sort()).toEqual([
      ['q#open-questions.1', 'none'],
      ['refunds#limits.1', 'Implemented'],
      ['refunds#limits.2', 'Specified'],
      ['refunds#limits.3', 'Hypothesis'],
    ]);
  });
});
