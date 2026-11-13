import { describe, expect, it } from 'vitest';

import type { IdentityInput } from '../src/identity.js';

/**
 * A word that numbers a part of a plan, a book or a release names no family
 * of documents (ADR-0004), and a template's file is named by its path whatever
 * its title says (ADR-0030, amended 2026-11-12).
 *
 * Spec Kit with no configuration gave 34 errors on a real repository, 33 of
 * them "Phase 2 does not resolve": one feature's `research.md` opened with
 * `# Phase 0 Research`, became PHASE-0, made PHASE a family, and every phase a
 * plan named in prose was a citation of a document nobody would write. The
 * other features' `research.md` were PHASE-0 too, and left the graph.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test, and a sweep reads that as a survived mutant.
 */

const file = (path: string, rest: Partial<IdentityInput> = {}): IdentityInput => ({
  path,
  declaredId: null,
  declaredAliases: [],
  heading: null,
  ...rest,
});

async function identify(input: IdentityInput) {
  const { identify: read } = await import('../src/identity.js');
  return read(input);
}

async function analyse(files: Record<string, string>) {
  const { analyseSources } = await import('../src/runner.js');
  return analyseSources(Object.entries(files).map(([path, text]) => ({ path, text })));
}

const findings = async (files: Record<string, string>): Promise<string[]> =>
  (await analyse(files)).diagnostics.map((d) => `${d.rule} ${d.at.file}: ${d.message}`);

describe('a word that numbers a part', () => {
  it.each(['Phase 1: Foundations', 'Stage 2 rollout', 'Sprint 4', 'Week 12 review', 'Part 3', 'Chapter 7: Storage', 'v1.2.0 release notes'])(
    'names no family as the title "%s"',
    async (title) => {
      const identity = await identify(file('docs/roadmap.md', { heading: title }));
      expect([identity.id, identity.family, identity.number]).toEqual(['roadmap', null, null]);
    },
  );

  it.each([
    ['docs/plans/phase-1-foundations.md', 'phase-1-foundations'],
    ['docs/plans/Sprint_4.md', 'Sprint_4'],
    ['docs/releases/v1.2.0.md', 'v1.2.0'],
    ['docs/releases/v1.10.0-changelog.md', 'v1.10.0-changelog'],
    ['book/chapter-07/README.md', 'chapter-07'],
    // A name that opens with a space is read past it, as an identifier is.
    ['docs/plans/ Phase 2.md', ' Phase 2'],
  ])('names no family as the file %s, which is named by its stem', async (path, id) => {
    const identity = await identify(file(path));
    expect([identity.id, identity.family, identity.number]).toEqual([id, null, null]);
  });

  it('leaves the family of its directory, with no number in it', async () => {
    const identity = await identify(file('docs/adr/phase-2.md'));
    expect([identity.id, identity.family, identity.number]).toEqual(['phase-2', 'ADR', null]);
  });

  it('still names a family when a document declares it so', async () => {
    const identity = await identify(file('docs/plans/foundations.md', { declaredId: 'PHASE-1' }));
    expect([identity.id, identity.family, identity.number]).toEqual(['PHASE-1', 'PHASE', 1]);
  });

  it('is the whole word: a family that only begins like one is a family', async () => {
    expect((await identify(file('docs/notes.md', { heading: 'Partition 3: Hot keys' }))).id).toBe('PARTITION-3');
    expect((await identify(file('docs/notes.md', { heading: 'VER-12: Versioning' }))).id).toBe('VER-12');
    expect((await identify(file('docs/stages-0004-x.md'))).id).toBe('STAGES-0004');
    expect((await identify(file('docs/adr/0007-phase-1.md'))).id).toBe('ADR-0007');
    expect((await identify(file('docs/notes.md', { heading: 'ADR-0007: Sharding' }))).id).toBe('ADR-0007');
  });

  it('gives no two release notes one id, so none of them leaves the graph', async () => {
    const { corpus } = await analyse({
      'docs/releases/v1.0.0.md': '# v1.0.0\n',
      'docs/releases/v1.1.0.md': '# v1.1.0\n',
      'docs/releases/v1.2.0-changelog.md': '# v1.2.0 changelog\n',
    });
    expect(corpus.duplicates).toEqual([]);
    expect(corpus.documents.map((d) => d.id).sort()).toEqual(['v1.0.0', 'v1.1.0', 'v1.2.0-changelog']);
  });

  it('is prose in a sentence, even where a document declares itself in that family', async () => {
    expect(
      await findings({
        'docs/plans/foundations.md': '---\nid: PHASE-1\n---\n\n# Foundations\n',
        'docs/plans/roadmap.md': '# Roadmap\n\nThe audit log lands in Phase 2, after Sprint 4.\n',
      }),
    ).toEqual([]);
  });

  it('is still a citation where a link names it', async () => {
    expect(
      await findings({
        'docs/plans/foundations.md': '---\nid: PHASE-1\n---\n\n# Foundations\n',
        'docs/plans/roadmap.md': '# Roadmap\n\nThe audit log lands in [the next phase](PHASE-2).\n',
      }),
    ).toEqual(['broken-reference docs/plans/roadmap.md: "PHASE-2" does not resolve to any document']);
  });
});

describe('the title of a file a template named', () => {
  it('names nothing, so the file is named by its path', async () => {
    expect((await identify(file('specs/001-login/research.md', { heading: 'Phase 0 Research' }))).id).toBe('specs/001-login/research');
    expect((await identify(file('specs/001-login/spec.md', { heading: 'SPEC-0001: Login' }))).id).toBe('specs/001-login/spec');
    expect((await identify(file('specs/001-login/checklists/ux.md', { heading: 'UX-1 checklist' }))).id).toBe('specs/001-login/checklists/ux');
  });

  it('still names a file no template named', async () => {
    expect((await identify(file('docs/login.md', { heading: 'SPEC-0001: Login' }))).id).toBe('SPEC-0001');
  });

  it('leaves Spec Kit with no configuration with every feature read and no phase a citation', async () => {
    const plan = (feature: string): string =>
      [`# Implementation Plan: ${feature}`, '', '## Phase 0: Outline & Research', '', 'See [research](research.md). Phase 1 follows.', '', '## Phase 2: Task Planning', '', 'Phase 2 is planned, not run.', ''].join('\n');
    const files = {
      'specs/001-login/research.md': '# Phase 0 Research: Login\n',
      'specs/001-login/plan.md': plan('Login'),
      'specs/002-audit/research.md': '# Phase 0 Research: Audit\n',
      'specs/002-audit/plan.md': plan('Audit'),
      'specs/003-export/research.md': '# Phase 0 Research: Export\n',
    };
    const { corpus, diagnostics } = await analyse(files);
    expect(corpus.duplicates).toEqual([]);
    expect(corpus.families).toEqual([]);
    expect(corpus.documents.map((d) => d.id).filter((id) => id.endsWith('/research'))).toEqual([
      'specs/001-login/research',
      'specs/002-audit/research',
      'specs/003-export/research',
    ]);
    expect(diagnostics.map((d) => d.rule)).toEqual([]);
  });
});

describe('a citation in prose that resolves to nothing', () => {
  it('names the flag that passes its family over, and the file that started it', async () => {
    const { diagnostics } = await analyse({
      'docs/plans/iteration-1.md': '# Iteration 1: Basics\n',
      'docs/plans/roadmap.md': '# Roadmap\n\nExport ships in Iteration 2.\n',
    });
    expect(diagnostics.map((d) => [d.rule, d.message, d.hint])).toEqual([
      [
        'broken-reference',
        '"Iteration 2" does not resolve to any document',
        'fix the identifier, or add the document it names - or, if it is not a citation, --ignore-family ITERATION passes over the family docs/plans/iteration-1.md started',
      ],
    ]);
  });

  // A run hands the files over in the order of their paths; these are handed over as written.
  it('names the file read first in the family', async () => {
    const { diagnostics } = await analyse({
      'docs/adr/0002-b.md': '# B\n',
      'docs/adr/0001-a.md': '# A\n\nADR-0009 is still to be written.\n',
    });
    expect(diagnostics.map((d) => d.hint)).toEqual([
      'fix the identifier, or add the document it names - or, if it is not a citation, --ignore-family ADR passes over the family docs/adr/0002-b.md started',
    ]);
  });

  it('keeps the hint it had where a link, front matter or a bare number wrote it', async () => {
    const { diagnostics } = await analyse({
      'docs/adr/0001-a.md': '---\ndepends-on: ADR-0008\n---\n\n# A\n\nSee [the plan](ADR-0009) and 12.\n',
    });
    expect(diagnostics.map((d) => [d.message, d.hint])).toEqual([
      ['"ADR-0008" does not resolve to any document', 'fix the identifier, or add the document it names'],
      ['"ADR-0009" does not resolve to any document', 'fix the identifier, or add the document it names'],
    ]);
  });
});
