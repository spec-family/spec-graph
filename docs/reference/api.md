# Programmatic API

```ts
import { analyse, formatReport } from '@spec-family/spec-graph';

const result = await analyse({ root: process.cwd(), patterns: ['docs/**/*.md'] });
if (!result.ok) console.error(formatReport(result, { color: true }));
```

The filesystem is optional. Everything below the runner is a pure function of
text, so a monorepo tool or a language server can skip disk entirely:

```ts
import { analyseSources, query } from '@spec-family/spec-graph';

const { graph, diagnostics } = analyseSources([{ path: 'adr/0001.md', text: source }]);
const ghosts = query(graph, 'item[openness=open] -delegates-to-> document[phase=retired]');
```

The graph, the scanner, the selector engine and every vocabulary table are
exported. Reporters, editor extensions and custom rules are all first-class.

The command line is `main`, which takes the line and the directory it was
typed in: `await main({ argv: ['check', '--root', 'docs'], cwd })` reads
`docs`, its configuration and any baseline beside it from `cwd`, and walks
up from `cwd` for a configuration where no `--root` is given. Left out,
`cwd` is the process's working directory, as for the `spec-graph` command;
a relative `cwd` is read from that directory.
