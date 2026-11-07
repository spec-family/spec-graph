import { describe, expect, it } from 'vitest';

import { EXIT_FAILED, main } from '../src/cli.js';
import { parseConfig } from '../src/config.js';
import { extractDocument } from '../src/extract.js';
import { analyseSources, createClaimReader, createProtocolCheck } from '../src/runner.js';
import type { ProtocolsConfig } from '../src/types.js';

/**
 * Measurement protocols held to what the configuration asks of them, and the
 * claims and marked figures that rest on one (ADR-0028).
 */

const doc = (...lines: string[]): string => lines.join('\n');
const CONFIG: ProtocolsConfig = {
  files: ['ROADMAP.md'],
  heading: 'Measurement protocols',
  result: 'Last result',
  fields: { '*': ['Method'], 'agent-pass-rate': ['Agent'] },
  claims: ['Target'],
};
const ROADMAP = doc(
  '# Roadmap',
  '',
  '## Measurement protocols',
  '',
  '### Refund latency',
  '',
  '- **Method**: 1,000 refunds after 100 warm-up runs; the median.   ',
  '- **Last result** (2026-11-05, a laptop): a median of 4 ms.',
  'See **Method**: a field only where a line opens with it.',
  '',
  '#### Notes',
  '',
  'Nothing a protocol of its own.',
  '- **Corpus**:the examples.',
  '',
  '### Agent pass rate',
  '',
  '**Method:** the same tasks in two languages.',
  '**Agent**: one model, one harness.',
  '-  **Tasks :** forty.',
  '**Last result:** none yet.',
  '',
  '## Later',
  '',
  '### Not a protocol',
  '',
  '- **Method**: none.',
  '',
);

/** `null` for a run with no protocols configured. */
function analysed(files: Record<string, string>, config: ProtocolsConfig | null = CONFIG) {
  return analyseSources(
    Object.entries({ 'ROADMAP.md': ROADMAP, ...files }).map(([path, text]) => ({ path, text })),
    { protocols: createProtocolCheck(config ?? undefined), claimsIn: createClaimReader({ files: ['spec/*.md'], labels: { Target: 'open', Specified: 'open' } }) },
  );
}

const RULES = ['incomplete-protocol', 'undated-result', 'target-without-protocol', 'unrecorded-figure', 'broken-reference'];
const findings = (files: Record<string, string>, config: ProtocolsConfig | null = CONFIG): string[] =>
  analysed(files, config)
    .diagnostics.filter((d) => RULES.includes(d.rule))
    .map((d) => `${d.rule} ${d.at.file}:${d.at.span.start.line} ${d.message}`);

describe('a measurement protocol', () => {
  it('is each section one level under the heading, with the fields it writes, an item closed by a dated result', () => {
    const extracted = extractDocument({ path: 'ROADMAP.md', text: ROADMAP, protocols: { heading: 'measurement protocols', result: 'last result' } })!;
    expect(extracted.protocols.map((p) => [p.id, p.anchor, p.title, p.fields.map((f) => `${f.name}=${f.value}`), p.result?.dated, p.result?.none])).toEqual([
      ['ROADMAP#refund-latency', 'refund-latency', 'Refund latency', ['Method=1,000 refunds after 100 warm-up runs; the median.', 'Last result=(2026-11-05, a laptop): a median of 4 ms.', 'Corpus=the examples.'], true, false],
      ['ROADMAP#agent-pass-rate', 'agent-pass-rate', 'Agent pass rate', ['Method=the same tasks in two languages.', 'Agent=one model, one harness.', 'Tasks=forty.', 'Last result=none yet.'], false, true],
    ]);
    expect(extracted.items.map((item) => [item.conflicts, item.label])).toEqual([[[], null], [[], null]]);
    expect(extracted.items[1]!.body).toBe('Method: the same tasks in two languages.\nAgent: one model, one harness.\nTasks: forty.\nLast result: none yet.');
    expect(extracted.items.map((item) => item.kind)).toEqual(['item', 'item']);
    expect(extracted.items.map((item) => [item.id, item.declared, item.disposition, item.evidence.source, item.evidence.raw])).toEqual([
      ['ROADMAP#refund-latency', true, 'satisfied', 'marker', '(2026-11-05, a laptop): a median of 4 ms.'],
      ['ROADMAP#agent-pass-rate', true, 'unresolved', 'marker', 'none yet.'],
    ]);
    expect(extractDocument({ path: 'ROADMAP.md', text: ROADMAP })!.protocols).toEqual([]);
  });

  it('reads no field in code, and gives a protocol with no result none, open', () => {
    const text = doc('# R', '', '## Measurement protocols', '', '### Fees', '', '```', '**Last result**: 2026-01-01', '```', '');
    const extracted = extractDocument({ path: 'ROADMAP.md', text, protocols: { heading: 'measurement protocols', result: 'last result' } })!;
    expect(extracted.protocols.map((p) => [p.fields, p.result])).toEqual([[[], null]]);
    expect(extracted.items.map((item) => [item.disposition, item.evidence.raw, item.evidence.at.span.start.line])).toEqual([['unresolved', '', 5]]);
    expect(extractDocument({ path: 'ROADMAP.md', text: '# R\n\n## Elsewhere\n', protocols: { heading: 'measurement protocols', result: 'last result' } })!.protocols).toEqual([]);
  });

  it('passes with every field asked of it, and fails one it lacks, naming each, in any case written', () => {
    expect(findings({})).toEqual([]);
    const lacking = doc('# Roadmap', '', '## Measurement protocols', '', '### Agent pass rate', '', '- **method**: tasks.', '', '### Fees', '', '- **Unit**: cents.', '');
    expect(findings({ 'ROADMAP.md': lacking })).toEqual([
      'incomplete-protocol ROADMAP.md:5 "Agent pass rate" lacks "Last result" and "Agent"',
      'incomplete-protocol ROADMAP.md:9 "Fees" lacks "Last result" and "Method"',
    ]);
    const found = analysed({ 'ROADMAP.md': lacking }).diagnostics[0];
    expect(found).toMatchObject({ severity: 'error', nodes: ['ROADMAP#agent-pass-rate'], related: [], hint: 'write each under the protocol, as **Name**: what it is' });
  });

  it('asks each field once, where the result is among the fields too', () => {
    const text = doc('# Roadmap', '', '## Measurement protocols', '', '### Fees', '', '- **Method**: cents.', '');
    expect(findings({ 'ROADMAP.md': text }, { ...CONFIG, fields: { '*': ['Method', 'last result'] } })).toEqual(['incomplete-protocol ROADMAP.md:5 "Fees" lacks "Last result"']);
  });

  it('fails a result that names no date and does not say none yet', () => {
    const text = doc(
      '# Roadmap',
      '',
      '## Measurement protocols',
      '',
      '### Fees',
      '',
      '- **Method**: cents.',
      '- **Last result**: last week, roughly.',
      '',
      '### Banks',
      '',
      '- **Method**: each.',
      '- **Last result**: **none yet**',
      '',
      '### Cards',
      '',
      '- **Method**: each.',
      '- **Last result**: measured 2026-11, and none yet since.',
      '',
    );
    expect(findings({ 'ROADMAP.md': text })).toEqual([
      'undated-result ROADMAP.md:8 "Fees" gives a result that names no date and does not say none yet',
      'undated-result ROADMAP.md:18 "Cards" gives a result that names no date and does not say none yet',
    ]);
    const found = analysed({ 'ROADMAP.md': text }).diagnostics.find((d) => d.rule === 'undated-result');
    expect(found).toMatchObject({ nodes: ['ROADMAP#fees'], related: [], hint: 'date the Last result, as 2026-11-05, or say "none yet" until there is one' });
  });

  it('is held to nothing where no protocols are configured', () => {
    expect(findings({ 'ROADMAP.md': doc('# R', '', '## Measurement protocols', '', '### Fees', '') }, null)).toEqual([]);
  });
});

describe('a claim whose label asks for a measurement', () => {
  it('cites a protocol, or fails, and a claim of another label is held to nothing', () => {
    const spec = doc(
      '# Refunds',
      '',
      '- `Target`: a refund within 5 ms ([the protocol](../ROADMAP.md#refund-latency)).',
      '- `Target`: a refund within 3 ms, measured nowhere.',
      '- `Target`: a refund within 2 ms ([the roadmap](../ROADMAP.md)).',
      '- `Specified`: a refund carries a reason.',
      '',
    );
    expect(findings({ 'spec/refunds.md': spec })).toEqual([
      'target-without-protocol spec/refunds.md:4 "`Target`: a refund within 3 ms, measured nowhere." is `Target` and cites no measurement protocol',
      'target-without-protocol spec/refunds.md:5 "`Target`: a refund within 2 ms (the roadmap)." is `Target` and cites no measurement protocol',
    ]);
    const found = analysed({ 'spec/refunds.md': spec }).diagnostics.find((d) => d.rule === 'target-without-protocol');
    expect(found).toMatchObject({ nodes: ['refunds#refunds.2'], related: [], hint: 'link the protocol that measures it, as [the protocol](ROADMAP.md#its-anchor)' });
  });
});

describe('a figure marked @spec-figure', () => {
  const report = (record: string): string => doc('# Report', '', `<!-- @spec-figure ${record} -->`, 'Refunds take 4 ms.', '');

  it('passes resting on a protocol with a dated result, by a citation of its own', () => {
    expect(findings({ 'docs/report.md': report('record="../ROADMAP.md#refund-latency"') })).toEqual([]);
    const edge = analysed({ 'docs/report.md': report('record="../ROADMAP.md#refund-latency"') }).corpus.edges.find((candidate) => candidate.from === 'report');
    expect(edge).toMatchObject({ kind: 'references', to: 'ROADMAP#refund-latency', origin: 'directive', raw: '@spec-figure record="../ROADMAP.md#refund-latency"' });
  });

  it('is held to its own record, beside a figure at the same place in another document', () => {
    expect(findings({ 'docs/a.md': report('record="../ROADMAP.md#refund-latency"'), 'docs/b.md': report('record="../ROADMAP.md#agent-pass-rate"') })).toEqual([
      'unrecorded-figure docs/b.md:3 the figure rests on "Agent pass rate", which has no dated result',
    ]);
  });

  it('fails resting on a protocol with no dated result, pointing at the protocol', () => {
    expect(findings({ 'docs/report.md': report('record="../ROADMAP.md#agent-pass-rate"') })).toEqual([
      'unrecorded-figure docs/report.md:3 the figure rests on "Agent pass rate", which has no dated result',
    ]);
    const found = analysed({ 'docs/report.md': report('record="../ROADMAP.md#agent-pass-rate"') }).diagnostics.find((d) => d.rule === 'unrecorded-figure');
    expect(found).toMatchObject({
      nodes: ['report'],
      target: '../ROADMAP.md#agent-pass-rate',
      related: [{ note: 'ROADMAP#agent-pass-rate is the protocol' }],
      hint: 'mark a figure with the record that measured it, record="ROADMAP.md#protocol-anchor", once the protocol has a dated result',
    });
  });

  it('fails naming no record, or a record that is no protocol, and leaves one that does not resolve to broken-reference', () => {
    expect(findings({ 'docs/report.md': report('reason="measured once"') })).toEqual(['unrecorded-figure docs/report.md:3 the figure names no record']);
    expect(analysed({ 'docs/report.md': report('reason="measured once"') }).diagnostics.find((d) => d.rule === 'unrecorded-figure')?.related).toEqual([]);
    expect(findings({ 'docs/report.md': report('record="../NOWHERE.md#refund-latency"') })).toEqual([
      'broken-reference docs/report.md:3 "../NOWHERE.md#refund-latency" does not resolve to any document',
    ]);
    expect(findings({ 'docs/report.md': report('record="../ROADMAP.md"') })).toEqual([
      "unrecorded-figure docs/report.md:3 the figure's record, ../ROADMAP.md, is no measurement protocol",
    ]);
    expect(findings({ 'docs/report.md': report('record="../ROADMAP.md#refund-latencies"') })).toEqual([
      'broken-reference docs/report.md:3 "../ROADMAP.md#refund-latencies" points at an anchor that does not exist',
    ]);
  });

  it('fails resting on a protocol that writes no result', () => {
    const roadmap = doc('# Roadmap', '', '## Measurement protocols', '', '### Fees', '', '- **Method**: cents.', '');
    expect(findings({ 'ROADMAP.md': roadmap, 'docs/report.md': report('record="../ROADMAP.md#fees"') })).toEqual([
      'incomplete-protocol ROADMAP.md:5 "Fees" lacks "Last result"',
      'unrecorded-figure docs/report.md:3 the figure rests on "Fees", which has no dated result',
    ]);
  });

  it('is held to its own record, beside another figure in the same document', () => {
    const text = doc('# Report', '', '<!-- @spec-figure record="../ROADMAP.md#refund-latency" -->', 'Refunds take 4 ms.', '', '<!-- @spec-figure record="../ROADMAP.md#agent-pass-rate" -->', 'Agents pass.', '');
    expect(findings({ 'docs/report.md': text })).toEqual(['unrecorded-figure docs/report.md:6 the figure rests on "Agent pass rate", which has no dated result']);
  });

  it('is read only from @spec-figure, and a record another directive gives names nothing', () => {
    const text = doc('# Report', '', '<!-- @spec-node record="../NOWHERE.md" -->', 'Refunds take 4 ms.', '');
    expect(findings({ 'docs/report.md': text })).toEqual([]);
    expect(analysed({ 'docs/report.md': text }).corpus.figures).toEqual([]);
  });

  it('is held where no protocols are configured, its record then no protocol', () => {
    expect(findings({ 'docs/report.md': report('record="../ROADMAP.md#refund-latency"') }, null)).toEqual([
      "unrecorded-figure docs/report.md:3 the figure's record, ../ROADMAP.md#refund-latency, is no measurement protocol",
    ]);
  });

  it('is read through the command line, and fails the run', async () => {
    const { mkdir, rm, writeFile } = await import('node:fs/promises');
    const root = `tests/fixtures/.tmp/protocols-${process.pid}`;
    await rm(root, { recursive: true, force: true });
    try {
      await mkdir(`${root}/docs`, { recursive: true });
      await writeFile(`${root}/.spec-graph.json`, JSON.stringify({ patterns: ['*.md', 'docs/*.md'], protocols: CONFIG }));
      await writeFile(`${root}/ROADMAP.md`, ROADMAP);
      await writeFile(`${root}/docs/report.md`, report('record="../ROADMAP.md#agent-pass-rate"'));
      let out = '';
      const code = await main({ argv: ['check', '--format', 'json'], cwd: `${process.cwd()}/${root}`, stdout: (text) => (out += text), stderr: () => {}, env: { NO_COLOR: '1' }, isTTY: false });
      expect(code).toBe(EXIT_FAILED);
      expect(JSON.parse(out).diagnostics.map((d: { rule: string }) => d.rule)).toEqual(['unrecorded-figure']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('protocols in the configuration', () => {
  const problems = (protocols: unknown): readonly string[] => parseConfig(JSON.stringify({ protocols }), '.spec-graph.json').problems;
  const at = (rest: string): string => `.spec-graph.json: ${rest}`;

  it('reads every part, and the parts it may go without', () => {
    expect(parseConfig(JSON.stringify({ protocols: CONFIG }), 'x')).toMatchObject({ problems: [], config: { protocols: CONFIG } });
    const bare = { files: ['ROADMAP.md'], heading: 'Measurement protocols', result: 'Last result' };
    expect(parseConfig(JSON.stringify({ protocols: bare }), 'x').config.protocols).toStrictEqual(bare);
    expect(createProtocolCheck(undefined)).toBeUndefined();
    expect(createProtocolCheck({ ...bare, heading: ' Measurement Protocols ', result: ' Last Result ' })).toMatchObject({
      heading: 'measurement protocols',
      result: 'last result',
      resultName: 'Last Result',
      fields: new Map(),
      claims: new Set(),
    });
  });

  it('refuses each part that is missing or of the wrong kind, and a key it does not know, and leaves protocols out then', () => {
    expect(problems('ROADMAP.md')).toEqual([at('"protocols" must be an object such as { "files": ["ROADMAP.md"], "heading": "Measurement protocols", "result": "Last result" }')]);
    expect(problems({})).toEqual([
      at('"protocols.files" must be a non-empty array of patterns'),
      at('"protocols.heading" must name the heading the protocols are written under'),
      at('"protocols.result" must name the field a result is written in'),
    ]);
    expect(problems({ files: [], heading: ' ', result: 3 })).toEqual([
      at('"protocols.files" must be a non-empty array of patterns'),
      at('"protocols.heading" must name the heading the protocols are written under'),
      at('"protocols.result" must name the field a result is written in'),
    ]);
    const base = { files: ['ROADMAP.md'], heading: 'Measurement protocols', result: 'Last result' };
    expect(problems({ ...base, files: ['ROADMAP.md', ''] })).toEqual([at('"protocols.files" must be a non-empty array of patterns')]);
    expect(problems({ ...base, fields: ['Method'] })).toEqual([at('"protocols.fields" must be an object of protocol anchor, or "*" for every protocol, to the fields it must write')]);
    expect(problems({ ...base, fields: { '*': 'Method' } })).toEqual([at('"protocols.fields" must be an object of protocol anchor, or "*" for every protocol, to the fields it must write')]);
    expect(problems({ ...base, claims: 'Target' })).toEqual([at('"protocols.claims" must be an array of labels')]);
    expect(problems({ ...base, claims: [' '] })).toEqual([at('"protocols.claims" must be an array of labels')]);
    expect(problems({ ...base, claims: [3] })).toEqual([at('"protocols.claims" must be an array of labels')]);
    expect(problems({ ...base, fields: { '*': ['Method'], fees: 'Unit' } })).toEqual([at('"protocols.fields" must be an object of protocol anchor, or "*" for every protocol, to the fields it must write')]);
    expect(problems({ ...base, kind: 'timing' })).toEqual([at('unknown key "protocols.kind"')]);
    expect(parseConfig(JSON.stringify({ protocols: { ...base, kind: 'timing' } }), 'x').config.protocols).toBeUndefined();
  });
});
