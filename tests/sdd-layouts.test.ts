import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createGlobMatcher } from '../src/glob.js';
import { identify } from '../src/identity.js';
import { phaseFromPath } from '../src/lifecycle.js';
import { analyseSources, DEFAULT_PATTERNS, type Source } from '../src/runner.js';

/**
 * The layouts spec-driven-development tools write, read with no
 * configuration (ADR-0031): Spec Kit's `specs/` and `.specify/memory/`,
 * OpenSpec's `openspec/` with the changes it has applied kept as records, and
 * Kiro's `.kiro/specs/`.
 */

const analysed = (files: Record<string, string>) => analyseSources(Object.entries(files).map(([path, text]): Source => ({ path, text })));

describe('the patterns read when none are given', () => {
  const reads = createGlobMatcher(DEFAULT_PATTERNS);

  it.each([
    'specs/001-photo-albums/spec.md',
    'specs/001-photo-albums/checklists/ux.md',
    '.specify/memory/constitution.md',
    'openspec/specs/auth/spec.md',
    'openspec/changes/add-mfa/specs/auth/spec.md',
    'openspec/changes/archive/2026-10-01-add-login/tasks.md',
    'openspec/project.md',
    '.kiro/specs/user-auth/requirements.md',
  ])('read %s', (path) => {
    expect(reads(path)).toBe(true);
  });

  it.each(['.specify/templates/spec-template.md', '.kiro/steering/product.md', 'openspec/config.yaml', 'memory/constitution.md'])(
    'leave %s, a template, an instruction, no Markdown or no layout of theirs',
    (path) => {
      expect(reads(path)).toBe(false);
    },
  );

  it('are the ones the README lists', () => {
    const readme = readFileSync('README.md', 'utf8');
    const block = readme.slice(readme.indexOf('With no patterns, spec-graph reads'), readme.indexOf('\n\n', readme.indexOf('With no patterns, spec-graph reads')));
    expect([...block.matchAll(/`([^`]+)`/g)].map(([, pattern]) => pattern)).toEqual([...DEFAULT_PATTERNS]);
  });
});

describe('a change OpenSpec has applied', () => {
  it('is a record, under archive/ in changes/, and an archive anywhere else still retires', () => {
    expect(phaseFromPath('openspec/changes/archive/2026-10-01-add-login/tasks.md')).toBe('record');
    expect(phaseFromPath('openspec/changes/archive/2026-10-01-add-login/specs/auth/spec.md')).toBe('record');
    expect(phaseFromPath('Changes/Archive/x.md')).toBe('record');
    expect(phaseFromPath('docs/adr/archive/0001-x.md')).toBe('retired');
    expect(phaseFromPath('archive/changes/x.md')).toBe('retired');
    // The file is no directory: a document named archive is neither.
    expect(phaseFromPath('openspec/changes/archive.md')).toBe('unknown');
    expect(phaseFromPath('openspec/changes/archive')).toBe('unknown');
    expect(phaseFromPath('openspec/changes/add-mfa/tasks.md')).toBe('unknown');
  });

  it('keeps its unticked tasks as what was left, and is no premise retired for what cites it', () => {
    const { diagnostics, graph } = analysed({
      'openspec/changes/archive/2026-10-01-add-login/tasks.md': '## 1. Implementation\n- [x] 1.1 Add the users table\n- [ ] 1.2 Add password reset\n',
      'openspec/changes/archive/2026-10-01-add-login/proposal.md': '# Change: Add login\n',
      'openspec/specs/auth/spec.md': '---\nstatus: accepted\ndepends-on: ../../changes/archive/2026-10-01-add-login/proposal.md\n---\n\n# auth Specification\n',
    });
    expect(graph.documents.map((d) => `${d.id} ${d.phase}`)).toEqual([
      'openspec/changes/archive/2026-10-01-add-login/tasks record',
      'openspec/changes/archive/2026-10-01-add-login/proposal record',
      'openspec/specs/auth/spec active',
    ]);
    expect(diagnostics).toEqual([]);
  });
});

describe('a file in a directory a template fills', () => {
  it.each([
    ['checklists', 'specs/002-sharing/checklists/ux.md'],
    ['contracts', 'specs/002-sharing/contracts/albums-api.md'],
  ])('in %s/ is named by its path', (_, path) => {
    expect(identify({ path, declaredId: null, declaredAliases: [], heading: null }).id).toBe(path.slice(0, -3));
  });

  it('is named so only directly in it, and keeps a number or a declaration that names it', () => {
    const named = (path: string, declaredId: string | null = null): string => identify({ path, declaredId, declaredAliases: [], heading: null }).id;
    expect(named('docs/checklists/release/steps.md')).toBe('steps');
    expect(named('docs/adr/checklists/0007-release.md')).toBe('ADR-0007');
    expect(named('specs/002-sharing/checklists/ux.md', 'UX-CHECKS')).toBe('UX-CHECKS');
    expect(named('docs/release-checklists.md')).toBe('release-checklists');
    expect(named('specs/002-sharing/Checklists/ux.md')).toBe('specs/002-sharing/Checklists/ux');
  });

  it('lets every feature of Spec Kit keep a checklist of one name', () => {
    const { corpus } = analysed({
      'specs/001-photo-albums/checklists/ux.md': '# UX Checklist\n\n- [ ] Keyboard reachable\n',
      'specs/002-sharing/checklists/ux.md': '# UX Checklist\n\n- [ ] Keyboard reachable\n',
    });
    expect(corpus.documents.map((d) => d.id)).toEqual(['specs/001-photo-albums/checklists/ux', 'specs/002-sharing/checklists/ux']);
    expect(corpus.duplicates).toEqual([]);
  });
});

describe('a repository of each layout, walked with no configuration', () => {
  it('reads every document the layouts keep, in the directories whose names open with a dot as well', async () => {
    const { mkdir, rm, writeFile } = await import('node:fs/promises');
    const { analyse } = await import('../src/runner.js');
    const root = `tests/fixtures/.tmp/sdd-${process.pid}`;
    await rm(root, { recursive: true, force: true });
    try {
      const files = [
        'specs/001-photo-albums/spec.md',
        'specs/001-photo-albums/checklists/ux.md',
        '.specify/memory/constitution.md',
        '.specify/templates/spec-template.md',
        'openspec/specs/auth/spec.md',
        'openspec/changes/archive/2026-10-01-add-login/tasks.md',
        '.kiro/specs/user-auth/requirements.md',
        '.kiro/steering/product.md',
      ];
      for (const file of files) {
        await mkdir(`${root}/${file.slice(0, file.lastIndexOf('/'))}`, { recursive: true });
        await writeFile(`${root}/${file}`, '# A document\n');
      }
      const result = await analyse({ root });
      expect(result.files).toEqual([
        '.kiro/specs/user-auth/requirements.md',
        '.specify/memory/constitution.md',
        'openspec/changes/archive/2026-10-01-add-login/tasks.md',
        'openspec/specs/auth/spec.md',
        'specs/001-photo-albums/checklists/ux.md',
        'specs/001-photo-albums/spec.md',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
