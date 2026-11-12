import { describe, expect, it } from 'vitest';

import type { Source } from '../src/runner.js';

/**
 * The anchors a document declares for itself, and an anchor written
 * percent-encoded.
 *
 * Round 29's evaluation found each reported as a broken reference on real
 * repositories: `<a id>` and `<a name>` marking a place no heading is,
 * kramdown's and Docusaurus's `{#custom-id}`, and `#%E6%A6%82%E8%A6%81`,
 * which is `## 概要` as GitHub's "copy link" writes it. The slug GitHub gives
 * a heading with an underscore in it, `#snake_case_name`, is spec-core's to
 * change, and is not here.
 *
 * The pipeline is imported inside each test: a module that throws while it
 * loads fails no test, and a sweep reads that as a survived mutant.
 */

async function broken(files: Record<string, string>): Promise<string[]> {
  const { analyseSources } = await import('../src/runner.js');
  return analyseSources(Object.entries(files).map(([path, text]): Source => ({ path, text })))
    .diagnostics.filter((d) => d.rule === 'broken-reference')
    .map((d) => d.target ?? '');
}

const target = (body: string): Record<string, string> => ({
  'docs/target.md': `# Target\n\n${body}\n`,
});

describe('an anchor an HTML element declares', () => {
  it('is an id on any element and a name on an <a>, quoted either way or not at all', async () => {
    const files = {
      ...target('<a id="setup"></a>\n\n<a name=\'install\'></a>\n\n<div id=Usage class="x">Text</div>\n\n<span title="t" id="  spaced  ">x</span>'),
      'docs/a.md': '# A\n\nSee [1](target.md#setup), [2](target.md#install), [3](target.md#usage) and [4](target.md#SPACED).\n',
    };
    expect(await broken(files)).toEqual([]);
  });

  it('is not a name on another element, an empty value, nor any attribute in code or a comment', async () => {
    const files = {
      ...target(
        [
          '<input name="field">',
          '<a id=""></a>',
          '<!-- <a id="hidden"></a> -->',
          '```html',
          '<a id="sample"></a>',
          '```',
          'Write `<a id="span"></a>` to mark it.',
          '<div data-id="data" aria-name="aria">x</div>',
        ].join('\n\n'),
      ),
      'docs/a.md': '# A\n\n[1](target.md#field) [2](target.md#hidden) [3](target.md#sample) [4](target.md#span) [5](target.md#data) [6](target.md#aria)\n',
    };
    expect(await broken(files)).toEqual(['target.md#field', 'target.md#hidden', 'target.md#sample', 'target.md#span', 'target.md#data', 'target.md#aria']);
  });

  it('is the region\'s that holds it, in a register', async () => {
    const files = {
      'docs/register.md': '# Register\n\n## REQ-1: One\n\nStatus: open\n\n<a id="one-note"></a>\n\n## REQ-2: Two\n\nStatus: open\n',
      'docs/a.md': '# A\n\nSee [one](register.md#one-note).\n',
    };
    expect(await broken(files)).toEqual([]);
  });
});

describe('an id a heading declares', () => {
  it('is an anchor, beside the slug of the text before it and the slug GitHub gives the whole', async () => {
    const files = {
      ...target('## Why we chose it {#rationale}\n\nText.'),
      'docs/a.md': '# A\n\n[1](target.md#rationale), [2](target.md#why-we-chose-it), [3](target.md#why-we-chose-it-rationale).\n',
    };
    expect(await broken(files)).toEqual([]);
  });

  it('is only one at the end of the heading', async () => {
    const files = {
      ...target('## The {#braces} in it\n\nText.'),
      'docs/a.md': '# A\n\n[1](target.md#braces).\n',
    };
    expect(await broken(files)).toEqual(['target.md#braces']);
  });
});

describe('an anchor written percent-encoded', () => {
  it('is read decoded where it does not bind as written', async () => {
    const files = {
      ...target('## 概要\n\nText.\n\n## Open Questions\n\n- [ ] Which store?'),
      'docs/a.md': '# A\n\n[1](target.md#%E6%A6%82%E8%A6%81), [2](target.md#open%2Dquestions.1), [3](target.md#%E6%A6%82%E8%A6%81-x).\n',
    };
    expect(await broken(files)).toEqual(['target.md#%E6%A6%82%E8%A6%81-x']);
  });

  it('binds as written first, and a malformed escape is read as written', async () => {
    const files = {
      ...target('<a id="100%25"></a>\n\n<a id="50%"></a>'),
      'docs/a.md': '# A\n\n[1](target.md#100%25), [2](target.md#50%).\n',
    };
    expect(await broken(files)).toEqual([]);
  });
});
