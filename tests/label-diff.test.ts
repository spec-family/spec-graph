import { describe, expect, it } from 'vitest';

import { diffExports, diffVerdict, formatDiffJson, formatDiffMarkdown, formatDiffText, parseGraphExport, type GraphExport } from '../src/diff.js';
import { formatGraph } from '../src/report.js';
import { analyseSources, createClaimReader } from '../src/runner.js';
import type { ClaimsConfig } from '../src/types.js';

/**
 * A claim's label changed between two states, as `diff` reports it: raised,
 * lowered or relabelled by what the label means for work (ADR-0020, amended
 * 2026-11-08). Every export is built inside the test that reads it.
 */

const GENERATOR = { name: 'spec-graph', version: '1.2.3' };
const CLAIMS: ClaimsConfig = { files: ['spec/*.md'], labels: { Implemented: 'done', Shipped: 'done', Specified: 'open', Target: 'open' } };

const exported = (spec: string, claims: ClaimsConfig | null = CLAIMS): GraphExport =>
  parseGraphExport(
    formatGraph(analyseSources([{ path: 'spec/refunds.md', text: spec }], { claimsIn: createClaimReader(claims ?? undefined) }).graph, 'json', { generator: GENERATOR }),
    'state.json',
  );

const spec = (...claims: string[]): string => ['# Refunds', '', '## Limits', '', ...claims, ''].join('\n');
const named = (id: string, line: string): string => `<!-- @spec-item id="${id}" -->\n${line}`;

describe('a claim whose label changed', () => {
  it('is raised where its label closes the work it left open, and reported once, not also as resolved', () => {
    const diff = diffExports(
      exported(spec(named('refund-limit', '- `Specified`: a refund over the capture is refused.'))),
      exported(spec(named('refund-limit', '- `Implemented`: a refund over the capture is refused.'))),
    );
    expect(diff.claims.relabelled).toEqual([
      {
        document: 'refunds',
        section: ['Refunds', 'Limits'],
        place: 'Limits',
        title: '`Implemented`: a refund over the capture is refused.',
        label: ['Specified', 'Implemented'],
        openness: ['open', 'closed'],
        change: 'raised',
      },
    ]);
    expect(diff.obligations.transitions).toEqual([]);
    expect(diffVerdict(diff)).toBe('1 claim relabelled changed.');
  });

  it('is lowered where its label opens the work again, and relabelled where its openness held', () => {
    const before = exported(spec(named('a', '- `Implemented`: one.'), named('b', '- `Specified`: two.'), named('c', '- `Specified`: three.'), named('d', '- `Implemented`: four.')));
    const after = exported(spec(named('a', '- `Specified`: one.'), named('b', '- `Target`: two.'), named('c', '- `Specified`: three, reworded.'), named('d', '- `Shipped`: four.')));
    const diff = diffExports(before, after);
    expect(diff.claims.relabelled.map((claim) => [claim.label, claim.change])).toEqual([
      // In the order of their places and titles.
      [['Implemented', 'Shipped'], 'relabelled'],
      [['Implemented', 'Specified'], 'lowered'],
      [['Specified', 'Target'], 'relabelled'],
    ]);
    expect(diffVerdict(diff)).toBe('3 claims relabelled changed.');
  });

  it('is no claim relabelled where either side is no claim, and its openness is still an obligation\'s', () => {
    const diff = diffExports(
      exported(spec(named('a', '- [ ] `Implemented`: one.')), null),
      exported(spec(named('a', '- [ ] `Implemented`: one.'))),
    );
    expect(diff.claims.relabelled).toEqual([]);
    expect(diff.obligations.transitions.map((transition) => transition.openness)).toEqual([['open', 'closed']]);
    const back = diffExports(exported(spec(named('a', '- [x] `Implemented`: one.'))), exported(spec(named('a', '- [x] `Implemented`: one.')), null));
    expect(back.claims.relabelled).toEqual([]);
  });

  it('pairs a claim with no name only where its text held, so a label rewritten in its text is no pair', () => {
    const diff = diffExports(exported(spec('- `Specified`: one.')), exported(spec('- `Implemented`: one.')));
    expect(diff.claims.relabelled).toEqual([]);
    expect([diff.obligations.appeared.length, diff.obligations.disappeared.length]).toEqual([1, 1]);
  });

  it('is read as no claim from an export made before labels', () => {
    const old = parseGraphExport(
      JSON.stringify({ version: 1, nodes: [{ id: 'A#a', kind: 'item', declared: true, openness: 'open' }], edges: [] }),
      'old.json',
    );
    expect(old.items.map((item) => item.label)).toEqual([null]);
  });
});

describe('the report of labels changed', () => {
  const diff = () =>
    diffExports(
      exported(spec(named('a', '- `Specified`: one | two.'), named('b', '- `Implemented`: three.'))),
      exported(spec(named('a', '- `Implemented`: one | two.'), named('b', '- `Specified`: three.'))),
    );

  it('lists each claim under Claims for a terminal', () => {
    expect(formatDiffText(diff())).toBe(
      [
        '2 claims relabelled changed.',
        '',
        'Claims',
        '  raised      refunds > Limits: "`Implemented`: one | two." (Specified -> Implemented)',
        '  lowered     refunds > Limits: "`Specified`: three." (Implemented -> Specified)',
        '',
      ].join('\n'),
    );
  });

  it('tabulates each claim for a summary, a pipe escaped', () => {
    expect(formatDiffMarkdown(diff())).toBe(
      [
        '### spec-graph diff',
        '',
        '2 claims relabelled changed.',
        '',
        '| | Where | Claim | Label |',
        '| --- | --- | --- | --- |',
        '| raised | refunds > Limits | `Implemented`: one &#124; two. | Specified -> Implemented |',
        '| lowered | refunds > Limits | `Specified`: three. | Implemented -> Specified |',
        '',
      ].join('\n'),
    );
  });

  it('gives a script the claims beside the rest', () => {
    expect(JSON.parse(formatDiffJson(diff())).claims.relabelled.map((claim: { change: string }) => claim.change)).toEqual(['raised', 'lowered']);
  });
});
