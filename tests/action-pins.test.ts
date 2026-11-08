/**
 * The workflow a guide shows is held to the workflows this repository runs.
 *
 * The README pins the actions of its SARIF example by commit, as the workflows
 * here are pinned, and a pin copied by hand stays where it was copied:
 * Dependabot moves .github/workflows and reads no Markdown. A week after the
 * example was pinned the workflows had moved a major past it. So each action
 * a guide shows must carry the major version a workflow here runs, and never
 * a version ahead of it, which nothing here has run.
 *
 * The major and no closer (the maintainer's choice, 2026-11-02): held to the
 * commit, every patch Dependabot proposed for an action failed here until
 * someone copied it into the README by hand, and an example a patch behind
 * shows a reader nothing wrong. A pin at the version the workflows run must
 * still carry their commit, since one version has one commit; a pin behind
 * them carries a commit this test cannot check without the network. A major
 * bump still fails here until the example follows (.github/dependabot.yml
 * says what to do then). spec-core's test holds its guide the same way.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Actions a guide shows and no workflow here runs, each with the sibling whose
 * workflows do. No bump reaches these, so they follow that sibling's pin by
 * hand; the list is here so that an action joins it on purpose and leaves it
 * when a workflow here starts to run it.
 */
const FOLLOWS: Readonly<Record<string, string>> = {
  'github/codeql-action/upload-sarif': 'spec-guard',
};

interface Use {
  readonly where: string;
  /** What follows `uses:`, comment and all, as written. */
  readonly written: string;
}

/** Every `uses:` in `text` that names an action; a workflow called by its path is not one. */
function usesOf(text: string, file: string): Use[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const written = /^\s*(?:-\s+)?uses:\s+(\S.*?)\s*$/.exec(line)?.[1];
    return written === undefined || written.startsWith('./') ? [] : [{ where: `${file}:${index + 1}`, written }];
  });
}

/** `owner/action@commit # version`: the action, and the pin a reader copies. */
function pinOf(written: string): { action: string; pin: string } | null {
  const match = /^([\w.-]+(?:\/[\w.-]+)+)@([0-9a-f]{40} # v\d+\.\d+\.\d+)$/.exec(written);
  return match === null ? null : { action: match[1]!, pin: match[2]! };
}

const commitOf = (pin: string): string => pin.slice(0, pin.indexOf(' # v'));
const versionOf = (pin: string): number[] => pin.slice(pin.indexOf('# v') + 3).split('.').map(Number);

/** Whether pin `a` carries a later version than pin `b`. */
function newer(a: string, b: string): boolean {
  const [x, y] = [versionOf(a), versionOf(b)];
  const at = x.findIndex((part, index) => part !== y[index]);
  return at !== -1 && x[at]! > y[at]!;
}

/**
 * What is wrong with a guide's pin `shown` of an action the workflows here pin
 * at `here`, or null: another major, a version ahead of theirs, or their
 * version at another commit.
 */
function faultOf(shown: string, here: string): string | null {
  const [major, theirs] = [versionOf(shown)[0], versionOf(here)[0]];
  if (major !== theirs) return `v${major}, where the workflows run v${theirs} (${here})`;
  if (newer(shown, here)) return `ahead of the workflows, which run ${here}`;
  if (versionOf(shown).join('.') === versionOf(here).join('.') && commitOf(shown) !== commitOf(here)) {
    return `another commit than the workflows have for that version (${here})`;
  }
  return null;
}

const read = (path: string): string => readFileSync(path, 'utf8');

/**
 * The Markdown a reader copies from: every file but the records. The
 * changelog and the ADRs say what was so on their date, and a pin quoted
 * there is not an example to keep current.
 */
function guides(): string[] {
  const below = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) return entry.name === 'adr' ? [] : below(`${directory}/${entry.name}`);
      return entry.name.endsWith('.md') ? [`${directory}/${entry.name}`] : [];
    });
  const top = readdirSync('.').filter((name) => name.endsWith('.md') && name !== 'CHANGELOG.md');
  return [...top, ...below('docs')].sort();
}

describe('a pin a guide shows, beside the pin the workflows have', () => {
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);

  it('passes at the major the workflows run, behind them or at their pin', () => {
    expect(faultOf(`${A} # v7.0.1`, `${B} # v7.1.0`)).toBeNull();
    expect(faultOf(`${A} # v7.1.0`, `${B} # v7.1.2`)).toBeNull();
    expect(faultOf(`${B} # v7.1.0`, `${B} # v7.1.0`)).toBeNull();
  });

  it('fails another major, either way', () => {
    expect(faultOf(`${A} # v6.4.0`, `${B} # v7.0.1`)).toBe(`v6, where the workflows run v7 (${B} # v7.0.1)`);
    expect(faultOf(`${A} # v8.0.0`, `${B} # v7.0.1`)).toBe(`v8, where the workflows run v7 (${B} # v7.0.1)`);
  });

  it('fails a version ahead of the workflows, by a minor or a patch', () => {
    expect(faultOf(`${A} # v7.2.0`, `${B} # v7.1.9`)).toBe(`ahead of the workflows, which run ${B} # v7.1.9`);
    expect(faultOf(`${A} # v7.1.3`, `${B} # v7.1.2`)).toBe(`ahead of the workflows, which run ${B} # v7.1.2`);
  });

  it("fails the workflows' version at another commit", () => {
    expect(faultOf(`${A} # v7.1.0`, `${B} # v7.1.0`)).toBe(`another commit than the workflows have for that version (${B} # v7.1.0)`);
  });
});

describe('the workflows the guides show', () => {
  const shown = guides().flatMap((file) => usesOf(read(file), file));
  const run = readdirSync('.github/workflows')
    .filter((name) => /\.ya?ml$/.test(name))
    .flatMap((name) => usesOf(read(`.github/workflows/${name}`), name));

  /**
   * Each action the workflows here run, with the newest pin they have for it.
   * Dependabot moves every workflow at once, so there is one; where a hand
   * has moved a single workflow, that one is where the rest are going.
   */
  const pinned = new Map<string, string>();
  for (const { written } of run) {
    const use = pinOf(written);
    const held = use === null ? undefined : pinned.get(use.action);
    if (use !== null && (held === undefined || newer(use.pin, held))) pinned.set(use.action, use.pin);
  }

  it('are found, and so are the workflows they are held to', () => {
    // A guide that moved, or a line this file no longer reads, would leave
    // the checks below nothing to fail on.
    expect(shown.map((use) => use.where.split(':')[0])).toContain('README.md');
    expect([...pinned.keys()]).toEqual(expect.arrayContaining(['actions/checkout', 'actions/setup-node']));
  });

  it('pin every action to a commit, with its version beside it', () => {
    expect(shown.filter((use) => pinOf(use.written) === null).map((use) => `${use.where}: ${use.written}`)).toEqual([]);
  });

  it('pin each action at the major the workflows here run, and never ahead of them', () => {
    const faults = shown.flatMap((use) => {
      const { action, pin } = pinOf(use.written) ?? { action: '', pin: '' };
      const here = pinned.get(action);
      const fault = here === undefined ? null : faultOf(pin, here);
      return fault === null ? [] : [`${use.where}: ${action}@${pin} is ${fault}`];
    });
    expect(faults).toEqual([]);
  });

  it('show an action no workflow here runs only where the sibling it follows is named', () => {
    const unheld = new Set(shown.flatMap((use) => pinOf(use.written)?.action ?? []).filter((action) => !pinned.has(action)));
    expect([...unheld].sort()).toEqual(Object.keys(FOLLOWS).sort());
  });
});
