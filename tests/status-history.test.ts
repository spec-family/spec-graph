import { describe, expect, it } from 'vitest';

import type { Source } from '../src/runner.js';

/**
 * A status as a history writes it, as a template offers it, and as a table
 * written across holds it (ADR-0002, amended 2026-11-12).
 *
 * adr-tools writes `Accepted` under `## Status`, and `Superseded by [2.
 * Second](0002-second.md)` below it when a later decision replaces the
 * first: read from its first line, the first decision was live, and the
 * supersession the line below named was one it had not acknowledged. MADR's
 * template offers every status there is in one value, and read as a status
 * it was retired, superseded by an ADR-0123 nobody wrote. `Not Accepted`
 * read as accepted, from the word it denies. Every document is made up for
 * the test.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test, and a sweep reads that as a survived mutant.
 */

async function analyse(files: Record<string, string>) {
  const { analyseSources } = await import('../src/runner.js');
  return analyseSources(Object.entries(files).map(([path, text]): Source => ({ path, text })));
}

/** Every document, as `id phase "raw status"`. */
async function statuses(files: Record<string, string>): Promise<string[]> {
  return (await analyse(files)).graph.documents.map((document) => `${document.id} ${document.phase} ${JSON.stringify(document.rawStatus)}`);
}

const one = async (text: string): Promise<string> => (await statuses({ 'docs/adr/0001-first.md': text }))[0]!;

async function lifecycle() {
  return import('../src/lifecycle.js');
}

describe('a status section that is a history', () => {
  it('is retired by a later paragraph that opens with a retirement word, and names its successor', async () => {
    const files = {
      'docs/adr/0001-first.md': '# 1. First\n\n## Status\n\nAccepted\n\nSuperseded by [2. Second](0002-second.md)\n\n## Context\n\nOne writer.\n',
      'docs/adr/0002-second.md': '# 2. Second\n\n## Status\n\nAccepted\n\nSupersedes [1. First](0001-first.md)\n',
    };
    const { graph, diagnostics } = await analyse(files);
    expect(graph.documents.map((document) => `${document.id} ${document.phase} ${JSON.stringify(document.rawStatus)}`)).toEqual([
      'ADR-0001 retired "Superseded by [2. Second](0002-second.md)"',
      'ADR-0002 active "Accepted"',
    ]);
    expect(graph.out('ADR-0002').map((edge) => `${edge.kind} ${edge.to}`)).toContain('supersedes ADR-0001');
    expect(diagnostics.map((d) => d.rule)).toEqual([]);
  });

  it('is retired by a later entry of a list', async () => {
    expect(await one('# A\n\n## Status\n\n- Proposed\n- Accepted\n- Superseded by ADR-0002\n')).toBe('ADR-0001 retired "Superseded by ADR-0002"');
    expect(await one('# A\n\n## Status\n\n* 2026-01-04 Accepted\n* 2026-03-02 Deprecated\n')).toBe('ADR-0001 retired "2026-03-02 Deprecated"');
  });

  it('keeps a first line that retires it, over any later one', async () => {
    expect(await one('# A\n\n## Status\n\nAccepted, later superseded by ADR-0002\n\nSuperseded by ADR-0003\n')).toBe(
      'ADR-0001 retired "Accepted, later superseded by ADR-0002"',
    );
  });

  it('is not retired by a sentence that mentions a retirement, nor by a line of one that wraps to begin with the word', async () => {
    expect(await one('# A\n\n## Status\n\nAccepted\n\nThe option deprecated in ADR-0002 stays in use.\n')).toBe('ADR-0001 active "Accepted"');
    expect(await one('# A\n\n## Status\n\nAccepted. The alternative was\nrejected in review.\n')).toBe('ADR-0001 active "Accepted. The alternative was"');
    expect(await one('# A\n\n## Status\n\nAccepted\n\nAmends [ADR-0002](0002-second.md)\n')).toBe('ADR-0001 active "Accepted"');
  });

  it('ends at the next heading, and at code', async () => {
    expect(await one('# A\n\n## Status\n\nAccepted\n\n## Context\n\nSuperseded designs are listed below.\n')).toBe('ADR-0001 active "Accepted"');
    expect(await one('# A\n\n## Status\n\nAccepted\n\n```text\nSuperseded by nothing\n```\n')).toBe('ADR-0001 active "Accepted"');
  });

  it('opens with the word when only the word is there', async () => {
    const { opensRetired } = await lifecycle();
    expect(['Superseded by ADR-2', '**Deprecated**', 'Not planned', 'replaced-by ADR-3'].map(opensRetired)).toEqual([true, true, true, true]);
    expect(['Accepted, later superseded', 'Not deprecated', 'The deprecated option', 'Supersedes ADR-1', '{superseded | accepted}'].map(opensRetired)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('a status word denied', () => {
  it('is no status', async () => {
    const { phaseOf } = await lifecycle();
    expect(['Not Accepted', 'Not implemented', 'not yet accepted', 'not superseded'].map(phaseOf)).toEqual(['unknown', 'unknown', 'unknown', 'unknown']);
  });

  it('leaves the other words of the status, and the phrases written with the denial', async () => {
    const { phaseOf } = await lifecycle();
    expect(['Accepted, not implemented', 'Not planned', 'Not yet decided', 'Implemented, not deprecated'].map(phaseOf)).toEqual([
      'active',
      'retired',
      'draft',
      'active',
    ]);
    // A denial reaches the word after it, and the one after that past `yet` alone.
    expect(phaseOf('Not deprecated, accepted')).toBe('active');
  });
});

describe('a template', () => {
  it("offers a choice of statuses, which is none of them and names no successor, closed or not", async () => {
    const { phaseOf, supersessionTargetsIn } = await lifecycle();
    const offers = [
      '{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123}',
      '{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123',
      '`{draft | accepted}`',
    ];
    expect(offers.map(phaseOf)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(offers.map(supersessionTargetsIn)).toEqual([[], [], []]);
    // A brace with no choice in it is decoration, and a bar outside one a table.
    expect(['{draft}', 'Accepted | 2026-01-01'].map(phaseOf)).toEqual(['draft', 'active']);
    // Only a status that opens with the offer is one.
    expect(phaseOf('Accepted: the {fast | safe} option')).toBe('active');
  });

  it('is a file named one, whose status is not read', async () => {
    const { isTemplateFile } = await lifecycle();
    expect(['docs/decisions/adr-template.md', '0000-template.md', 'docs/TEMPLATE.md', 'docs/template_adr.md'].map(isTemplateFile)).toEqual([true, true, true, true]);
    expect(['docs/adr/0012-use-templates.md', 'docs/templating.md', 'docs/templates/0001-a.md', 'docs/template/0001-a.md'].map(isTemplateFile)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("leaves MADR's own template with no status and no finding", async () => {
    const template = [
      '---',
      '# These are optional metadata elements. Feel free to remove any of them.',
      'status: "{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123"',
      'date: {YYYY-MM-DD when the decision was last updated}',
      '---',
      '',
      '# {short title, representative of solved problem and found solution}',
      '',
    ].join('\n');
    const files = {
      'docs/decisions/0001-use-markdown.md': '---\nstatus: accepted\n---\n\n# Use Markdown\n',
      'docs/decisions/adr-template.md': template,
      'docs/decisions/0002-copied.md': template.replace('# {short', '# ADR-0002 {short'),
    };
    const { graph, diagnostics } = await analyse(files);
    expect(graph.documents.map((document) => `${document.id} ${document.phase}`)).toEqual(['ADR-0001 active', 'adr-template unknown', 'ADR-0002 unknown']);
    expect(diagnostics.map((d) => `${d.rule} ${d.at.file}`)).toEqual([]);
  });
});

describe('struck text', () => {
  it('is what the status was, and the word after it what it is', async () => {
    expect(await one('# A\n\n**Status**: ~~Proposed~~ Accepted\n')).toBe('ADR-0001 active "~~Proposed~~ Accepted"');
    expect(await one('# A\n\nStatus: ~~Accepted~~\n')).toBe('ADR-0001 unknown "~~Accepted~~"');
    // Struck twice, struck with no space after it, and struck inside emphasis.
    expect(await one('# A\n\nStatus: ~~Draft~~ ~~Proposed~~ Accepted\n')).toBe('ADR-0001 active "~~Draft~~ ~~Proposed~~ Accepted"');
    expect(await one('# A\n\nStatus: ~~Proposed~~Accepted\n')).toBe('ADR-0001 active "~~Proposed~~Accepted"');
    expect(await one('# A\n\nStatus: **~~Proposed~~ Accepted**\n')).toBe('ADR-0001 active "**~~Proposed~~ Accepted**"');
    // A hint in a comment after the strike is no status, as one before a value is not.
    expect(await one('# A\n\nStatus: ~~Draft~~ <!-- proposed | accepted -->\n')).toBe('ADR-0001 unknown "~~Draft~~ <!-- proposed | accepted -->"');
    const { phaseOf, supersessionTargetsIn } = await lifecycle();
    expect(['~~Superseded~~ Accepted', '~~Accepted~~ ~~Draft~~ Superseded by ADR-2'].map(phaseOf)).toEqual(['active', 'retired']);
    expect(supersessionTargetsIn('~~Superseded by ADR-1~~ Accepted')).toEqual([]);
    expect(supersessionTargetsIn('~~Accepted~~ Superseded by ADR-2')).toEqual(['ADR-2']);
    // Struck text keeps the words on either side of it apart, written against them or not.
    expect(phaseOf('Proposed~~Draft~~Accepted')).toBe(phaseOf('Proposed Accepted'));
    expect(phaseOf('Proposed~~Draft~~Accepted')).not.toBe('unknown');
  });
});

describe('a table written across', () => {
  it('holds the status under its status column, in its one row', async () => {
    expect(await one('# A\n\n| Status | Date |\n| --- | --- |\n| Accepted | 2026-03-01 |\n')).toBe('ADR-0001 active "Accepted"');
    expect(await one('# A\n\n| Date | Status | Deciders |\n| --- | --- | --- |\n| 2026-03-01 | Superseded by ADR-0002 | Kim |\n')).toBe(
      'ADR-0001 retired "Superseded by ADR-0002"',
    );
  });

  it('is not one with more rows, nor a header that is a status written as a header row', async () => {
    expect(await one('# A\n\n| Status | Date |\n| --- | --- |\n| Accepted | 2026-03-01 |\n| Draft | 2026-01-01 |\n')).toBe('ADR-0001 unknown "Date"');
    expect(await one('# A\n\n| Status | Owner | Count |\n| --- | --- | --- |\n| Draft | Kim | 1 |\n| Done | Lee | 2 |\n')).toBe('ADR-0001 unknown null');
    expect(await one('# A\n\n| Status | Accepted |\n| --- | --- |\n| Date | 2026-03-01 |\n')).toBe('ADR-0001 active "Accepted"');
  });
});
