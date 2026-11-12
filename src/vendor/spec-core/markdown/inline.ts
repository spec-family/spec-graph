/**
 * The text a line of inline Markdown shows once GitHub renders it, which is
 * what GitHub makes a heading's anchor from.
 *
 * GitHub's anchor is made from the text its renderer shows, not from what is
 * written: `[1.2.0](https://example.com/compare)` shows `1.2.0`, an image
 * shows nothing, `<code>x</code>` shows `x`, `&lowbar;` shows `_`, and
 * `__init__` is strong emphasis that shows `init`, where `snake_case` shows
 * its underscores. An anchor keeps letters, marks, digits and connector
 * punctuation such as `_` and drops the rest, so this reads what changes
 * those: code spans, backslash escapes, character references, raw HTML tags,
 * autolinks, inline links and images, and emphasis, by CommonMark's rules as
 * GitHub's renderer applies them. That renderer follows version 0.29 of the
 * specification, where a symbol such as `€` or an emoji is not punctuation
 * beside a delimiter run: `🚀_x_🚀` keeps its underscores on GitHub, as
 * measured through its Markdown API on 2026-11-12.
 */

const TAB = 9;
const LF = 10;
const FF = 12;
const CR = 13;
const SPACE = 32;
const BANG = 33;
const DOUBLE_QUOTE = 34;
const AMPERSAND = 38;
const SINGLE_QUOTE = 39;
const OPEN_PAREN = 40;
const CLOSE_PAREN = 41;
const STAR = 42;
const SLASH = 47;
const EQUALS = 61;
const LESS_THAN = 60;
const GREATER_THAN = 62;
const OPEN_BRACKET = 91;
const BACKSLASH = 92;
const CLOSE_BRACKET = 93;
const UNDERSCORE = 95;
const BACKTICK = 96;

/** CommonMark's longest link label, which a full reference link's second part is. */
const MAX_LABEL = 999;

/**
 * Character references by HTML's table of names, for the names a heading is
 * likely to hold: the ISO 8859-1 range, `&nbsp;` to `&yuml;` in the order of
 * their code points from U+00A0, and the punctuation written as a name most
 * often. Any other name is a character or literal text by a table of 2,231
 * names, and the text is left undecided rather than guessed.
 */
const LATIN_1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ');

const NAMED: ReadonlyMap<string, string> = new Map([
  ...LATIN_1.map((name, index): [string, string] => [name, String.fromCharCode(0xa0 + index)]),
  ['amp', '&'],
  ['AMP', '&'],
  ['lt', '<'],
  ['LT', '<'],
  ['gt', '>'],
  ['GT', '>'],
  ['quot', '"'],
  ['QUOT', '"'],
  ['apos', "'"],
  ['COPY', '©'],
  ['REG', '®'],
  ['lowbar', '_'],
  ['UnderBar', '_'],
  ['ndash', '–'],
  ['mdash', '—'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['bull', '•'],
  ['hellip', '…'],
  ['trade', '™'],
]);

/**
 * A character reference: decimal, hexadecimal or named. A number has up to
 * eight digits in either base, as GitHub's renderer reads one, where
 * CommonMark's specification allows seven decimal and six hexadecimal.
 */
const REFERENCE = /&(?:#([0-9]{1,8})|#[xX]([0-9a-fA-F]{1,8})|([A-Za-z][A-Za-z0-9]{1,31}));/y;

/** An autolink, `<scheme:...>` or `<address@domain>`, which shows what is between its brackets. */
const AUTOLINK_URI = /<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>\u0000-\u001f]*)>/y;
const AUTOLINK_EMAIL =
  /<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)>/y;

const PUNCTUATION = /\p{P}/u;
const SPACE_SEPARATOR = /\p{Zs}/u;

/** A run of `*` or `_` that emphasis may use, kept in a list in the order written. */
interface Delimiter {
  readonly char: number;
  /** The run's length as written, which the rule of three reads. */
  readonly length: number;
  /** Its place among the parts, which orders delimiters. */
  readonly at: number;
  readonly open: boolean;
  readonly close: boolean;
  /** Its characters no emphasis has used, which the text shows. */
  count: number;
  previous: Delimiter | null;
  next: Delimiter | null;
}

/** A `[` or `![` that a later `]` may close into a link or an image. */
interface Bracket {
  readonly image: boolean;
  readonly at: number;
  /** The last delimiter before it, below which its text's emphasis does not reach. */
  readonly below: Delimiter;
  active: boolean;
}

type Part = string | Delimiter | Bracket;

/**
 * The delimiters in the order written, after a sentinel that stands before
 * them all, so each has one before it and emphasis has one to stop at.
 */
interface Delimiters {
  readonly head: Delimiter;
  last: Delimiter;
}

/**
 * The text `source`, one line of inline Markdown, shows once rendered, or
 * `null` where that depends on what one line cannot say: a named character
 * reference outside the few above, and a full reference link,
 * `[text][label]`, which is a link or two pairs of literal brackets by a
 * definition elsewhere in the document. A link written `[text]` or
 * `[text][]` shows the same characters whether it is defined or not, and is
 * read as written.
 *
 * Linear in the length of `source`: each backtick run finds its closer by a
 * cursor that only moves forward, and emphasis keeps CommonMark's floor for
 * each kind of closer that found no opener.
 */
export function renderedText(source: string): string | null {
  const parts: Part[] = [];
  const brackets: Bracket[] = [];
  const head: Delimiter = { char: 0, length: 0, at: -1, open: false, close: false, count: 0, previous: null, next: null };
  const delimiters: Delimiters = { head, last: head };
  const closer = codeSpanCloser(source);
  let plain = 0;
  let at = 0;

  const flush = (to: number): void => {
    if (to > plain) parts.push(source.slice(plain, to));
  };
  const take = (part: Part, next: number): void => {
    flush(at);
    parts.push(part);
    at = next;
    plain = next;
  };
  // A delimiter or a bracket records its place among the parts, so the text
  // before it is a part first.
  const settle = (): void => {
    flush(at);
    plain = at;
  };

  while (at < source.length) {
    const code = source.charCodeAt(at);
    if (code === BACKTICK) {
      let end = at + 1;
      while (source.charCodeAt(end) === BACKTICK) end += 1;
      const close = closer(end - at, at);
      if (close === -1) at = end;
      else take(codeSpan(source.slice(end, close)), close + end - at);
    } else if (code === BACKSLASH) {
      const escaped = source.charCodeAt(at + 1);
      if (isAsciiPunctuation(escaped)) take(String.fromCharCode(escaped), at + 2);
      else at += 1;
    } else if (code === AMPERSAND) {
      REFERENCE.lastIndex = at;
      const reference = REFERENCE.exec(source);
      if (reference === null) at += 1;
      else {
        const [, decimal, hexadecimal, name] = reference;
        const shown =
          decimal !== undefined
            ? fromCodePoint(Number(decimal))
            : hexadecimal !== undefined
              ? fromCodePoint(Number.parseInt(hexadecimal, 16))
              : NAMED.get(name!);
        if (shown === undefined) return null;
        take(shown, REFERENCE.lastIndex);
      }
    } else if (code === LESS_THAN) {
      const end = tagEnd(source, at);
      if (end !== -1) take('', end);
      else {
        const link = autolink(source, at);
        if (link === null) at += 1;
        else take(link[0], link[1]);
      }
    } else if (code === STAR || code === UNDERSCORE) {
      let end = at + 1;
      while (source.charCodeAt(end) === code) end += 1;
      settle();
      const delimiter = delimiterRun(source, at, end, parts.length);
      delimiter.previous = delimiters.last;
      delimiters.last.next = delimiter;
      delimiters.last = delimiter;
      take(delimiter, end);
    } else if (code === OPEN_BRACKET || (code === BANG && source.charCodeAt(at + 1) === OPEN_BRACKET)) {
      settle();
      const bracket: Bracket = { image: code === BANG, at: parts.length, below: delimiters.last, active: true };
      brackets.push(bracket);
      take(bracket, at + (code === BANG ? 2 : 1));
    } else if (code === CLOSE_BRACKET && brackets.length > 0) {
      const opener = brackets.pop()!;
      if (opener.active && source.charCodeAt(at + 1) === OPEN_BRACKET && fullReference(source, at + 1)) return null;
      const end = opener.active && source.charCodeAt(at + 1) === OPEN_PAREN ? linkTailEnd(source, at + 1) : -1;
      if (end === -1) at += 1;
      else {
        flush(at);
        processEmphasis(delimiters, opener.below);
        if (opener.image) parts.length = opener.at;
        else {
          parts[opener.at] = '';
          for (const outer of brackets) if (!outer.image) outer.active = false;
        }
        at = end;
        plain = end;
      }
    } else at += 1;
  }
  flush(at);
  processEmphasis(delimiters, head);
  return parts.map(shownBy).join('');
}

/** What a part shows: a delimiter its unused characters, a bracket that opened nothing itself. */
function shownBy(part: Part): string {
  if (typeof part === 'string') return part;
  if ('char' in part) return String.fromCharCode(part.char).repeat(part.count);
  return part.image ? '![' : '[';
}

/**
 * A code span's text: what is between its runs, less one space at each end
 * where it has one at both and is not all spaces.
 */
function codeSpan(content: string): string {
  const padded = content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '';
  return padded ? content.slice(1, -1) : content;
}

/**
 * For a run of backticks of a length that opens at an offset, the start of
 * the first run of exactly that length after it, or -1. Runs are found once,
 * and each length keeps a cursor that only moves forward, since the scan asks
 * in the order it reads.
 */
function codeSpanCloser(source: string): (length: number, opener: number) => number {
  const runs = new Map<number, number[]>();
  for (let at = source.indexOf('`'); at >= 0; ) {
    let end = at + 1;
    while (source.charCodeAt(end) === BACKTICK) end += 1;
    const list = runs.get(end - at);
    if (list === undefined) runs.set(end - at, [at]);
    else list.push(at);
    at = source.indexOf('`', end);
  }
  const cursors = new Map<number, number>();
  return (length, opener) => {
    const list = runs.get(length) ?? [];
    let cursor = cursors.get(length) ?? 0;
    while ((list[cursor] ?? Infinity) <= opener) cursor += 1;
    cursors.set(length, cursor);
    return list[cursor] ?? -1;
  };
}

/**
 * A run of `*` or `_` from `start` to `end`, with whether it can open and
 * close emphasis by the characters around it. One that can do neither is
 * text, which emphasis never takes.
 */
function delimiterRun(source: string, start: number, end: number, at: number): Delimiter {
  const char = source.charCodeAt(start);
  const before = pointBefore(source, start);
  const after = source.codePointAt(end);
  const left = !isWhitespace(after) && (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before));
  const right = !isWhitespace(before) && (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after));
  const open = char === STAR ? left : left && (!right || isPunctuation(before));
  const close = char === STAR ? right : right && (!left || isPunctuation(after));
  return { char, length: end - start, at, open, close, count: end - start, previous: null, next: null };
}

/**
 * CommonMark's emphasis over the delimiters above `bottom`: each closer, in
 * order, uses the nearest opener of its character that the rule of three
 * allows, two characters of each where both have two, and the delimiters
 * between them are text from then on. A closer that finds no opener raises
 * the floor for closers of its kind, so no opener is looked at twice for
 * them. Every delimiter above `bottom` leaves the list.
 */
function processEmphasis(list: Delimiters, bottom: Delimiter): void {
  const floors = new Array<number>(12).fill(bottom.at);
  let closer = bottom.next;
  while (closer !== null) {
    if (!closer.close) {
      closer = closer.next;
      continue;
    }
    const kind = (closer.char === STAR ? 0 : 6) + (closer.open ? 3 : 0) + (closer.length % 3);
    let opener = closer.previous;
    while (opener !== null && opener.at > floors[kind]! && !pairs(opener, closer)) opener = opener.previous;
    if (opener !== null && opener.at > floors[kind]!) {
      const used = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
      opener.count -= used;
      closer.count -= used;
      opener.next = closer;
      closer.previous = opener;
      if (opener.count === 0) unlink(list, opener);
      if (closer.count === 0) {
        const next = closer.next;
        unlink(list, closer);
        closer = next;
      }
    } else {
      floors[kind] = closer.at - 1;
      const next = closer.next;
      if (!closer.open) unlink(list, closer);
      closer = next;
    }
  }
  bottom.next = null;
  list.last = bottom;
}

/** Whether `opener` can take `closer`: the same character, and the rule of three. */
function pairs(opener: Delimiter, closer: Delimiter): boolean {
  if (opener.char !== closer.char || !opener.open) return false;
  const either = opener.close || closer.open;
  return !(either && (opener.length + closer.length) % 3 === 0 && closer.length % 3 !== 0);
}

/** Takes a delimiter out of the list; the sentinel before it is never taken. */
function unlink(list: Delimiters, delimiter: Delimiter): void {
  const previous = delimiter.previous!;
  previous.next = delimiter.next;
  if (delimiter.next === null) list.last = previous;
  else delimiter.next.previous = previous;
}

/**
 * Where an inline link's `(destination "title")` that opens at `open` ends,
 * or -1 where it is not one: a destination in `<>` or one without spaces
 * whose parentheses balance, an optional title after a space, and `)`.
 */
function linkTailEnd(source: string, open: number): number {
  let at = skipSpaces(source, open + 1);
  if (source.charCodeAt(at) === LESS_THAN) {
    for (at += 1; source.charCodeAt(at) !== GREATER_THAN; at += source.charCodeAt(at) === BACKSLASH ? 2 : 1) {
      if (Number.isNaN(source.charCodeAt(at)) || source.charCodeAt(at) === LESS_THAN) return -1;
    }
    at += 1;
  } else {
    let depth = 0;
    for (let code = source.charCodeAt(at); code > SPACE; code = source.charCodeAt(at)) {
      if (code === CLOSE_PAREN && depth === 0) break;
      if (code === OPEN_PAREN) depth += 1;
      if (code === CLOSE_PAREN) depth -= 1;
      at += code === BACKSLASH && isAsciiPunctuation(source.charCodeAt(at + 1)) ? 2 : 1;
    }
    if (depth !== 0) return -1;
  }
  const spaced = skipSpaces(source, at);
  const quote = source.charCodeAt(spaced);
  if (spaced > at && (quote === DOUBLE_QUOTE || quote === SINGLE_QUOTE || quote === OPEN_PAREN)) {
    const close = quote === OPEN_PAREN ? CLOSE_PAREN : quote;
    for (at = spaced + 1; source.charCodeAt(at) !== close; at += source.charCodeAt(at) === BACKSLASH ? 2 : 1) {
      if (Number.isNaN(source.charCodeAt(at)) || (quote === OPEN_PAREN && source.charCodeAt(at) === OPEN_PAREN)) return -1;
    }
    at = skipSpaces(source, at + 1);
  } else at = spaced;
  return source.charCodeAt(at) === CLOSE_PAREN ? at + 1 : -1;
}

/** Whether a full reference link's label, `[label]` with something in it, opens at `open`. */
function fullReference(source: string, open: number): boolean {
  let at = open + 1;
  for (let code = source.charCodeAt(at); code !== CLOSE_BRACKET; code = source.charCodeAt(at)) {
    if (Number.isNaN(code) || code === OPEN_BRACKET || at - open > MAX_LABEL) return false;
    at += code === BACKSLASH ? 2 : 1;
  }
  return source.slice(open + 1, at).trim() !== '';
}

/**
 * Where a raw HTML tag that opens at `open` ends, or -1: `</name>`, or
 * `<name attribute="value" ...>` or `/>`, by CommonMark's grammar. Such a
 * tag shows nothing; what is between an opening and a closing tag shows as
 * text, as GitHub keeps it once it removes the tags it does not allow.
 */
function tagEnd(source: string, open: number): number {
  const closing = source.charCodeAt(open + 1) === SLASH;
  let at = open + (closing ? 2 : 1);
  if (!isAsciiLetter(source.charCodeAt(at))) return -1;
  while (isAsciiLetter(source.charCodeAt(at)) || isDigit(source.charCodeAt(at)) || source.charCodeAt(at) === 45) at += 1;
  if (closing) {
    at = skipWhitespace(source, at);
    return source.charCodeAt(at) === GREATER_THAN ? at + 1 : -1;
  }
  for (;;) {
    const spaced = skipWhitespace(source, at);
    const code = source.charCodeAt(spaced);
    if (code === GREATER_THAN) return spaced + 1;
    if (code === SLASH) return source.charCodeAt(spaced + 1) === GREATER_THAN ? spaced + 2 : -1;
    if (spaced === at || !(isAsciiLetter(code) || code === UNDERSCORE || code === 58)) return -1;
    at = spaced + 1;
    while (isAttributeNameChar(source.charCodeAt(at))) at += 1;
    const equals = skipWhitespace(source, at);
    if (source.charCodeAt(equals) !== EQUALS) continue;
    const value = skipWhitespace(source, equals + 1);
    const quote = source.charCodeAt(value);
    if (quote === DOUBLE_QUOTE || quote === SINGLE_QUOTE) {
      const close = source.indexOf(String.fromCharCode(quote), value + 1);
      if (close === -1) return -1;
      at = close + 1;
    } else {
      at = value;
      while (isUnquotedValueChar(source.charCodeAt(at))) at += 1;
      if (at === value) return -1;
    }
  }
}

/** An autolink that opens at `open`: what it shows, and where it ends. */
function autolink(source: string, open: number): readonly [string, number] | null {
  for (const pattern of [AUTOLINK_URI, AUTOLINK_EMAIL]) {
    pattern.lastIndex = open;
    const found = pattern.exec(source);
    if (found !== null) return [found[1]!, pattern.lastIndex];
  }
  return null;
}

/** A character reference's code point as CommonMark decodes it: U+FFFD for none. */
function fromCodePoint(point: number): string {
  return point === 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff) ? '�' : String.fromCodePoint(point);
}

/** The code point that ends just before `at`, or `undefined` at the start. */
function pointBefore(source: string, at: number): number | undefined {
  const low = source.charCodeAt(at - 1);
  if (low >= 0xdc00 && low <= 0xdfff && at >= 2) {
    const high = source.charCodeAt(at - 2);
    if (high >= 0xd800 && high <= 0xdbff) return source.codePointAt(at - 2);
  }
  return at >= 1 ? low : undefined;
}

/** Whitespace beside a delimiter run; the start and the end of the line count as such. */
function isWhitespace(point: number | undefined): boolean {
  if (point === undefined) return true;
  return point === TAB || point === LF || point === FF || point === CR || SPACE_SEPARATOR.test(String.fromCodePoint(point));
}

/** Punctuation beside a delimiter run, by the specification GitHub follows: ASCII's, and Unicode's `P` categories. */
function isPunctuation(point: number | undefined): boolean {
  if (point === undefined) return false;
  return isAsciiPunctuation(point) || PUNCTUATION.test(String.fromCodePoint(point));
}

function isAsciiPunctuation(code: number): boolean {
  return (code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126);
}

function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isAttributeNameChar(code: number): boolean {
  return isAsciiLetter(code) || isDigit(code) || code === UNDERSCORE || code === 46 || code === 58 || code === 45;
}

function isUnquotedValueChar(code: number): boolean {
  return code > SPACE && code !== DOUBLE_QUOTE && code !== SINGLE_QUOTE && code !== EQUALS && code !== LESS_THAN && code !== GREATER_THAN && code !== BACKTICK;
}

function skipSpaces(source: string, at: number): number {
  let end = at;
  while (source.charCodeAt(end) === SPACE || source.charCodeAt(end) === TAB) end += 1;
  return end;
}

function skipWhitespace(source: string, at: number): number {
  let end = at;
  for (let code = source.charCodeAt(end); code === SPACE || code === TAB || code === LF || code === CR || code === FF; code = source.charCodeAt(end)) end += 1;
  return end;
}
