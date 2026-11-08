/**
 * Orchestration: files in, graph and findings out.
 *
 * The only part of spec-graph that touches the filesystem. Everything below it
 * is a pure function of text, which is why the test suite can build pathological
 * corpora in memory and why a build script can feed spec-graph documents that
 * never existed on disk.
 */

import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { extractSpecifications, type ExtractedDocument } from './extract.js';
import { createGlobMatcher, createReferenceFilter, walkFiles, type WalkedFile } from './glob.js';
import { buildGraph, type SpecGraph } from './graph.js';
import { isFamilyName } from './identity.js';
import { toPosix } from './paths.js';
import { resolveCorpus, type ResolvedCorpus } from './resolve.js';
import type { ProjectRule } from './project-rules.js';
import { createRegisterCheck, summariseRegisters, type RegisterCheck, type RegisterSummary } from './registers.js';
import { holdsToCommits, runRules, type OrientationCheck, type ProtocolCheck, type RuleOptions } from './rules.js';
import { readHistory } from './git.js';
import { dispositionOfStateWord, KNOWN_STATE_WORDS } from './state.js';
import type { AnalysisSummary, AnyRuleId, ClaimsConfig, CommitCitation, Diagnostic, Disposition, OrientationConfig, ParseProblem, ProtocolsConfig, RegistersConfig, Severity } from './types.js';

/** Patterns used when the caller names none. */
export const DEFAULT_PATTERNS: readonly string[] = Object.freeze([
  'docs/**/*.md',
  'doc/**/*.md',
  'adr/**/*.md',
  'rfcs/**/*.md',
  'specs/**/*.md',
  // The layouts spec-driven-development tools write (ADR-0031).
  '.specify/memory/*.md',
  'openspec/**/*.md',
  '.kiro/specs/**/*.md',
  '*.md',
]);

/** How many files are read at once. */
export const DEFAULT_CONCURRENCY = 16;

export interface AnalyseOptions {
  /** Absolute or relative directory the patterns are resolved against. */
  readonly root: string;
  readonly patterns?: readonly string[] | undefined;
  readonly ignore?: readonly string[] | undefined;
  /**
   * Reference targets to leave unreported when they do not resolve.
   *
   * For repositories where `[[...]]` tags concepts rather than naming files.
   * Suppresses findings only; a reference that resolves is still an edge.
   */
  readonly ignoreReferences?: readonly string[] | undefined;
  /** Families a bare identifier may name. Unset means any family in the corpus. */
  readonly families?: readonly string[] | undefined;
  /** Families that are never citations, whatever the corpus contains. */
  readonly ignoreFamilies?: readonly string[] | undefined;
  /**
   * Files that are logs of what was decided rather than decisions.
   *
   * Journals, changelogs, meeting minutes, sprint summaries. Their references
   * are still checked; their obligations and lifecycle are not. See ADR-0011.
   */
  readonly historyPatterns?: readonly string[] | undefined;
  readonly severities?: Partial<Record<AnyRuleId, Severity>> | undefined;
  /** Conventions the repository wrote for itself. See ADR-0016. */
  readonly projectRules?: readonly ProjectRule[] | undefined;
  /** Which documents hold claims, and what each label means for work. See ADR-0024. */
  readonly claims?: ClaimsConfig | undefined;
  /** Documents whose done items must cite a claim or a commit. See ADR-0026. */
  readonly checklists?: readonly string[] | undefined;
  /** Documents whose done rows and items may not cite a claim left open. See ADR-0026. */
  readonly ledgers?: readonly string[] | undefined;
  /** The ref whose history a checked document's commits are looked for in; `HEAD` unless set. See ADR-0025. */
  readonly gitRef?: string | undefined;
  /** Registers held to a status vocabulary. See ADR-0027. */
  readonly registers?: RegistersConfig | undefined;
  /** Where measurement protocols are written, and what each must say. See ADR-0028. */
  readonly protocols?: ProtocolsConfig | undefined;
  /** The documents that orient a reader, held to the paths they name. See ADR-0029. */
  readonly orientation?: OrientationConfig | undefined;
  readonly concurrency?: number | undefined;
  readonly maxRelated?: number | undefined;
  readonly followSymlinks?: boolean | undefined;
}

export interface AnalysisResult {
  readonly graph: SpecGraph;
  readonly corpus: ResolvedCorpus;
  readonly diagnostics: readonly Diagnostic[];
  readonly problems: readonly ParseProblem[];
  readonly files: readonly string[];
  readonly summary: AnalysisSummary;
  /** True when nothing at error severity was found. */
  readonly ok: boolean;
  /** Each configured register's rows by status, and the open ones; absent where none is configured (ADR-0027). */
  readonly registers?: readonly RegisterSummary[] | undefined;
}

/** Reads, extracts, resolves, and checks a corpus of specifications. */
export async function analyse(options: AnalyseOptions): Promise<AnalysisResult> {
  const started = performance.now();
  // The walk strips the root again, and past it the root only prefixes an
  // existence check, where `docs//x.md` names what `docs/x.md` does - so a
  // mutant that strips one separator rather than all of them is equivalent.
  const root = toPosix(options.root).replace(/\/+$/, '');
  const patterns = options.patterns && options.patterns.length > 0 ? options.patterns : DEFAULT_PATTERNS;

  const walked = await walkFiles({
    root,
    patterns,
    ignore: options.ignore,
    followSymlinks: options.followSymlinks,
  });

  const sources = await readAll(walked, options.concurrency ?? DEFAULT_CONCURRENCY);
  const present = new Set(walked.map((file) => file.path.toLowerCase()));

  const checks = {
    claimsIn: createClaimReader(options.claims),
    isChecklist: createPathMatcher(options.checklists),
    isLedger: createPathMatcher(options.ledgers),
    registers: createRegisterCheck(options.registers),
    protocols: createProtocolCheck(options.protocols),
    orientation: createOrientationCheck(options.orientation),
  };
  const extracted = extractSources(sources, { ...checks, isRecord: createHistoryMatcher(options.historyPatterns) });
  // git is run only where a checked document names a commit (ADR-0025).
  const history = commitsToCheck(extracted, checks).length > 0 ? await readHistory(root, options.gitRef ?? 'HEAD') : undefined;

  return finish(
    analyseExtracted(extracted, {
      ...checks,
      history,
      // Consulted only for references that failed to resolve, so the cost is
      // bounded by the number of findings - and it buys the difference between
      // "that document does not exist" and "that document exists but your
      // include patterns did not reach it", which are different fixes.
      fileExists: (path) => present.has(path.toLowerCase()) || existsSync(`${root}/${path}`),
      isDirectory: (path) => statSync(`${root}/${path}`, { throwIfNoEntry: false })?.isDirectory() === true,
      // A stray entry in the empty fallback changes a run only for a reference
      // whose target it matches, so the mutant that plants one survives every
      // corpus but one written for it.
      isIgnoredReference: createReferenceFilter(options.ignoreReferences ?? []),
      isIgnoredFamily: createFamilyFilter(options.families, options.ignoreFamilies),
      severities: options.severities,
      projectRules: options.projectRules,
      maxRelated: options.maxRelated,
    }),
    walked.map((file) => file.path),
    started,
    checks.registers,
  );
}

export interface Source {
  /** Repository-relative POSIX path. */
  readonly path: string;
  readonly text: string;
}

export interface AnalyseSourcesOptions extends RuleOptions {
  readonly fileExists?: ((path: string) => boolean) | undefined;
  readonly isDirectory?: ((path: string) => boolean) | undefined;
  readonly isIgnoredReference?: ((target: string) => boolean) | undefined;
  readonly isIgnoredFamily?: ((family: string) => boolean) | undefined;
  /** Whether a path holds a historical record rather than a specification. */
  readonly isRecord?: ((path: string) => boolean) | undefined;
  /** The labels of the claims a path holds, with what each means, or nothing where it holds none. */
  readonly claimsIn?: ((path: string) => ReadonlyMap<string, Disposition> | undefined) | undefined;
}

/**
 * Builds the protocol check from the configuration, or nothing where none is
 * configured: which files hold protocols, under which heading, what each
 * must write, and which labels must cite one (ADR-0028).
 */
export function createOrientationCheck(config: OrientationConfig | undefined): OrientationCheck | undefined {
  if (config === undefined) return undefined;
  return { isOrientation: createGlobMatcher(config.files), extensions: config.extensions ?? [], roots: config.roots ?? [] };
}

/**
 * Builds the protocol check from the configuration, or nothing where none is
 * configured: which files hold protocols, under which heading, what each
 * must write, and which labels must cite one (ADR-0028).
 */
export function createProtocolCheck(config: ProtocolsConfig | undefined): ProtocolCheck | undefined {
  if (config === undefined) return undefined;
  return {
    holds: createGlobMatcher(config.files),
    heading: config.heading.trim().toLowerCase(),
    result: config.result.trim().toLowerCase(),
    resultName: config.result.trim(),
    fields: new Map(Object.entries(config.fields ?? {}).map(([anchor, names]) => [anchor.toLowerCase(), names])),
    claims: new Set(config.claims ?? []),
  };
}

/**
 * A predicate for a list of patterns, or nothing for none, as the history
 * matcher is: a check nobody configured costs no call per file.
 */
export function createPathMatcher(patterns: readonly string[] | undefined): ((path: string) => boolean) | undefined {
  if (patterns === undefined || patterns.length === 0) return undefined;
  return createGlobMatcher(patterns);
}

/**
 * Builds the reader of which documents hold claims, or nothing when none do.
 *
 * Throws for a label given a word that names no state, as a family filter
 * throws for a name no family has: the label would mean nothing, and its
 * claims would read as open or closed by a guess (ADR-0024).
 */
export function createClaimReader(
  claims: ClaimsConfig | undefined,
): ((path: string) => ReadonlyMap<string, Disposition> | undefined) | undefined {
  if (claims === undefined) return undefined;
  const labels = new Map<string, Disposition>();
  for (const [label, word] of Object.entries(claims.labels)) {
    const disposition = dispositionOfStateWord(word);
    if (disposition === undefined) throw new Error(`claims: "${label}" is given "${word}", which names no state: give one of ${KNOWN_STATE_WORDS.join(', ')}`);
    labels.set(label, disposition);
  }
  const holds = createGlobMatcher(claims.files);
  return (path) => (holds(path) ? labels : undefined);
}

/**
 * Builds the record predicate, or nothing when no patterns were given.
 *
 * Returning `undefined` rather than a predicate that always says no keeps the
 * common case free of a call per file, and makes "no history patterns" visible
 * as an absent option rather than as a function nobody can read.
 */
export function createHistoryMatcher(patterns: readonly string[] | undefined): ((path: string) => boolean) | undefined {
  if (patterns === undefined || patterns.length === 0) return undefined;
  return createGlobMatcher(patterns);
}

/**
 * Builds the family predicate from an allowlist and a denylist.
 *
 * An allowlist is the stronger statement - "these are the families this
 * repository has" - and turns every other noun-number construct back into
 * prose. A denylist handles the narrower case where the corpus genuinely owns a
 * family but some of its numbers belong to somebody else, which is exactly
 * `RFC 2119` in a repository of local RFCs.
 *
 * Throws for a name no family has, as a pattern that is no glob throws: an
 * allowlist holding only `''` or `'ADR,RFC'` allowed nothing, and every
 * dangling citation went unreported.
 */
export function createFamilyFilter(
  families: readonly string[] | undefined,
  ignoreFamilies: readonly string[] | undefined,
): ((family: string) => boolean) | undefined {
  for (const name of [...(families ?? []), ...(ignoreFamilies ?? [])]) {
    if (!isFamilyName(name)) throw new Error(`"${name}" is not a family's name, such as ADR`);
  }
  const allowed = families && families.length > 0 ? new Set(families.map((f) => f.trim().toUpperCase())) : null;
  const denied = new Set((ignoreFamilies ?? []).map((f) => f.trim().toUpperCase()));
  if (allowed === null && denied.size === 0) return undefined;
  return (family: string): boolean => {
    const key = family.toUpperCase();
    if (denied.has(key)) return true;
    return allowed !== null && !allowed.has(key);
  };
}

interface Analysed {
  readonly graph: SpecGraph;
  readonly corpus: ResolvedCorpus;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * The whole engine, without a filesystem.
 *
 * Exported because it is the honest unit of composition: a monorepo tool that
 * already has the file contents in memory should not have to write them out to
 * a temporary directory to use spec-graph.
 */
export function analyseSources(sources: readonly Source[], options: AnalyseSourcesOptions = {}): Analysed {
  return analyseExtracted(extractSources(sources, options), options);
}

/** Reads each source into the specifications it holds, as the options say to read it. */
function extractSources(sources: readonly Source[], options: AnalyseSourcesOptions): ExtractedDocument[] {
  const extracted: ExtractedDocument[] = [];
  for (const source of sources) {
    extracted.push(
      ...extractSpecifications({
        path: source.path,
        text: source.text,
        record: options.isRecord?.(source.path) === true,
        claims: options.claimsIn?.(source.path),
        ledger: options.isLedger?.(source.path) === true,
        protocols: options.protocols?.holds(source.path) === true ? { heading: options.protocols.heading, result: options.protocols.result } : undefined,
        orientation: options.orientation?.isOrientation(source.path) === true ? { extensions: options.orientation.extensions } : undefined,
      }),
    );
  }
  return extracted;
}

/** The commits a checklist or a ledger names, which a history is needed to look for. */
function commitsToCheck(extracted: readonly ExtractedDocument[], options: AnalyseSourcesOptions): CommitCitation[] {
  return extracted.flatMap((entry) => entry.commits).filter((citation) => holdsToCommits(options, citation.at.file));
}

/**
 * The rest of a run, from what extraction read. Refuses to run without a
 * history where a checked document names a commit: what was not looked for
 * was not found, and passing it over would read as found (ADR-0025).
 */
function analyseExtracted(extracted: readonly ExtractedDocument[], options: AnalyseSourcesOptions): Analysed {
  if (options.history === undefined && commitsToCheck(extracted, options).length > 0) {
    throw new Error('a checklist, a ledger or a register names a commit, and no history was given to look for it in: pass "history"');
  }
  // What was not looked for was not found, and passing it over would read as found (ADR-0029).
  if (options.fileExists === undefined && extracted.some((entry) => entry.paths.length > 0)) {
    throw new Error('an orientation document names a path, and no fileExists was given to look for it: pass "fileExists"');
  }
  // Asked only of a path an orientation document names, which the refusal above holds a fileExists for.
  const pathExists = (path: string): boolean => options.fileExists!(path) || options.isDirectory?.(path) === true;
  const corpus = resolveCorpus(extracted, {
    fileExists: options.fileExists,
    isDirectory: options.isDirectory,
    isIgnoredReference: options.isIgnoredReference,
    isIgnoredFamily: options.isIgnoredFamily,
  });
  const graph = buildGraph({ nodes: corpus.nodes, edges: corpus.edges });
  const diagnostics = runRules(graph, corpus, { ...options, pathExists });
  return { graph, corpus, diagnostics };
}

function finish(analysed: Analysed, files: readonly string[], started: number, registers?: RegisterCheck): AnalysisResult {
  const { graph, corpus, diagnostics } = analysed;
  const counts = { error: 0, warn: 0, info: 0 };
  for (const diagnostic of diagnostics) counts[diagnostic.severity] += 1;
  const records = new Set(corpus.documents.filter((node) => node.phase === 'record').map((node) => node.id));

  const summary: AnalysisSummary = {
    documents: corpus.documents.length,
    items: corpus.items.length,
    edges: graph.edges.length,
    // A record's unchecked boxes are minutes, not work. Counting them would
    // make the headline number the one thing in the report nobody can act on.
    openObligations: corpus.items.filter((item) => item.openness !== 'closed' && !records.has(item.document)).length,
    errors: counts.error,
    warnings: counts.warn,
    infos: counts.info,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
  };

  return {
    graph,
    corpus,
    diagnostics,
    problems: corpus.problems,
    files,
    summary,
    ok: counts.error === 0,
    ...(registers === undefined ? {} : { registers: summariseRegisters(corpus, registers) }),
  };
}

/** Reads files with bounded concurrency, skipping ones that cannot be read. */
async function readAll(files: readonly WalkedFile[], concurrency: number): Promise<Source[]> {
  // Pre-sized for throughput only: the length is set to what was read below,
  // so an array that starts empty ends the same. That mutant is equivalent.
  const out: Source[] = new Array(files.length);
  let cursor = 0;
  let written = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      // `>` for `>=` lets one worker take the index past the end, whose read
      // throws inside the `try` below and is skipped like any unreadable file:
      // an equivalent mutant.
      if (index >= files.length) return;
      const file = files[index] as WalkedFile;
      try {
        const text = await readFile(file.absolute, 'utf8');
        out[written] = { path: file.path, text };
        written += 1;
      } catch {
        // A file that vanished or cannot be decoded is skipped, not fatal.
      }
    }
  };

  // How many workers there are, once there is one, changes throughput and
  // nothing a caller sees: one reads every file, and each worker past the last
  // file returns at once. The mutants that only move the count are equivalent,
  // and no test counts workers.
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, files.length || 1)) }, worker);
  await Promise.all(workers);
  out.length = written;
  // Deterministic order regardless of which worker finished first. The walk
  // hands over each path once, and the sort acts only on whether a comparison
  // is negative, so the mutants that change its answer for two equal paths, or
  // give 0 rather than 1 for a later one, sort the same.
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Rebuilds a result around a narrower set of findings.
 *
 * The corpus, the graph and the counts of what is in them are unchanged - a
 * baseline suppresses findings, never facts. Only the tallies that describe the
 * findings, and the verdict that follows from them, move.
 */
export function withDiagnostics(result: AnalysisResult, diagnostics: readonly Diagnostic[]): AnalysisResult {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const diagnostic of diagnostics) counts[diagnostic.severity] += 1;
  return {
    ...result,
    diagnostics,
    summary: { ...result.summary, errors: counts.error, warnings: counts.warn, infos: counts.info },
    ok: counts.error === 0,
  };
}
