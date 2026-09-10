import { classifyBrace, classifyStmtHead, isControlHead, isDeclHead } from './classify';
import type { BraceFrame, BraceKind, BracketKind, LexerContext, LineInfo, ScanResult } from './types';

const STMT_HEAD_CAP = 256;
const FIRST_SIG_CAP = 16;
const MAX_INTERP_DEPTH = 4;

const CHAR_TAB = 9;
const CHAR_LF = 10;
const CHAR_CR = 13;
const CHAR_SPACE = 32;
const CHAR_DQUOTE = 34;
const CHAR_DOLLAR = 36;
const CHAR_SQUOTE = 39;
const CHAR_LPAREN = 40;
const CHAR_RPAREN = 41;
const CHAR_STAR = 42;
const CHAR_SLASH = 47;
const CHAR_COLON = 58;
const CHAR_SEMI = 59;
const CHAR_LT = 60;
const CHAR_EQ = 61;
const CHAR_GT = 62;
const CHAR_QUESTION = 63;
const CHAR_LBRACK = 91;
const CHAR_BACKSLASH = 92;
const CHAR_RBRACK = 93;
const CHAR_BACKTICK = 96;
const CHAR_LBRACE = 123;
const CHAR_RBRACE = 125;

function isWhitespace(cp: number): boolean {
  return cp === CHAR_SPACE || cp === CHAR_TAB || cp === CHAR_CR || cp === 11 || cp === 12;
}

function isLabelChar(cp: number): boolean {
  return (
    (cp >= 97 && cp <= 122) || (cp >= 65 && cp <= 90) || (cp >= 48 && cp <= 57) || cp === 95
  );
}

interface HeredocOpen {
  id: string;
  nowdoc: boolean;
  consumed: number;
}

function parseHeredocOpen(text: string, start: number): HeredocOpen | null {
  let j = start + 3; // skip `<<<`
  while (j < text.length && isWhitespace(text.charCodeAt(j))) {
    j++;
  }
  let nowdoc = false;
  let id: string;
  if (text[j] === "'" || text[j] === '"') {
    const quote = text[j];
    const end = text.indexOf(quote, j + 1);
    if (end === -1 || end === j + 1) {
      return null;
    }
    id = text.slice(j + 1, end);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) {
      return null;
    }
    nowdoc = quote === "'";
    j = end + 1;
  } else {
    let k = j;
    while (k < text.length && isLabelChar(text.charCodeAt(k))) {
      k++;
    }
    if (k === j) {
      return null;
    }
    id = text.slice(j, k);
    j = k;
  }
  return { id, nowdoc, consumed: j - start };
}

/**
 * Pass 1: single forward character scan. Produces one LineInfo per physical
 * line plus brace-pop events. Never re-lexes; all cross-line context
 * (strings, comments, heredocs, depths) is carried in the scan state.
 */
export function scan(text: string): ScanResult {
  const lines: LineInfo[] = [];
  let clean = true;

  let state: LexerContext = { kind: 'inline-html' };
  let i = 0;
  let lineStart = 0;
  let line = 0;

  let paren = 0;
  let bracket = 0;
  const braceStack: BraceFrame[] = [];
  const bracketStack: BracketKind[] = [];

  // Statement head: whitespace-collapsed significant code since the last
  // statement boundary (`;` `{` `}` line-final-ish `:` tag switch, heredoc).
  let head = '';
  let assignSeen = false;
  let interpDepth = 0;
  let attrBracketPending = false;
  // True right after a brace-less control header completed (`if (...)`, bare
  // `else`): the next significant non-`{` character starts the header's BODY
  // and must begin a fresh statement head.
  let pendingHeaderEnd = false;

  // Per-line accumulators.
  let hasCode = false;
  let codeEndCol = 0;
  let lastSig = 0;
  let firstSig = '';
  let finalBracePop: BraceKind | null = null;
  let finalBraceAssignment = false;
  let finalBracketPop: BracketKind | null = null;

  function markSig(cp: number, idx: number): void {
    if (pendingHeaderEnd) {
      // First significant char after a completed brace-less control header
      // starts the header's body statement.
      head = '';
      assignSeen = false;
      pendingHeaderEnd = false;
    }
    hasCode = true;
    codeEndCol = idx - lineStart + 1;
    lastSig = cp;
    if (firstSig.length < FIRST_SIG_CAP) {
      firstSig += String.fromCharCode(cp);
    }
    // Any later significant char supersedes a brace/bracket pop event.
    finalBracePop = null;
    finalBraceAssignment = false;
    finalBracketPop = null;
  }

  function pushHead(cp: number): void {
    if (head.length < STMT_HEAD_CAP) {
      head += String.fromCharCode(cp);
    }
  }

  function pushHeadSpace(): void {
    if (head.length > 0 && head.length < STMT_HEAD_CAP && head[head.length - 1] !== ' ') {
      head += ' ';
    }
  }

  function resetStatement(): void {
    head = '';
    assignSeen = false;
  }

  function finalizeLine(): void {
    const k = state.kind;
    const endsInContext =
      k === 'block-comment' ||
      k === 'single-quote' ||
      k === 'double-quote' ||
      k === 'backtick' ||
      k === 'heredoc' ||
      k === 'nowdoc';
    const stmtClass = endsInContext || !hasCode ? 'none' : classifyStmtHead(head);
    // Effective depths: excess open parens/brackets above the innermost
    // enclosing brace — statements inside a brace scope stay terminable.
    const base = braceStack.length > 0 ? braceStack[braceStack.length - 1] : null;
    lines.push({
      line,
      hasCode,
      codeEndCol,
      lastSigChar: lastSig,
      firstSigText: firstSig,
      endsInContext,
      paren: base ? Math.max(0, paren - base.parenBase) : paren,
      bracket: base ? Math.max(0, bracket - base.bracketBase) : bracket,
      finalBracePop,
      finalBraceAssignment,
      finalBracketPop,
      innerBrace: base ? base.kind : null,
      stmtClass,
      assignmentPending: assignSeen,
    });
    // A brace-less control header ending the line (bare `else`, `try`, or an
    // unclosed-paren-free header) means the next line is its body.
    if (stmtClass === 'control-header' && lastSig !== 41 /* ) */ && paren === 0) {
      pendingHeaderEnd = true;
    }
    line++;
    hasCode = false;
    codeEndCol = 0;
    lastSig = 0;
    firstSig = '';
    finalBracePop = null;
    finalBraceAssignment = false;
    finalBracketPop = null;
  }

  const len = text.length;

  while (i < len) {
    const cp = text.charCodeAt(i);

    switch (state.kind) {
      case 'inline-html': {
        if (cp === CHAR_LF) {
          finalizeLine();
          i++;
          lineStart = i;
          continue;
        }
        if (cp === CHAR_LT && text.charCodeAt(i + 1) === CHAR_QUESTION) {
          state = { kind: 'code' };
          resetStatement();
          attrBracketPending = false;
          const tagLen =
            text.startsWith('<?php', i) || text.startsWith('<?PHP', i)
              ? 5
              : text.startsWith('<?=', i)
                ? 3
                : 2;
          for (let t = 0; t < tagLen; t++) {
            markSig(text.charCodeAt(i + t), i + t);
          }
          i += tagLen;
          continue;
        }
        i++;
        continue;
      }

      case 'line-comment': {
        if (cp === CHAR_LF) {
          state = { kind: 'code' };
          finalizeLine();
          i++;
          lineStart = i;
          continue;
        }
        // Real PHP behavior: `?>` terminates PHP even inside `//` comments.
        if (cp === CHAR_QUESTION && text.charCodeAt(i + 1) === CHAR_GT) {
          state = { kind: 'inline-html' };
          resetStatement();
          markSig(CHAR_QUESTION, i);
          markSig(CHAR_GT, i + 1);
          i += 2;
          continue;
        }
        i++;
        continue;
      }

      case 'block-comment': {
        if (cp === CHAR_STAR && text.charCodeAt(i + 1) === CHAR_SLASH) {
          state = { kind: 'code' };
          i += 2;
          continue;
        }
        if (cp === CHAR_LF) {
          finalizeLine();
          i++;
          lineStart = i;
          continue;
        }
        i++;
        continue;
      }

      case 'single-quote': {
        if (
          cp === CHAR_BACKSLASH &&
          i + 1 < len &&
          text.charCodeAt(i + 1) !== CHAR_LF &&
          text.charCodeAt(i + 1) !== CHAR_CR
        ) {
          i += 2;
          continue;
        }
        if (cp === CHAR_SQUOTE) {
          state = { kind: 'code' };
          markSig(cp, i);
          pushHead(cp);
          i++;
          continue;
        }
        if (cp === CHAR_LF) {
          finalizeLine();
          i++;
          lineStart = i;
          continue;
        }
        i++;
        continue;
      }

      case 'double-quote':
      case 'backtick': {
        const quote = state.kind === 'double-quote' ? CHAR_DQUOTE : CHAR_BACKTICK;
        if (
          cp === CHAR_BACKSLASH &&
          i + 1 < len &&
          text.charCodeAt(i + 1) !== CHAR_LF &&
          text.charCodeAt(i + 1) !== CHAR_CR
        ) {
          i += 2;
          continue;
        }
        if (interpDepth > 0) {
          if (cp === CHAR_RBRACE) {
            interpDepth--;
            i++;
            continue;
          }
          if (cp === CHAR_LBRACE && text.charCodeAt(i + 1) === CHAR_DOLLAR) {
            if (interpDepth < MAX_INTERP_DEPTH) {
              interpDepth++;
            } else {
              clean = false; // pathological nesting — fail-closed
            }
            i += 2;
            continue;
          }
          i++;
          continue;
        }
        if (cp === CHAR_LBRACE && text.charCodeAt(i + 1) === CHAR_DOLLAR) {
          interpDepth = 1;
          i += 2;
          continue;
        }
        if (cp === CHAR_DOLLAR && text.charCodeAt(i + 1) === CHAR_LBRACE) {
          interpDepth = 1;
          i += 2;
          continue;
        }
        if (cp === quote) {
          state = { kind: 'code' };
          markSig(cp, i);
          pushHead(cp);
          i++;
          continue;
        }
        if (cp === CHAR_LF) {
          finalizeLine();
          i++;
          lineStart = i;
          continue;
        }
        i++;
        continue;
      }

      case 'heredoc':
      case 'nowdoc': {
        if (i === lineStart) {
          // Try to match the closer: optional indentation + exact id + boundary.
          let j = i;
          while (j < len && isWhitespace(text.charCodeAt(j))) {
            j++;
          }
          let k = j;
          while (k < len && isLabelChar(text.charCodeAt(k))) {
            k++;
          }
          if (k > j && text.slice(j, k) === state.id) {
            const after = k < len ? text.charCodeAt(k) : -1;
            if (after === -1 || !isLabelChar(after)) {
              state = { kind: 'code' };
              resetStatement();
              // Synthesize the closer id as significant code: a bare closer
              // line behaves like an identifier-ending expression line.
              for (let t = j; t < k; t++) {
                markSig(text.charCodeAt(t), t);
                pushHead(text.charCodeAt(t));
              }
              i = k;
              continue;
            }
          }
        }
        if (state.kind === 'heredoc') {
          // Interpolated heredoc: track complex interpolation like double-quote.
          if (interpDepth > 0) {
            if (cp === CHAR_RBRACE) {
              interpDepth--;
              i++;
              continue;
            }
            if (cp === CHAR_LBRACE && text.charCodeAt(i + 1) === CHAR_DOLLAR) {
              if (interpDepth < MAX_INTERP_DEPTH) {
              interpDepth++;
            } else {
              clean = false; // pathological nesting — fail-closed
            }
              i += 2;
              continue;
            }
            if (
              cp === CHAR_BACKSLASH &&
              i + 1 < len &&
              text.charCodeAt(i + 1) !== CHAR_LF &&
              text.charCodeAt(i + 1) !== CHAR_CR
            ) {
              i += 2;
              continue;
            }
            i++;
            continue;
          }
          if (cp === CHAR_LBRACE && text.charCodeAt(i + 1) === CHAR_DOLLAR) {
            interpDepth = 1;
            i += 2;
            continue;
          }
          if (cp === CHAR_DOLLAR && text.charCodeAt(i + 1) === CHAR_LBRACE) {
            interpDepth = 1;
            i += 2;
            continue;
          }
          if (
            cp === CHAR_BACKSLASH &&
            i + 1 < len &&
            text.charCodeAt(i + 1) !== CHAR_LF &&
            text.charCodeAt(i + 1) !== CHAR_CR
          ) {
            i += 2;
            continue;
          }
        }
        if (cp === CHAR_LF) {
          finalizeLine();
          i++;
          lineStart = i;
          continue;
        }
        i++;
        continue;
      }

      case 'code': {
        if (cp === CHAR_LF) {
          finalizeLine();
          i++;
          lineStart = i;
          continue;
        }
        if (isWhitespace(cp)) {
          pushHeadSpace();
          // Preserve internal spacing in firstSig so word-operator lookahead
          // can test word boundaries (`instanceof Foo` vs `androidFunc`).
          if (firstSig.length > 0 && firstSig.length < FIRST_SIG_CAP) {
            firstSig += ' ';
          }
          i++;
          continue;
        }
        // Heredoc / nowdoc opener.
        if (cp === CHAR_LT && text.startsWith('<<<', i)) {
          const open = parseHeredocOpen(text, i);
          if (open) {
            for (let t = 0; t < open.consumed; t++) {
              markSig(text.charCodeAt(i + t), i + t);
            }
            resetStatement();
            state = { kind: open.nowdoc ? 'nowdoc' : 'heredoc', id: open.id };
            i += open.consumed;
            continue;
          }
        }
        // Close tag.
        if (cp === CHAR_QUESTION && text.charCodeAt(i + 1) === CHAR_GT) {
          state = { kind: 'inline-html' };
          resetStatement();
          markSig(CHAR_QUESTION, i);
          markSig(CHAR_GT, i + 1);
          i += 2;
          continue;
        }
        // Attribute opener `#[` (PHP 8) vs shell-style `#` comment.
        if (cp === 35 /* # */) {
          if (text.charCodeAt(i + 1) === CHAR_LBRACK) {
            attrBracketPending = true;
            markSig(cp, i);
            pushHead(cp);
            i++;
            continue;
          }
          state = { kind: 'line-comment' };
          i++;
          continue;
        }
        // Comments.
        if (cp === CHAR_SLASH) {
          if (text.charCodeAt(i + 1) === CHAR_SLASH) {
            state = { kind: 'line-comment' };
            i += 2;
            continue;
          }
          if (text.charCodeAt(i + 1) === CHAR_STAR) {
            state = { kind: 'block-comment' };
            i += 2;
            continue;
          }
          markSig(cp, i);
          pushHead(cp);
          i++;
          continue;
        }
        // Strings.
        if (cp === CHAR_SQUOTE) {
          state = { kind: 'single-quote' };
          markSig(cp, i);
          i++;
          continue;
        }
        if (cp === CHAR_DQUOTE) {
          state = { kind: 'double-quote' };
          markSig(cp, i);
          i++;
          continue;
        }
        if (cp === CHAR_BACKTICK) {
          state = { kind: 'backtick' };
          markSig(cp, i);
          i++;
          continue;
        }
        // Depth tracking.
        if (cp === CHAR_LPAREN) {
          paren++;
          markSig(cp, i);
          pushHead(cp);
          i++;
          continue;
        }
        if (cp === CHAR_LBRACK) {
          const kind: BracketKind = attrBracketPending ? 'attribute' : 'value';
          attrBracketPending = false;
          bracketStack.push(kind);
          bracket++;
          markSig(cp, i);
          pushHead(cp);
          i++;
          continue;
        }
        if (cp === CHAR_LBRACE) {
          // `{` of a control header keeps the head for classification.
          pendingHeaderEnd = false;
          const kind = head.length >= STMT_HEAD_CAP ? 'other' : classifyBrace(head);
          braceStack.push({
            kind,
            assignmentPending: assignSeen || /^(?:return|yield)\b/.test(head),
            parenBase: paren,
            bracketBase: bracket,
          });
          markSig(cp, i);
          resetStatement();
          i++;
          continue;
        }
        if (cp === CHAR_RPAREN) {
          paren--;
          if (paren < 0) {
            clean = false;
          }
          markSig(cp, i);
          pushHead(cp);
          // `if (...)`, `while (...)` etc. completing at depth 0: what
          // follows (unless `{`) is the brace-less body statement.
          if (paren === 0 && bracket === 0 && isControlHead(head)) {
            pendingHeaderEnd = true;
          }
          i++;
          continue;
        }
        if (cp === CHAR_RBRACK) {
          bracket--;
          if (bracket < 0) {
            clean = false;
          }
          const kind = bracketStack.pop();
          markSig(cp, i);
          if (kind) {
            finalBracketPop = kind;
          }
          pushHead(cp);
          i++;
          continue;
        }
        if (cp === CHAR_RBRACE) {
          const frame = braceStack.pop();
          if (!frame) {
            clean = false;
          }
          markSig(cp, i);
          if (frame) {
            finalBracePop = frame.kind;
            finalBraceAssignment = frame.assignmentPending;
          }
          resetStatement();
          i++;
          continue;
        }
        if (cp === CHAR_SEMI) {
          markSig(cp, i);
          resetStatement();
          i++;
          continue;
        }
        if (cp === CHAR_COLON) {
          // `::` scope resolution is not a statement boundary.
          const isScopeOp = text.charCodeAt(i + 1) === CHAR_COLON || text[i - 1] === ':';
          markSig(cp, i);
          pushHead(cp);
          if (!isScopeOp && paren === 0 && bracket === 0 && !isDeclHead(head)) {
            // Alternative-syntax headers, labels, ternaries start fresh —
            // but return types (`function bar(): int {`) and enum backing
            // types (`enum S: string {`) must keep the declaration head.
            head = ''; // assignSeen intentionally survives (ternary chains)
          }
          i++;
          continue;
        }
        if (cp === CHAR_EQ) {
          const next = text[i + 1];
          const prev = head.length > 0 ? head[head.length - 1] : '';
          const isAssign =
            next !== '=' &&
            next !== '>' &&
            next !== '~' &&
            !'=!<>&|+-*/%.?:'.includes(prev);
          if (isAssign) {
            assignSeen = true;
          }
          markSig(cp, i);
          pushHead(cp);
          i++;
          continue;
        }
        // Any other significant character (identifiers, $, operators, ...).
        markSig(cp, i);
        pushHead(cp);
        i++;
        continue;
      }
    }
  }

  finalizeLine();

  // Fail-closed bail conditions.
  const k = state.kind;
  if (k === 'line-comment') {
    state = { kind: 'code' }; // auto-closes at EOF
  }
  if (state.kind !== 'code' && state.kind !== 'inline-html') {
    clean = false; // unterminated string/comment/heredoc
  }
  if (paren !== 0 || bracket !== 0 || braceStack.length !== 0 || interpDepth !== 0) {
    clean = false; // unbalanced structure: depth tracking unreliable
  }

  return { lines, clean };
}
