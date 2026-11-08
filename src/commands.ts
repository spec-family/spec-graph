/**
 * The commands an orientation document names, and the names a repository's
 * manifests give them (ADR-0029, amended 2026-11-08).
 *
 * A switchboard tells the next reader to run `npm run lint` or `make check`,
 * and an agent that writes one names a script nobody wrote. Only five tools
 * are read, and only a command each runs by a name its own file declares:
 * a script of `package.json` for npm, pnpm and yarn, a target of the Makefile
 * for make, a recipe of the justfile for just. Anything this cannot tell -
 * a flag that moves to another package or file, a manifest that includes
 * another, a pattern rule, a variable - is left alone, since a false finding
 * costs more than a missed one (ADR-0006).
 *
 * Pure: the runner reads the files, and hands their text here.
 */

/** Which kind of name a command runs, and so which file declares it. */
export type CommandKind = 'script' | 'target' | 'recipe';

export interface Command {
  readonly tool: 'npm' | 'pnpm' | 'yarn' | 'make' | 'just';
  readonly kind: CommandKind;
  /** The names it runs, in order: one, or for make each target named. */
  readonly names: readonly string[];
}

/**
 * The files each kind is declared in, nearest first in a directory, in the
 * order the tool looks for them: GNU make reads `GNUmakefile`, `makefile`
 * and `Makefile`, and just any case of `justfile`, or `.justfile`.
 */
export const MANIFESTS: Readonly<Record<CommandKind, readonly string[]>> = {
  script: ['package.json'],
  target: ['GNUmakefile', 'makefile', 'Makefile'],
  recipe: ['justfile', 'Justfile', 'JUSTFILE', '.justfile'],
};

/**
 * pnpm's own commands and their short forms: `pnpm add` runs no script, and
 * any other word is `pnpm run` that word. `test` is not here: `pnpm test`
 * runs the `test` script.
 */
const PNPM_COMMANDS: ReadonlySet<string> = new Set([
  'add', 'approve-builds', 'audit', 'bin', 'c', 'cache', 'cat-file', 'cat-index', 'config', 'create', 'dedupe', 'deploy', 'dlx', 'doctor', 'env',
  'exec', 'fetch', 'find-hash', 'help', 'i', 'ignored-builds', 'import', 'init', 'install', 'install-test', 'it', 'licenses', 'link', 'list', 'ln',
  'ls', 'outdated', 'pack', 'patch', 'patch-commit', 'patch-remove', 'prune', 'publish', 'rb', 'rebuild', 'recursive', 'remove', 'rm', 'root',
  'self-update', 'server', 'setup', 'start', 'store', 'un', 'uninstall', 'unlink', 'up', 'update', 'upgrade', 'why',
]);

/**
 * yarn's own commands, classic's and berry's: `yarn add` runs no script, and
 * any other word runs the script of that name. `test` is not here: `yarn test`
 * runs the `test` script.
 */
const YARN_COMMANDS: ReadonlySet<string> = new Set([
  'add', 'autoclean', 'bin', 'cache', 'check', 'config', 'constraints', 'create', 'dedupe', 'dlx', 'exec', 'explain', 'generate-lock-entry',
  'global', 'help', 'import', 'info', 'init', 'install', 'licenses', 'link', 'list', 'login', 'logout', 'node', 'npm', 'outdated', 'owner',
  'pack', 'patch', 'patch-commit', 'plugin', 'policies', 'publish', 'rebuild', 'remove', 'set', 'start', 'tag', 'team', 'unlink', 'unplug',
  'up', 'upgrade', 'upgrade-interactive', 'version', 'versions', 'why', 'workspace', 'workspaces',
]);

/**
 * Flags that move a command to another package or skip a missing script:
 * the script is then another manifest's, or none is needed.
 */
const ELSEWHERE = /^(?:-w|-ws|-C|-F|-r|--workspaces?|--prefix|--dir|--cwd|--filter|--recursive|--workspace-root|--if-present)(?:=|$)/;

/** What makes a code span a shell line, a placeholder or a variable rather than one command. */
const NOT_ONE_COMMAND = /[;&|<>$`(){}[\]\\]/;

/**
 * The command a code span names, or `null` for one this does not read.
 *
 * `npm run lint`, `npm test`, `pnpm lint`, `yarn run build`, `make build
 * test` and `just check` are read; a line holding an operator, a placeholder
 * or a variable, an assignment before the tool, a flag before the name, and
 * a flag that moves the command elsewhere are not.
 */
export function commandIn(text: string): Command | null {
  if (NOT_ONE_COMMAND.test(text)) return null;
  const words = text.trim().split(/\s+/);
  const [tool, first] = words;
  if (words.some((word) => ELSEWHERE.test(word))) return null;
  const script = (name: string | undefined, kind: 'npm' | 'pnpm' | 'yarn'): Command | null =>
    name !== undefined && named(name) ? { tool: kind, kind: 'script', names: [name] } : null;
  switch (tool) {
    case 'npm':
      if (first === 'run' || first === 'run-script') return script(words[2], 'npm');
      return first === 'test' || first === 't' ? script('test', 'npm') : null;
    case 'pnpm':
      if (first === 'run') return script(words[2], 'pnpm');
      return first !== undefined && PNPM_COMMANDS.has(first) ? null : script(first === 't' ? 'test' : first, 'pnpm');
    case 'yarn':
      if (first === 'run') return script(words[2], 'yarn');
      return first !== undefined && YARN_COMMANDS.has(first) ? null : script(first, 'yarn');
    case 'make': {
      // `VAR=value` sets a variable for the run and names no target; a flag
      // is no name, so `make -C api build` is read as nothing.
      const targets = words.slice(1).filter((word) => !word.includes('='));
      return targets.length === 0 || !targets.every(named) ? null : { tool: 'make', kind: 'target', names: targets };
    }
    case 'just':
      // The words after the recipe may be its arguments, so only the first is a name.
      return first === undefined || !/^[A-Za-z_][\w-]*$/.test(first) ? null : { tool: 'just', kind: 'recipe', names: [first] };
    default:
      return null;
  }
}

/** A name, not a flag, and with a letter or a digit in it: `...` is a placeholder. */
function named(word: string): boolean {
  return !word.startsWith('-') && /[\p{L}\p{N}]/u.test(word);
}

/** The scripts a `package.json` declares, or `null` where it is no JSON object. */
export function scriptsOf(text: string): ReadonlySet<string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Left undefined, which the test below reads as no object.
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const scripts = (parsed as { scripts?: unknown }).scripts;
  return new Set(scripts !== null && typeof scripts === 'object' && !Array.isArray(scripts) ? Object.keys(scripts) : []);
}

/**
 * The targets a Makefile declares, or `null` where it may declare more than
 * it says: it includes another file, evaluates text as make, or names a
 * target by a pattern or a variable.
 *
 * A rule is a line, not indented by a tab, whose names stand before a `:`
 * that does not open `:=` or `::=`. Lines continued with `\` are read as one,
 * a `define` block is skipped, and a comment is no rule.
 */
export function targetsOf(text: string): ReadonlySet<string> | null {
  // A continuation joins two lines with a space, as make reads it, however
  // the second is indented. A carriage return alone ends no line to make.
  const lines = text.replace(/\\\r?\n/g, ' ').split(/\r?\n/);
  const names = new Set<string>();
  let defining = false;
  for (const line of lines) {
    if (defining) {
      if (/^\s*endef\b/.test(line)) defining = false;
      continue;
    }
    // A recipe line is shell, whatever words it holds: `\techo define` opens no block.
    if (line.startsWith('\t')) continue;
    // The line that opens a block is read on, and holds no rule: `define
    // NAME :=` writes its colon before an `=`.
    if (/^\s*define\b/.test(line)) defining = true;
    const code = line.split('#', 1)[0]!;
    if (/^\s*-?s?include\s/.test(code) || code.includes('$(eval')) return null;
    const rule = /^([^:=]+?)\s*::?(?![:=])/.exec(code);
    if (rule === null) continue;
    for (const name of rule[1]!.trim().split(/\s+/)) {
      if (name.includes('%') || name.includes('$')) return null;
      names.add(name);
    }
  }
  return names;
}

/**
 * The recipes a justfile declares, and its aliases, or `null` where it
 * imports another file or a module, whose recipes it cannot see.
 *
 * A recipe opens a line, as `name params: dependencies`, optionally quiet
 * with `@`; a setting, an export, an assignment and an attribute are not one.
 */
export function recipesOf(text: string): ReadonlySet<string> | null {
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (/^(?:import|mod)\??\s/.test(line)) return null;
    const alias = /^alias\s+([A-Za-z_][\w-]*)\s*:=/.exec(line);
    if (alias !== null) {
      names.add(alias[1]!);
      continue;
    }
    // A setting, an export and an assignment write `:=` before any other
    // colon, and the colon a recipe's header ends at is none.
    const recipe = /^@?([A-Za-z_][\w-]*)(?:\s[^:]*)?:(?!=)/.exec(line);
    if (recipe !== null) names.add(recipe[1]!);
  }
  return names;
}

/** The names a manifest's text declares, by the kind of name a command runs. */
export function namesIn(kind: CommandKind, text: string): ReadonlySet<string> | null {
  switch (kind) {
    case 'script':
      return scriptsOf(text);
    case 'target':
      return targetsOf(text);
    case 'recipe':
      return recipesOf(text);
  }
}

/**
 * The file names GNU make's built-in rules can make a target from, beside
 * the target's own name: `make hello` builds `hello` from `hello.c`, and a
 * file that is there already is a target that is up to date.
 */
export const IMPLICIT_SOURCES: readonly string[] = ['', '.c', '.cc', '.cpp', '.C', '.f', '.F', '.p', '.r', '.s', '.S', '.y', '.l', '.o', '.sh'];
