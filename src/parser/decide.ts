import type { InsertionEdit, LineInfo, ScanResult } from './types';

/**
 * First characters that mark the next significant line as a continuation of
 * the current expression. No valid PHP statement starts with any of these
 * (only degenerate shapes like `[1,2];` do), so suppressing insertion on the
 * previous line is always safe — fail-closed.
 *
 * Covers: `->` `?->` `::` `?` `:` (multiline ternary) `.` `+` `-` `*` `/` `%`
 * `&&` `||` `??` `<` `>` `<<` `>>` `&` `|` `^` `=` `=>` `!` (leading `!=`)
 * `{` `(` `[` `,` `~` and `?>` (close tag implicitly terminates statements).
 */
const CONTINUATION_FIRST_CHARS = new Set<number>([
  63, 58, 46, 43, 45, 42, 47, 37, 60, 62, 38, 124, 94, 61, 123, 40, 91, 44, 33, 126,
]);

/**
 * Word operators that can start a continuation line (`$a = $b\nand $c;`).
 * Matched with a word boundary so `android()` is NOT treated as `and`.
 */
const CONTINUATION_WORDS = [
  'and',
  'or',
  'xor',
  'instanceof',
  'extends',
  'implements',
  'as',
  'insteadof',
];

function isWhitelistedEnd(cp: number): boolean {
  return (
    (cp >= 97 && cp <= 122) || // a-z
    (cp >= 65 && cp <= 90) || // A-Z
    (cp >= 48 && cp <= 57) || // 0-9
    cp === 95 || // _
    cp === 36 || // $
    cp === 41 || // )
    cp === 93 || // ]
    cp === 125 || // }
    cp === 34 || // "
    cp === 39 || // '
    cp === 96 // `
  );
}

function isContinuationStart(firstSigText: string): boolean {
  if (firstSigText.length === 0) {
    return false;
  }
  if (CONTINUATION_FIRST_CHARS.has(firstSigText.charCodeAt(0))) {
    return true;
  }
  const lower = firstSigText.toLowerCase();
  for (const w of CONTINUATION_WORDS) {
    if (lower.startsWith(w)) {
      const next = lower.charAt(w.length);
      if (next === '' || !/[a-z0-9_]/.test(next)) {
        return true;
      }
    }
  }
  return false;
}

function nextSignificantLine(lines: LineInfo[], from: number): LineInfo | null {
  for (let j = from + 1; j < lines.length; j++) {
    if (lines[j].hasCode) {
      return lines[j];
    }
  }
  return null;
}

/**
 * Pass 2: apply the insertion predicate to each scanned line.
 * Insert position is `codeEndCol` — the column right after the last code
 * character, which lands before any trailing whitespace or comment.
 */
export function decide(scanResult: ScanResult): InsertionEdit[] {
  if (!scanResult.clean) {
    return [];
  }
  const edits: InsertionEdit[] = [];
  const lines = scanResult.lines;

  for (let i = 0; i < lines.length; i++) {
    const li = lines[i];
    if (!li.hasCode || li.endsInContext) {
      continue;
    }
    const c = li.lastSigChar;
    // A `}`-terminated line is judged by its brace-pop gates below, not by
    // statement class — the head was legitimately reset by the pop itself.
    if (li.stmtClass !== 'expr' && c !== 125 /* } */) {
      continue;
    }
    // Match arms and use-group members never take a semicolon — only the
    // closing `}` of a match used as a value does (finalBracePop gate below).
    if (li.innerBrace === 'match' || li.innerBrace === 'use-group') {
      continue;
    }
    if (!isWhitelistedEnd(c)) {
      continue;
    }
    if (li.paren !== 0 || li.bracket !== 0) {
      continue;
    }
    if (c === 93 /* ] */ && li.finalBracketPop !== 'value') {
      continue;
    }
    // An anonymous closure / match popped at paren 0 & bracket 0 is always in
    // value position (assignment, return, ternary branch) — its `}` ends the
    // statement, so no assignment-shape check is needed here. Closures popped
    // inside argument lists never reach this gate (paren depth > 0).
    if (c === 125 /* } */ && li.finalBracePop !== 'expr-value' && li.finalBracePop !== 'match') {
      continue;
    }
    const next = nextSignificantLine(lines, i);
    if (next && isContinuationStart(next.firstSigText)) {
      continue;
    }
    edits.push({ line: li.line, character: li.codeEndCol, text: ';' });
  }

  return edits;
}
