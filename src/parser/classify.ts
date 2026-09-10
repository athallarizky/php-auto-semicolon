import type { BraceKind, StmtClass } from './types';

/**
 * Keywords whose `{`...`}` (or brace-less header) must never receive a `;`.
 * `case`/`default` are deliberately absent: switch arms end with `:` (excluded
 * by the terminator rules) and enum cases DO need `;`.
 * `match` is absent: `match (...)` in expression position is handled by
 * brace-kind classification plus next-line-`{` lookahead suppression.
 */
export const CONTROL_KEYWORDS = new Set([
  'if',
  'elseif',
  'else',
  'for',
  'foreach',
  'while',
  'do',
  'switch',
  'try',
  'catch',
  'finally',
  'declare',
]);

/** First identifier-ish word of a (whitespace-collapsed) statement head. */
export function firstWord(head: string): string {
  const m = /^[A-Za-z_\\][A-Za-z0-9_\\]*/.exec(head);
  return m ? m[0] : '';
}

export function isControlHead(head: string): boolean {
  return CONTROL_KEYWORDS.has(firstWord(head));
}

/**
 * Classify the statement head at end-of-line.
 *
 * `control-header` and `decl-header` suppress insertion — a line like
 * `if ($x)` or `abstract class Foo` (brace on a later line) must not be
 * terminated. Empty heads (`<?php`, just after `;`/`}`) are `none`.
 */
export function classifyStmtHead(head: string): StmtClass {
  if (!head) {
    return 'none';
  }
  if (isControlHead(head)) {
    return 'control-header';
  }
  if (isDeclHead(head)) {
    return 'decl-header';
  }
  return 'expr';
}

export function isDeclHead(head: string): boolean {
  if (head.includes('=')) {
    return false;
  }
  // `use function strlen;` / `use const FOO;` are imports that need `;`,
  // not declarations — never treat a `use` head as a declaration.
  if (firstWord(head) === 'use') {
    return false;
  }
  // `class Foo`, `enum Suit`, even a bare `class` awaiting its name.
  // NOTE: function/method headers are deliberately NOT declarations —
  // interface & abstract signatures need `;`, while class method
  // headers are protected by the next-line-`{` lookahead instead.
  return hasTypeDeclKeyword(head);
}

/**
 * True when a type-declaration keyword appears at statement level.
 * Position-aware: `Folder::class` (class-constant) and `$obj->class`
 * (property) are expressions, not declarations — extremely common in
 * Laravel code (`return $this->belongsTo(Folder::class, 'id')`).
 */
function hasTypeDeclKeyword(head: string): boolean {
  const re = /\b(class|interface|trait|enum|new)\b/g;
  let m: RegExpExecArray | null;
  let sawNew = false;
  while ((m = re.exec(head)) !== null) {
    const t = m[1];
    const prev = m.index > 0 ? head[m.index - 1] : '';
    if (t === 'new') {
      sawNew = true;
      continue;
    }
    if (prev === ':' || prev === '>') {
      // `::class` / `?->class` / `->class` — skip, it's an expression.
      sawNew = false;
      continue;
    }
    if (!sawNew) {
      return true;
    }
    sawNew = false;
  }
  return false;
}

/**
 * Classify a `{` about to be pushed, from the statement head before it.
 *
 * - `control` / `declaration` closes never get `;`
 * - `expr-value` (closure / anonymous class / match used as a value) MAY get `;`
 *   after its closing `}` when it was assigned or returned
 * - `other` is the fail-closed fallback (bare blocks, use-group braces, ...)
 */
export function classifyBrace(head: string): BraceKind {
  if (!head) {
    return 'other';
  }
  if (isControlHead(head)) {
    return 'control';
  }
  // `use Foo\{A, B}` — grouped imports are comma-separated, never `;`.
  if (firstWord(head) === 'use') {
    return 'use-group';
  }
  // Anonymous closure: `function` directly followed by `(`. A named function
  // never has this shape (`function foo(` has the name in between), so this
  // detects closures in ANY expression position — assignment, return,
  // ternary branch, argument list (argument lists are pop-guarded by the
  // decision pass's paren-depth gate).
  if (/\bfunction\s*\(/.test(head)) {
    return 'expr-value';
  }
  // Anonymous class in expression position.
  if (/\bnew\s+class\b/.test(head)) {
    return 'expr-value';
  }
  // Match expression whose subject has been closed.
  if (/match\s*\(.*\)\s*$/.test(head)) {
    return 'match';
  }
  // Named declaration bodies.
  if (/\bfunction\s+[A-Za-z_]/.test(head)) {
    return 'declaration';
  }
  if (hasTypeDeclKeyword(head)) {
    return 'declaration';
  }
  return 'other';
}
