/**
 * The commits a ref's history holds, and whether a commit a document names is
 * among them.
 *
 * Pure: `git.ts` reads the log, the one place a run starts a process, and
 * this reads what it read, so a test hands it a log written by hand and a
 * caller of `analyseSources` hands it whatever history it has (ADR-0025).
 */

/** The history of one ref: every commit's id and every commit's subject. */
export interface CommitHistory {
  /** The ref as configured, for the message that says a commit is not in it. */
  readonly ref: string;
  /** Each commit's full id in lower case, sorted, so a prefix is looked up by bisection. */
  readonly hashes: readonly string[];
  /** Each commit's subject line, as written. */
  readonly subjects: ReadonlySet<string>;
}

/** A commit a document names, as spec-core's `findCommitReferences` reads one. */
export interface CommitName {
  readonly kind: 'subject' | 'hash';
  /** The subject as written between the quotes, or the hash in lower case. */
  readonly value: string;
}

/** The unit separator `git log --format=%H%x1f%s` puts between an id and its subject. */
const SEPARATOR = '\u001f';

/**
 * Reads the output of `git log --format=%H%x1f%s <ref>`: one commit to a
 * line, its id, the separator, and its subject. A subject holds no line
 * terminator, since git reads the subject as the message up to its first
 * blank line and joins what it holds into one line.
 */
export function historyOf(ref: string, log: string): CommitHistory {
  const hashes: string[] = [];
  const subjects = new Set<string>();
  for (const line of log.split(/\r?\n/)) {
    const at = line.indexOf(SEPARATOR);
    if (at === -1) continue;
    hashes.push(line.slice(0, at).toLowerCase());
    subjects.add(line.slice(at + 1));
  }
  hashes.sort();
  return { ref, hashes, subjects };
}

/**
 * Whether the history holds the commit: one whose subject is the one named,
 * exactly, or whose id starts with the hash named. A prefix two commits share
 * names a commit the history holds, so it is held: git would ask which, and
 * neither is missing.
 */
export function holdsCommit(history: CommitHistory, name: CommitName): boolean {
  if (name.kind === 'subject') return history.subjects.has(name.value);
  // The first id at or after the prefix in sorted order is the one that
  // starts with it, if any does.
  const { hashes } = history;
  let low = 0;
  let high = hashes.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (hashes[mid]! < name.value) low = mid + 1;
    else high = mid;
  }
  return low < hashes.length && hashes[low]!.startsWith(name.value);
}
