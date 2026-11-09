import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { identify, type IdentityInput } from '../src/identity.js';
import { analyseSources, type Source } from '../src/runner.js';

/**
 * A file name a template gives every document of its kind names none of them
 * (ADR-0030). Spec Kit writes `specs/<feature>/spec.md`, OpenSpec
 * `openspec/changes/<change>/tasks.md`, Kiro `.kiro/specs/<feature>/design.md`:
 * named by their stems, two features were one id, the later was left out of
 * the graph, and a link from one feature's spec to another's bound to itself.
 */

const file = (path: string, rest: Partial<IdentityInput> = {}): IdentityInput => ({
  path,
  declaredId: null,
  declaredAliases: [],
  heading: null,
  ...rest,
});

const SPEC = (title: string, ...body: string[]): string =>
  [`# Feature Specification: ${title}`, '', '**Feature Branch**: `001-login`', '**Status**: Draft', '', ...body, ''].join('\n');

const analysed = (sources: Record<string, string>) =>
  analyseSources(Object.entries(sources).map(([path, text]): Source => ({ path, text })));

const ids = (sources: Record<string, string>): string[] =>
  analysed(sources)
    .corpus.documents.map((d) => d.id)
    .sort();

/** The names, each with a path a layout gives it. The reference page on references lists them. */
const TEMPLATE_NAMES: readonly (readonly [string, string])[] = [
  ['spec', 'specs/001-login/spec.md'],
  ['specification', 'docs/features/login/specification.md'],
  ['plan', 'specs/001-login/plan.md'],
  ['tasks', 'openspec/changes/add-mfa/tasks.md'],
  ['design', '.kiro/specs/user-auth/design.md'],
  ['proposal', 'openspec/changes/add-mfa/proposal.md'],
  ['requirements', '.kiro/specs/user-auth/requirements.md'],
  ['research', 'specs/001-login/research.md'],
  ['data-model', 'specs/001-login/data-model.md'],
  ['quickstart', 'specs/001-login/quickstart.md'],
];

describe('a file a template named', () => {
  it.each(TEMPLATE_NAMES)('%s is named by its path, less the extension', (_name, path) => {
    expect(identify(file(path)).id).toBe(path.slice(0, path.lastIndexOf('.')));
  });

  it('is named so in any case, and still answers to its name and its path', () => {
    const identity = identify(file('docs/Login/Spec.md'));
    expect(identity.id).toBe('docs/Login/Spec');
    expect(identity.aliases).toEqual(expect.arrayContaining(['spec', 'docs/login/specmd', 'docs/login/spec']));
  });

  it('are the names the reference lists', () => {
    const text = readFileSync('docs/reference/references.md', 'utf8');
    const sentence = text.slice(text.indexOf('A file name a template gives'), text.indexOf('names none of them'));
    const listed = [...sentence.matchAll(/`([a-z-]+)\.md`/g)].map(([, name]) => name as string);
    expect(listed.sort()).toEqual(TEMPLATE_NAMES.map(([name]) => name).sort());
  });
});

describe('a file a template did not name', () => {
  it('keeps the name it has, where its name only begins or ends like one', () => {
    expect(identify(file('docs/specification-guide.md')).id).toBe('specification-guide');
    expect(identify(file('docs/planning.md')).id).toBe('planning');
    expect(identify(file('docs/test-plan.md')).id).toBe('test-plan');
  });

  it('keeps a number its name or its directory gives, and a name it declares', () => {
    expect(identify(file('docs/adr/0007-plan.md')).id).toBe('ADR-0007');
    expect(identify(file('keps/sig-auth/1234-token-rotation/README.md')).id).toBe('KEP-1234');
    expect(identify(file('specs/001-login/spec.md', { declaredId: 'LOGIN' })).id).toBe('LOGIN');
    expect(identify(file('specs/001-login/spec.md', { heading: 'SPEC-0001: Login' })).id).toBe('SPEC-0001');
  });

  it('is a README, named by its directory, even one a template name spells', () => {
    expect(identify(file('docs/design/README.md')).id).toBe('design');
  });

  it('at the root is named as it was, its path being its name', () => {
    expect(identify(file('plan.md')).id).toBe('plan');
  });

  it('is no region of a file, which does not take the path the file is named by (ADR-0009)', () => {
    expect(identify(file('specs/001-login/spec.md', { includePathAliases: false })).id).not.toBe('specs/001-login/spec');
  });
});

describe('a layout of one document per directory', () => {
  it('reads every feature of Spec Kit, and a link between two as a link, not a self-reference', () => {
    const { corpus, diagnostics, graph } = analysed({
      'specs/001-login/spec.md': SPEC('Login', '## Requirements', '', '- **FR-001**: System MUST let a user log in.'),
      'specs/002-audit/spec.md': SPEC('Audit', 'Builds on [login](../001-login/spec.md).'),
      'specs/002-audit/plan.md': '# Implementation Plan: Audit\n\n**Spec**: [spec](spec.md)\n',
      'specs/002-audit/tasks.md': '# Tasks: Audit\n\n- [ ] T001 Create the audit log\n- [x] T002 Write the schema\n',
    });
    expect(corpus.documents.map((d) => d.id).sort()).toEqual([
      'specs/001-login/spec',
      'specs/002-audit/plan',
      'specs/002-audit/spec',
      'specs/002-audit/tasks',
    ]);
    expect(corpus.duplicates).toEqual([]);
    expect(graph.out('specs/002-audit/spec').map((e) => `${e.kind} ${e.to}`)).toContain('depends-on specs/001-login/spec');
    expect(graph.out('specs/002-audit/plan').map((e) => `${e.kind} ${e.to}`)).toContain('references specs/002-audit/spec');
    expect(diagnostics.map((d) => d.rule)).not.toContain('self-reference');
  });

  it('reads an OpenSpec capability, a change, and the change\'s spec of the same capability apart', () => {
    expect(
      ids({
        'openspec/specs/auth/spec.md': '# auth Specification\n',
        'openspec/changes/add-mfa/proposal.md': '# Change: Add MFA\n',
        'openspec/changes/add-mfa/tasks.md': '# Tasks\n\n- [ ] 1.1 Add TOTP\n',
        'openspec/changes/add-mfa/specs/auth/spec.md': '# auth delta\n',
      }),
    ).toEqual(['openspec/changes/add-mfa/proposal', 'openspec/changes/add-mfa/specs/auth/spec', 'openspec/changes/add-mfa/tasks', 'openspec/specs/auth/spec']);
  });

  it('reads every Kiro feature, and a KEP by its number', () => {
    expect(
      ids({
        '.kiro/specs/user-auth/requirements.md': '# Requirements Document\n',
        '.kiro/specs/user-auth/tasks.md': '# Implementation Plan\n',
        '.kiro/specs/billing/requirements.md': '# Requirements Document\n',
        'keps/sig-auth/1234-token-rotation/README.md': '# KEP-1234: Token rotation\n',
        'keps/sig-auth/1250-audit/README.md': '# Audit events\n',
      }),
    ).toEqual(['.kiro/specs/billing/requirements', '.kiro/specs/user-auth/requirements', '.kiro/specs/user-auth/tasks', 'KEP-1234', 'KEP-1250']);
  });

  it('still binds a wiki link to the one document a name a template gave names', () => {
    const { diagnostics, graph } = analysed({
      'docs/design.md': '---\nstatus: accepted\n---\n\n# Design\n',
      'docs/notes.md': '---\nstatus: accepted\n---\n\n# Notes\n\nSee [[design]].\n',
    });
    expect(graph.out('notes').map((e) => e.to)).toEqual(['docs/design']);
    expect(diagnostics).toEqual([]);
  });
});
