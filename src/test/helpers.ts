import type { InsertionEdit } from '../parser/types';

/**
 * Round-trip helper: apply insertion edits to raw text and return the result.
 * Edits are applied bottom-up so earlier positions stay valid. Positions are
 * (line, character) pairs compatible with VS Code (characters count all chars
 * in the line except the line terminator; `\r` in CRLF is trailing whitespace
 * and never precedes an insert point because inserts land after the last
 * significant code character).
 */
export function applyEdits(text: string, edits: InsertionEdit[]): string {
  if (edits.length === 0) {
    return text;
  }
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      lineStarts.push(i + 1);
    }
  }
  const offsets = edits
    .filter((e) => e.line < lineStarts.length)
    .map((e) => lineStarts[e.line] + e.character)
    .sort((a, b) => b - a);
  let out = text;
  for (const off of offsets) {
    out = out.slice(0, off) + ';' + out.slice(off);
  }
  return out;
}

/** Convenience: full pipeline check — analyze then apply. */
export function fix(text: string, analyze: (t: string) => InsertionEdit[]): string {
  return applyEdits(text, analyze(text));
}
