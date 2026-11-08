import { mkdir, rm, writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { EXIT_FAILED, EXIT_OK, main } from '../src/cli.js';
import { commandIn, namesIn, recipesOf, scriptsOf, targetsOf, type CommandKind } from '../src/commands.js';
import type { Manifest } from '../src/rules.js';
import { analyseSources, createManifestReader, createOrientationCheck } from '../src/runner.js';

/**
 * A command an orientation document names runs a script, target or recipe its
 * manifest declares (ADR-0029, amended 2026-11-08). Only npm, pnpm, yarn,
 * make and just, only in a code span, and nothing this cannot tell.
 */

const doc = (...lines: string[]): string => [...lines, ''].join('\n');

describe('the command a code span names', () => {
  it.each([
    ['npm run lint', 'npm script lint'],
    ['npm run-script test:unit -- --watch', 'npm script test:unit'],
    ['npm test', 'npm script test'],
    ['npm t', 'npm script test'],
    ['pnpm lint', 'pnpm script lint'],
    ['pnpm run build', 'pnpm script build'],
    ['pnpm test', 'pnpm script test'],
    ['pnpm t', 'pnpm script test'],
    ['yarn lint --fix', 'yarn script lint'],
    ['yarn run build', 'yarn script build'],
    ['yarn test', 'yarn script test'],
    ['make build test', 'make target build,test'],
    ['make check VERBOSE=1', 'make target check'],
    ['just check', 'just recipe check'],
    ['just deploy staging', 'just recipe deploy'],
    ['  npm   run   lint  ', 'npm script lint'],
    // A name that ends like a flag, and a flag that only begins like one that moves the command.
    ['npm run build-w', 'npm script build-w'],
    ['npm test -- --dirty', 'npm script test'],
  ])('reads `%s`', (text, expected) => {
    const command = commandIn(text);
    expect(command === null ? null : `${command.tool} ${command.kind} ${command.names.join(',')}`).toBe(expected);
  });

  it.each([
    ['another tool', 'npx tsc'],
    ['a tool alone', 'npm'],
    ['npm with no script', 'npm run'],
    ['an npm command', 'npm install'],
    ['npm start, which may run server.js', 'npm start'],
    ['a pnpm command', 'pnpm install'],
    ['pnpm start', 'pnpm start'],
    ['pnpm exec', 'pnpm exec vitest'],
    ['pnpm alone', 'pnpm'],
    ['a flag before the name', 'pnpm --silent lint'],
    ['a yarn command', 'yarn add vitest'],
    ['yarn alone, which installs', 'yarn'],
    ['a workspace', 'yarn workspace api build'],
    ['an npm workspace', 'npm run build --workspace=api'],
    ['an npm workspace, spelled short', 'npm run build -w api'],
    ['every workspace', 'npm test --workspaces'],
    ['a pnpm filter', 'pnpm --filter api build'],
    ['a pnpm filter, spelled short', 'pnpm -F api build'],
    ['pnpm, recursive', 'pnpm -r build'],
    ['a prefix', 'npm run build --prefix api'],
    ['another directory', 'pnpm -C api build'],
    ['a yarn directory', 'yarn --cwd api build'],
    ['a script that may be missing', 'npm run lint --if-present'],
    ['make with no target', 'make'],
    ['make with a flag', 'make -C api build'],
    ['make with a flag that moves nothing', 'make -j4 build'],
    ['make with only a variable', 'make V=1'],
    ['just with no recipe', 'just'],
    ['just with a flag', 'just --list'],
    ['a just module path', 'just api::build'],
    ['a just override', 'just mode=release build'],
    ['two commands', 'npm run lint && npm test'],
    ['a pipe', 'npm run build | tee out'],
    ['a sequence', 'make build; make test'],
    ['a placeholder', 'npm run <script>'],
    ['a placeholder in brackets', 'make [target]'],
    ['a placeholder in braces', 'just {recipe}'],
    ['a variable', 'npm run $SCRIPT'],
    ['a subshell', 'make $(TARGET)'],
    ['an assignment before the tool', 'CI=1 npm test'],
    ['an ellipsis', 'npm run ...'],
    ['a sentence', 'run the linter'],
  ])('reads nothing from %s', (_, text) => {
    expect(commandIn(text)).toBeNull();
  });
});

describe('the scripts of a package.json', () => {
  it('are its scripts, and none where it has none', () => {
    expect([...scriptsOf('{ "scripts": { "lint": "tsc", "test:unit": "vitest" } }')!]).toEqual(['lint', 'test:unit']);
    expect([...scriptsOf('{ "name": "x" }')!]).toEqual([]);
    expect([...scriptsOf('{ "scripts": ["lint"] }')!]).toEqual([]);
    expect([...scriptsOf('{ "scripts": null }')!]).toEqual([]);
  });

  it('are unknown where it is no JSON object', () => {
    for (const text of ['{ "scripts": ', '[]', 'null', '"lint"']) expect(scriptsOf(text), text).toBeNull();
  });
});

describe('the targets of a Makefile', () => {
  it('are each name before a colon, double or single, continued lines and comments read as make reads them', () => {
    const makefile = [
      '# build: is a comment',
      'VERSION := 1.0',
      'CC ?= cc',
      'FLAGS += -O2',
      'OUT ::= dist',
      'SHA != git rev-parse HEAD',
      '.PHONY: build test',
      'build: deps ## the binary',
      '\tcc -o app main.c',
      'test check: build',
      '\t./run-tests: all',
      'clean::',
      'lint \\',
      '  format: deps',
      'define SCRIPT',
      'hidden: x',
      'endef',
      'release: VERSION = 2.0',
      'SITE = https://example.com',
      '  indented: x',
      'docs\\',
      'site: x',
      'define RULE :=',
      'endef',
      'redefine: x',
      'headers: include lib',
      'copy-include dist: x',
      'notes:',
      '\t@echo define the schema',
      'after: notes',
      'define TEMPLATE',
      'notendef: here',
      'inside: x',
      'endef',
      'ifeq ($(CI),1)',
      'ci: test',
      'endif',
      '',
    ].join('\n');
    expect([...targetsOf(makefile)!].sort()).toEqual(
      ['.PHONY', 'after', 'build', 'check', 'ci', 'clean', 'copy-include', 'dist', 'docs', 'format', 'headers', 'indented', 'lint', 'notes', 'redefine', 'release', 'site', 'test'],
    );
  });

  it('are read across CRLF line ends', () => {
    expect([...targetsOf('build:\r\n\tcc\r\ntest: build\r\nlint \\\r\n  format: x\r\n')!]).toEqual(['build', 'test', 'lint', 'format']);
  });

  it('are unknown where it includes a file, evaluates text, or names a target by a pattern or a variable', () => {
    for (const text of ['include common.mk\nbuild:\n', '-include local.mk\n', 'sinclude x.mk\n', '$(eval $(call rule,x))\n', '%.o: %.c\n', '$(BIN): main.c\n']) {
      expect(targetsOf(text), text).toBeNull();
    }
    // A word that only begins like one is none of them.
    expect([...targetsOf('included: x\nevaluate: y\n')!]).toEqual(['included', 'evaluate']);
  });
});

describe('the recipes of a justfile', () => {
  it('are each recipe and alias, quiet or with parameters and dependencies, and no setting, export or assignment', () => {
    const justfile = [
      'set shell := ["bash", "-c"]',
      'set dotenv-load',
      'export RUST_LOG := "debug"',
      'version := "1.0"',
      'alias t := test',
      '# build: a comment',
      '[private]',
      'build:',
      '  cargo build',
      '@quiet:',
      '    echo quiet: yes',
      'test filter="" *args: build',
      'serve port="http://localhost:8000": build',
      '_helper:',
      '  go mod tidy',
      '# alias old := build',
      'alias  dbg:= build',
      '',
    ].join('\n');
    expect([...recipesOf(justfile)!].sort()).toEqual(['_helper', 'build', 'dbg', 'quiet', 'serve', 't', 'test']);
    expect([...recipesOf('build:\r\n  cargo build\r\ntest: build\r\n')!]).toEqual(['build', 'test']);
  });

  it('are unknown where it imports a file or a module', () => {
    for (const text of ["import 'ci.just'\n", "import? 'local.just'\n", 'mod api\n', "mod? web 'web/justfile'\n"]) expect(recipesOf(text), text).toBeNull();
    expect([...recipesOf('important:\n  echo\nmodule:\n')!]).toEqual(['important', 'module']);
  });

  it('are read by the kind a command runs', () => {
    expect([...namesIn('script', '{"scripts":{"a":"x"}}')!]).toEqual(['a']);
    expect([...namesIn('target', 'b:\n')!]).toEqual(['b']);
    expect([...namesIn('recipe', 'c:\n')!]).toEqual(['c']);
  });
});

/** A manifest lookup over files kept in memory, as `createManifestReader` reads them from disk. */
function manifests(files: Record<string, string>): (directory: string, kind: CommandKind) => Manifest | undefined {
  const names: Record<CommandKind, string[]> = { script: ['package.json'], target: ['Makefile'], recipe: ['justfile'] };
  return (directory, kind) => {
    for (let at = directory; ; at = at.includes('/') ? at.slice(0, at.lastIndexOf('/')) : '') {
      for (const name of names[kind]) {
        const file = at === '' ? name : `${at}/${name}`;
        if (files[file] !== undefined) return { file, names: namesIn(kind, files[file]) };
      }
      if (at === '') return undefined;
    }
  };
}

const PACKAGE = JSON.stringify({ scripts: { lint: 'tsc', test: 'vitest', build: 'tsc -p .' } });

function findings(documents: Record<string, string>, files: Record<string, string> = { 'package.json': PACKAGE }, present: ReadonlySet<string> = new Set()) {
  return analyseSources(
    Object.entries(documents).map(([path, text]) => ({ path, text })),
    {
      orientation: createOrientationCheck({ files: ['CLAUDE.md', 'docs/*-brief.md'] }),
      fileExists: (path) => present.has(path),
      manifestFor: manifests(files),
    },
  ).diagnostics.filter((d) => d.rule === 'missing-command');
}

const lines = (found: ReturnType<typeof findings>): string[] => found.map((d) => `${d.at.file}:${d.at.span.start.line}:${d.at.span.start.column} ${d.message}`);

describe('a command an orientation document names', () => {
  it('passes running a name its manifest declares', () => {
    expect(findings({ 'CLAUDE.md': doc('# Claude', '', 'Run `npm run lint`, `pnpm test`, `yarn build` and `npm test`.') })).toEqual([]);
  });

  it('fails a script the nearest package.json does not declare, at the code span, saying which to run instead', () => {
    const [found, ...rest] = findings({ 'CLAUDE.md': doc('# Claude', '', 'Check with `npm run lnt` first.') });
    expect(rest).toEqual([]);
    expect(lines([found!])).toEqual(['CLAUDE.md:3:12 `npm run lnt` runs the script "lnt", which package.json does not declare']);
    expect(found).toMatchObject({
      severity: 'error',
      target: 'lnt',
      nodes: ['CLAUDE'],
      hint: 'run one package.json declares, build, lint and test, or mark it in the document: <!-- @spec-command created="lnt" --> for one this work creates',
    });
  });

  it('reads the package.json nearest the document, and the root\'s where none is nearer', () => {
    const files = { 'package.json': PACKAGE, 'docs/package.json': JSON.stringify({ scripts: { docs: 'x' } }) };
    expect(lines(findings({ 'docs/ops-brief.md': doc('# Brief', '', '`npm run docs`, not `npm run lint`.') }, files))).toEqual([
      'docs/ops-brief.md:3:21 `npm run lint` runs the script "lint", which docs/package.json does not declare',
    ]);
    expect(findings({ 'CLAUDE.md': doc('# Claude', '', '`npm run lint`') }, files)).toEqual([]);
  });

  it('fails a make target and a just recipe their files do not declare, each name of a make line', () => {
    const files = { Makefile: 'build:\n\tcc\n', justfile: 'check:\n  cargo check\n' };
    expect(lines(findings({ 'CLAUDE.md': doc('# Claude', '', '`make build test` and `just check`, `just lint`.') }, files))).toEqual([
      'CLAUDE.md:3:1 `make build test` runs the target "test", which Makefile does not declare',
      'CLAUDE.md:3:37 `just lint` runs the recipe "lint", which justfile does not declare',
    ]);
  });

  it('says to add the name where the manifest declares none, and lists eight names and how many more', () => {
    expect(findings({ 'CLAUDE.md': doc('# Claude', '', '`npm test`') }, { 'package.json': '{}' })[0]?.hint).toBe(
      'add it to package.json, which declares none, or mark it in the document: <!-- @spec-command created="test" --> for one this work creates',
    );
    const many = JSON.stringify({ scripts: Object.fromEntries('abcdefghij'.split('').map((name) => [name, 'x'])) });
    expect(findings({ 'CLAUDE.md': doc('# Claude', '', '`npm run z`') }, { 'package.json': many })[0]?.hint).toBe(
      'run one package.json declares, a, b, c, d, e, f, g, h and 2 more, or mark it in the document: <!-- @spec-command created="z" --> for one this work creates',
    );
    const eight = JSON.stringify({ scripts: Object.fromEntries('abcdefgh'.split('').map((name) => [name, 'x'])) });
    expect(findings({ 'CLAUDE.md': doc('# Claude', '', '`npm run z`') }, { 'package.json': eight })[0]?.hint).toBe(
      'run one package.json declares, a, b, c, d, e, f, g and h, or mark it in the document: <!-- @spec-command created="z" --> for one this work creates',
    );
  });

  it('is not looked for where no manifest is there, or one may declare more than it says', () => {
    expect(findings({ 'CLAUDE.md': doc('# Claude', '', '`npm run lnt` and `make tset`') }, {})).toEqual([]);
    expect(findings({ 'CLAUDE.md': doc('# Claude', '', '`make tset`') }, { Makefile: 'include rules.mk\n' })).toEqual([]);
    expect(findings({ 'CLAUDE.md': doc('# Claude', '', '`npm run lnt`') }, { 'package.json': '{ not json' })).toEqual([]);
  });

  it('is not looked for where the document marks the name as one its work creates', () => {
    const text = doc('# Claude', '', '<!-- @spec-command created="bench, profile" -->', '', 'Then `npm run bench` and `npm run profile`, not `npm run lnt`.');
    expect(findings({ 'CLAUDE.md': text }).map((d) => d.target)).toEqual(['lnt']);
  });

  it('is no make target missing where a file of its name, or one a built-in rule makes it from, is beside the Makefile', () => {
    const present = new Set(['docs/hello.c', 'docs/dist', 'docs/install.sh']);
    const brief = doc('# Brief', '', '`make hello`, `make dist`, `make install` and `make clean`.');
    expect(findings({ 'docs/ops-brief.md': brief }, { 'docs/Makefile': 'build:\n' }, present).map((d) => d.target)).toEqual(['clean']);
    // Beside the Makefile, not beside the document.
    expect(findings({ 'docs/ops-brief.md': brief }, { Makefile: 'build:\n' }, present).map((d) => d.target)).toEqual(['hello', 'dist', 'install', 'clean']);
    // And for make alone: a file named as a script stands for no script.
    expect(findings({ 'CLAUDE.md': doc('# Claude', '', '`npm run lnt`') }, { 'package.json': PACKAGE }, new Set(['lnt', 'lnt.sh'])).map((d) => d.target)).toEqual(['lnt']);
  });

  it('is allowed undeclared by @spec-command alone, not by a path another directive marks', () => {
    const text = doc('# Claude', '', '<!-- @spec-path created="lnt" external="lnt" -->', '', '`npm run lnt`');
    expect(findings({ 'CLAUDE.md': text }).map((d) => d.target)).toEqual(['lnt']);
  });

  it('is read out of a span of two backticks as written inside it, and not from one holding a backtick', () => {
    expect(lines(findings({ 'CLAUDE.md': doc('# Claude', '', 'Run ``  npm run lnt  ``, not `` npm run l`nt ``.') }))).toEqual([
      'CLAUDE.md:3:5 `npm run lnt` runs the script "lnt", which package.json does not declare',
    ]);
  });

  it('holds a make target to its Makefile alone where nothing says which files are there', async () => {
    // A caller of runRules with no pathExists: no file is looked for beside the Makefile.
    const { buildGraph } = await import('../src/graph.js');
    const { runRules } = await import('../src/rules.js');
    const { corpus, graph } = analyseSources([{ path: 'CLAUDE.md', text: doc('# Claude', '', '`make hello`') }], {
      orientation: createOrientationCheck({ files: ['CLAUDE.md'] }),
      fileExists: () => true,
    });
    const found = runRules(buildGraph({ nodes: corpus.nodes, edges: corpus.edges }), corpus, { manifestFor: manifests({ Makefile: 'build:\n' }) });
    expect(found.map((d) => `${d.rule} ${d.target}`)).toEqual(['missing-command hello']);
    expect(graph.documents.map((d) => d.id)).toEqual(['CLAUDE']);
  });

  it('is read only in an orientation document, and only in a code span', () => {
    expect(findings({ 'docs/guide.md': doc('# Guide', '', '`npm run lnt`'), 'CLAUDE.md': doc('# Claude', '', 'Run npm run lnt.', '', '```bash', 'npm run lnt', '```') })).toEqual([]);
  });

  it('is looked for by nobody where no manifest lookup is given', () => {
    const result = analyseSources([{ path: 'CLAUDE.md', text: doc('# Claude', '', '`npm run lnt`') }], {
      orientation: createOrientationCheck({ files: ['CLAUDE.md'] }),
      fileExists: () => false,
    });
    expect(result.diagnostics).toEqual([]);
  });
});

describe('the manifest nearest a directory, read from disk', () => {
  it('is the nearest file of the kind, by the name the directory lists, and nothing above the root', async () => {
    const root = `tests/fixtures/.tmp/commands-${process.pid}`;
    await rm(root, { recursive: true, force: true });
    try {
      await mkdir(`${root}/docs/ops/makefile`, { recursive: true });
      await writeFile(`${root}/package.json`, PACKAGE);
      await writeFile(`${root}/docs/GNUmakefile`, 'gnu:\n');
      await writeFile(`${root}/docs/Makefile`, 'plain:\n');
      await writeFile(`${root}/docs/ops/.justfile`, 'ops:\n');
      const find = createManifestReader(root);
      expect(find('docs/ops', 'script')).toEqual({ file: 'package.json', names: new Set(['lint', 'test', 'build']) });
      // GNU make's order, and a directory named like a Makefile is none.
      expect(find('docs/ops', 'target')).toEqual({ file: 'docs/GNUmakefile', names: new Set(['gnu']) });
      expect(find('docs/ops', 'recipe')).toEqual({ file: 'docs/ops/.justfile', names: new Set(['ops']) });
      expect(find('docs', 'recipe')).toBeUndefined();
      expect(find('', 'target')).toBeUndefined();
      // A directory that is not there lists nothing, and the search goes on above it.
      expect(find('gone/away', 'script')?.file).toBe('package.json');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('is found under each name its tool reads, alone in a directory', async () => {
    const root = `tests/fixtures/.tmp/commands-names-${process.pid}`;
    await rm(root, { recursive: true, force: true });
    try {
      const names: readonly (readonly [string, CommandKind])[] = [
        ['makefile', 'target'],
        ['Makefile', 'target'],
        ['justfile', 'recipe'],
        ['Justfile', 'recipe'],
        ['JUSTFILE', 'recipe'],
      ];
      // Each in a directory of its own, named apart on a disk that folds case.
      for (const [at, [name]] of names.entries()) {
        await mkdir(`${root}/d${at}`, { recursive: true });
        await writeFile(`${root}/d${at}/${name}`, 'x:\n');
      }
      const find = createManifestReader(root);
      expect(names.map(([, kind], at) => find(`d${at}`, kind)?.file)).toEqual(names.map(([name], at) => `d${at}/${name}`));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('is what the command line holds an orientation document to', async () => {
    const root = `tests/fixtures/.tmp/commands-cli-${process.pid}`;
    await rm(root, { recursive: true, force: true });
    try {
      await mkdir(root, { recursive: true });
      await writeFile(`${root}/package.json`, PACKAGE);
      await writeFile(`${root}/.spec-graph.json`, JSON.stringify({ patterns: ['*.md'], orientation: { files: ['CLAUDE.md'] } }));
      const run = async (text: string): Promise<{ code: number; out: string }> => {
        await writeFile(`${root}/CLAUDE.md`, text);
        let out = '';
        const code = await main({ argv: ['check', '--format', 'json'], cwd: `${process.cwd()}/${root}`, stdout: (t) => (out += t), stderr: () => {}, env: { NO_COLOR: '1' }, isTTY: false });
        return { code, out };
      };
      expect((await run(doc('# Claude', '', 'Run `npm run lint`.'))).code).toBe(EXIT_OK);
      const failed = await run(doc('# Claude', '', 'Run `npm run lnt`.'));
      expect(failed.code).toBe(EXIT_FAILED);
      expect(JSON.parse(failed.out).diagnostics.map((d: { rule: string; target: string }) => [d.rule, d.target])).toEqual([['missing-command', 'lnt']]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
