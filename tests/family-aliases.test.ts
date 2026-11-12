import { describe, expect, it } from 'vitest';

/**
 * The spellings the family's other tools write, taken here for this one's
 * (round 29's D8; spec-core's ADR-0005): `warning` and `note` for `warn` and
 * `info`, `pretty` for `human`, and `--option=value` for `--option value`.
 * Added and nothing renamed: a report still prints `warn` and `info`.
 *
 * The modules are imported inside each test: a module that throws while it
 * loads fails no test, and a sweep reads that as a survived mutant.
 */

describe('a severity', () => {
  it('is named by its own word, and by the word the other tools print for it', async () => {
    const { severityNamed } = await import('../src/types.js');
    expect(['error', 'warn', 'info', 'off', 'warning', 'note'].map(severityNamed)).toEqual(['error', 'warn', 'info', 'off', 'warn', 'info']);
  });

  it('is named by no other word, nor by one in another case', async () => {
    const { severityNamed } = await import('../src/types.js');
    expect(['Warning', 'NOTE', 'notice', 'warnings', '', 3, undefined].map(severityNamed)).toEqual([null, null, null, null, null, null, null]);
  });

  it('is taken in either spelling by --rule, the configuration and a project rule', async () => {
    const { parseArgs } = await import('../src/cli.js');
    const { parseConfig } = await import('../src/config.js');
    expect(parseArgs(['--rule', 'broken-reference=warning', '--rule', 'ghost-handover=note'], '/repo').severities).toEqual({
      'broken-reference': 'warn',
      'ghost-handover': 'info',
    });
    const { config, problems } = parseConfig(
      JSON.stringify({
        severities: { 'broken-reference': 'note' },
        rules: { 'no-drafts': { query: 'document[phase=draft]', message: '{0} is a draft', hint: 'accept {0}', severity: 'warning' } },
      }),
      'test',
    );
    expect(problems).toEqual([]);
    expect([config.severities, config.rules?.map((rule) => rule.severity)]).toEqual([{ 'broken-reference': 'info' }, ['warn']]);
  });

  it('is one rule given one severity in two spellings, and refused in two', async () => {
    const { parseArgs } = await import('../src/cli.js');
    expect(parseArgs(['--rule', 'broken-reference=warn', '--rule', 'broken-reference=warning'], '/repo').severities).toEqual({ 'broken-reference': 'warn' });
    expect(() => parseArgs(['--rule', 'broken-reference=warn', '--rule', 'broken-reference=note'], '/repo')).toThrow(/a rule has one severity/);
    expect(() => parseArgs(['--rule', 'broken-reference=notice'], '/repo')).toThrow('unknown severity "notice", expected one of: error, warn, info, off');
  });
});

describe('--format pretty', () => {
  it('is the report for a person, and the same format as human', async () => {
    const { parseArgs } = await import('../src/cli.js');
    expect(parseArgs(['--format', 'pretty'], '/repo').format).toBe('human');
    expect(parseArgs(['--format', 'pretty', '--format', 'human'], '/repo').format).toBe('human');
    expect(() => parseArgs(['--format', 'pretty', '--format', 'json'], '/repo')).toThrow(/--format/);
  });
});

describe('--option=value', () => {
  it('is the option and its value, for an option that takes one', async () => {
    const { parseArgs } = await import('../src/cli.js');
    const options = parseArgs(['--format=json', '--rule=broken-reference=note', '--max=3', '--ignore=docs/drafts', 'docs/**/*.md'], '/repo');
    expect([options.format, options.severities, options.max, options.ignore, options.patterns]).toEqual([
      'json',
      { 'broken-reference': 'info' },
      3,
      ['docs/drafts'],
      ['docs/**/*.md'],
    ]);
  });

  it('is refused for a value that is none, and for an option that takes none', async () => {
    const { parseArgs } = await import('../src/cli.js');
    expect(() => parseArgs(['--root='], '/repo')).toThrow('--root expects a directory, got ""');
    expect(() => parseArgs(['--format=xml'], '/repo')).toThrow('--format must be human, json, sarif, markdown, gitlab or github, got "xml"');
    expect(() => parseArgs(['--strict=true'], '/repo')).toThrow('unknown option "--strict=true"');
    // A pattern with an equals sign in it is a pattern.
    expect(parseArgs(['docs/a=b.md'], '/repo').patterns).toEqual(['docs/a=b.md']);
  });
});
