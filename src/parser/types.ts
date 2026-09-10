/** A single semicolon insertion, positioned against the pre-edit document. */
export interface InsertionEdit {
  line: number;
  character: number;
  text: ';';
}

/** Lexer context — discriminated union; transitions differ per state. */
export type LexerContext =
  | { kind: 'inline-html' }
  | { kind: 'code' }
  | { kind: 'line-comment' }
  | { kind: 'block-comment' }
  | { kind: 'single-quote' }
  | { kind: 'double-quote' }
  | { kind: 'backtick' }
  | { kind: 'heredoc'; id: string }
  | { kind: 'nowdoc'; id: string };

/** How a `{`...`}` pair is classified — decides whether the `}` may get `;`. */
export type BraceKind =
  | 'control' // if/foreach/switch/try/do/declare ... { — close never gets `;`
  | 'declaration' // named class/interface/trait/enum/function body — never gets `;`
  | 'expr-value' // closure / anonymous class used as a value — MAY get `;`
  | 'match' // match expression body — close MAY get `;`, arms never do
  | 'use-group' // `use Foo\{A, B}` — members never take `;` (comma-separated)
  | 'other'; // bare blocks, anything unrecognized — fail-closed

export interface BraceFrame {
  kind: BraceKind;
  assignmentPending: boolean;
  /** Paren/bracket depth when the brace opened — the brace "shelters"
   *  enclosing call/array scopes from the statement-depth gates. */
  parenBase: number;
  bracketBase: number;
}

/** How a `[`...`]` pair is classified. */
export type BracketKind = 'attribute' | 'value';

/** Classification of the statement head at end of line. */
export type StmtClass = 'control-header' | 'decl-header' | 'expr' | 'none' | 'tag';

/** Per-physical-line scan record consumed by the decision pass. */
export interface LineInfo {
  line: number;
  /** Any code-context character on this line (drives lookahead skipping). */
  hasCode: boolean;
  /** Column right AFTER the last code-context character (insert position). */
  codeEndCol: number;
  /** Codepoint of the last code-context character (0 if none). */
  lastSigChar: number;
  /** First significant code-context text (~8 chars), e.g. `->where(...)`. */
  firstSigText: string;
  /** True if the line ends inside string/comment/heredoc/html context. */
  endsInContext: boolean;
  /** Effective depths at end of line: open parens/brackets ABOVE the
   *  innermost enclosing brace (statements inside a brace scope are
   *  terminable even when the scope itself sits inside a call's parens). */
  paren: number;
  bracket: number;
  /** Kind popped by the line's LAST significant `}` (null if none). */
  finalBracePop: BraceKind | null;
  /** assignmentPending of the popped brace frame (when finalBracePop set). */
  finalBraceAssignment: boolean;
  /** Kind popped by the line's LAST significant `]` (null if none). */
  finalBracketPop: BracketKind | null;
  /** Kind of the innermost brace still open at EOL (null at depth 0). */
  innerBrace: BraceKind | null;
  /** Statement classification from the head at EOL. */
  stmtClass: StmtClass;
  /** True when the statement head contains a top-level `=` (assignment shape). */
  assignmentPending: boolean;
}

export interface ScanResult {
  lines: LineInfo[];
  /** False when the document could not be scanned reliably — caller bails. */
  clean: boolean;
}
