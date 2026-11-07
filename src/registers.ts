/**
 * A register kept as a table, held to its status vocabulary (ADR-0027).
 *
 * spec-graph reads every such row as a specification named by its key
 * (ADR-0009). A register the configuration names is held further: each row's
 * status is a word the configuration knows, a row has what its status asks
 * for, and the rows still open are listed. Pure: the rules and the report
 * read what this answers.
 */

import { createGlobMatcher } from './glob.js';
import type { ResolvedCorpus } from './resolve.js';
import { isEmptyCell } from './sections.js';
import type { DocumentNode, RegisterNeed, RegistersConfig } from './types.js';

export type { RegisterNeed } from './types.js';

export const REGISTER_NEEDS: readonly RegisterNeed[] = ['resolution', 'citation', 'commit'];

export interface RegisterStatus {
  /** The status closes the row: it is no obligation and is not listed as open. */
  readonly closes: boolean;
  readonly needs: readonly RegisterNeed[];
}

/** A configured register check, ready to ask. */
export interface RegisterCheck {
  readonly isRegister: (path: string) => boolean;
  /** The header of the column a resolution is written in, in lower case, or `null` where none is named. */
  readonly resolution: string | null;
  /** Each status word in lower case. */
  readonly statuses: ReadonlyMap<string, RegisterStatus>;
}

/** Builds the check from the configuration, or nothing where no register is configured. */
export function createRegisterCheck(config: RegistersConfig | undefined): RegisterCheck | undefined {
  if (config === undefined) return undefined;
  const statuses = new Map<string, RegisterStatus>();
  for (const [word, status] of Object.entries(config.statuses)) {
    statuses.set(word.toLowerCase(), { closes: status.closes === true, needs: status.needs ?? [] });
  }
  return { isRegister: createGlobMatcher(config.files), resolution: config.resolution?.toLowerCase() ?? null, statuses };
}

/**
 * The word a row's status opens with, in lower case: `done` of
 * `done: the refund rules (commit "...")`, of `done, as two types` and of
 * `Done`. Empty for a row with no status.
 */
export function statusWord(rawStatus: string | null): string {
  return (rawStatus ?? '').trim().split(/[\s:;,(]/)[0]!.toLowerCase();
}

/** A register's rows by status, and the ones still open, for the report and JSON. */
export interface RegisterSummary {
  readonly file: string;
  /** How many rows hold each status word, in the configuration's order, unknown words after. */
  readonly statuses: Readonly<Record<string, number>>;
  /** Each row whose status leaves it open, in the order the register writes them. */
  readonly open: readonly { readonly key: string; readonly status: string; readonly line: number }[];
}

/** The rows of the configured registers a run read: a table's rows, each a specification. */
export function registerRows(corpus: ResolvedCorpus, check: RegisterCheck): DocumentNode[] {
  return corpus.documents.filter((document) => corpus.rows.has(document.id) && check.isRegister(document.at.file));
}

/**
 * Each configured register the run read, with its rows by status and the
 * open ones listed. A row whose status no configured word names is open:
 * nothing says it was settled, and \`unknown-register-status\` says why.
 */
export function summariseRegisters(corpus: ResolvedCorpus, check: RegisterCheck): RegisterSummary[] {
  const byFile = new Map<string, { statuses: Record<string, number>; open: { key: string; status: string; line: number }[] }>();
  for (const row of registerRows(corpus, check)) {
    const file = row.at.file;
    const entry = byFile.get(file) ?? { statuses: Object.fromEntries([...check.statuses.keys()].map((word) => [word, 0])), open: [] };
    byFile.set(file, entry);
    const word = statusWord(row.rawStatus);
    entry.statuses[word] = (entry.statuses[word] ?? 0) + 1;
    if (check.statuses.get(word)?.closes !== true) entry.open.push({ key: row.id, status: word, line: row.at.span.start.line });
  }
  return [...byFile].map(([file, entry]) => ({ file, statuses: entry.statuses, open: entry.open }));
}

/** What a row is missing of what its status asks for, in the order the needs are listed. */
export function missingOf(row: DocumentNode, corpus: ResolvedCorpus, check: RegisterCheck, status: RegisterStatus): RegisterNeed[] {
  const missing: RegisterNeed[] = [];
  const cells = corpus.rows.get(row.id)!.cells;
  for (const need of status.needs) {
    if (need === 'resolution') {
      const cell = cells.find((candidate) => candidate.header.toLowerCase() === check.resolution);
      if (cell === undefined || isEmptyCell(cell.text)) missing.push(need);
    } else if (need === 'citation') {
      if (!citesInStatus(row, corpus)) missing.push(need);
    } else if (!corpus.commits.some((citation) => citation.owner === row.id)) {
      missing.push(need);
    }
  }
  return missing;
}

/**
 * Whether the row's status cell cites something: a reference that resolved,
 * or one that did not, which \`broken-reference\` reports, so that a row whose
 * one citation is mistyped is one finding and not two.
 */
function citesInStatus(row: DocumentNode, corpus: ResolvedCorpus): boolean {
  // A row with no status asks for nothing, so every row asked about has one.
  const status = row.statusAt!.span;
  // A citation is declared at its target, inside the cell and at neither of
  // its edges, so `>` for the `>=` and `<=` for the `<` answer alike. A row
  // contains nothing, so every edge from one is a citation.
  const inside = (at: { readonly span: { readonly start: { readonly offset: number } } }): boolean =>
    at.span.start.offset >= status.start.offset && at.span.start.offset < status.end.offset;
  return (
    corpus.edges.some((edge) => edge.from === row.id && inside(edge.declaredAt)) ||
    corpus.dangling.some((ref) => ref.from === row.id && inside(ref.declaredAt))
  );
}
