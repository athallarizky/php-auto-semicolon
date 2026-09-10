# AGENT.md — PHP Auto Semicolon (`php-auto-semi`)

> **Target Project:** VS Code & Cursor Extension for Automatic Semicolon Insertion (ASI) on Save for PHP  
> **Audience:** Autonomous AI Coding Agents & Lead Developer  
> **Rule of Engagement:** Turnkey implementation. Read this specification completely before writing code. Do NOT run half-baked scaffolding; build clean, modular, tested code.

---

## 1. Project Overview & Objective

### The Problem
Frontend developers transitioning to PHP frequently forget trailing semicolons (`;`) because JavaScript/TypeScript tools (like Prettier and runtime ASI) handle statement termination automatically. In PHP:
* Semicolons are mandatory at the grammar level.
* Missing a semicolon causes a fatal `Parse error: syntax error`.
* Standard formatters (Laravel Pint, PHP-CS-Fixer, `@prettier/plugin-php`) **crash** upon encountering syntax errors, meaning they cannot auto-insert missing semicolons on save.

### The Objective
Build a lightweight, zero-dependency, lightning-fast (<5ms) VS Code extension named **`php-auto-semi`** (Display name: **"PHP Smart Semicolon"**) that listens to document save events (`onWillSaveTextDocument`), intelligently detects missing semicolons using a **State Machine Parser**, and inserts them safely without breaking multiline queries, arrays, or language constructs.

---

## 2. Tech Stack & Requirements

| Component | Technology | Version | Rationale |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | >= 18.x / 20.x | Execution environment for VS Code extensions |
| **Language** | TypeScript | ^5.x (Strict mode) | Type safety, maintainability |
| **API** | VS Code Extension API | `^1.85.0` | Target host API for VS Code & Cursor |
| **Bundler** | `esbuild` | Latest | Ultra-fast bundling to single `dist/extension.js` |
| **Test Runner** | Vitest / Mocha | Latest | Fast unit testing of the parser without launching full VS Code |
| **Dependencies** | **Zero runtime dependencies** | — | Keep extension featherweight and instantaneous |

---

## 3. Recommended Project Structure

```text
php-auto-semi/
├── AGENT.md                   # This instruction file
├── README.md                  # User-facing documentation & GIF demo
├── package.json               # Extension manifest & VS Code configuration
├── tsconfig.json              # Strict TypeScript compiler options
├── esbuild.config.mjs         # Fast bundler config for extension.ts -> dist/extension.js
├── src/
│   ├── extension.ts           # Extension entrypoint (activate, deactivate, hooks)
│   ├── parser/
│   │   ├── state-machine.ts   # Core AST/State-Machine parser & semicolon detector
│   │   └── types.ts           # Token types, depth tracking interfaces
│   └── test/
│       ├── fixtures/          # Sample PHP files (controllers, models, blade snippets)
│       └── unit/
│           └── parser.test.ts # Comprehensive test cases covering all edge cases
└── .vscode/
    ├── launch.json            # F5 debug launcher (Extension Development Host)
    └── tasks.json             # Build & watch tasks
```

---

## 4. Core Architecture: State Machine Parser

Do **NOT** use naive regex line-by-line replacement. A line cannot be judged in isolation.  
The engine must use a **State Machine Lexer** that tracks Context Depth across lines.

### The 4 Core Tracking States

```
┌─────────────────────────────────────────────────────────────┐
│                    State Machine Tracker                    │
├──────────────────────────────┬──────────────────────────────┤
│ 1. Parenthesis Depth: ( ... ) │ Don't insert if depth > 0    │
│ 2. Bracket Depth:     [ ... ] │ Don't insert if depth > 0    │
│ 3. Brace Depth:       { ... } │ Track function / class body  │
│ 4. String / Comment Context  │ Ignore '...', "...", /*...*/ │
└──────────────────────────────┴──────────────────────────────┘
```

### Decision Rules for Line $N$:

A semicolon `;` **MUST BE INSERTED** at the end of Line $N$ if and only if **ALL** of the following conditions are met:

1. **Not already terminated:** The line does not end with `;`, `{`, `}`, `:`, `,`, `(`, `[`, or PHP tags `<?php`, `?>`.
2. **Context depth is zero:**
   * `parenDepth == 0` (Not inside an unclosed function call / condition).
   * `bracketDepth == 0` (Not inside a multiline array `[...]`).
3. **Not a structural / control statement:**
   * Does not match control headers: `if`, `elseif`, `else`, `for`, `foreach`, `while`, `do`, `switch`, `case`, `default`, `try`, `catch`, `finally`.
   * Does not match declaration headers: `class`, `interface`, `trait`, `enum`, `function`, `namespace`, `use` (group), `abstract`, `final`.
4. **Multiline Chaining Lookahead:**
   * Peek at the next non-empty, non-comment line.
   * If the next line starts with `->` or `?->` (object operator) or `::` (scope resolution) or a binary operator (`.`, `+`, `&&`, `||`), Line $N$ is part of a chained expression ➔ **DO NOT INSERT**.
5. **Statement Completion Candidate:**
   * Ends with an identifier, variable (`$foo`), scalar literal (`123`, `'abc'`, `"xyz"`), function/method call closing paren `)`, or array closing bracket `]`.
   * Or represents a closure assignment: `$fn = function() { ... }` ➔ **DO INSERT `;` after closing brace**.
6. **Trailing Comment Preservation:**
   * If the line has an inline comment (`$a = 1 // comment` or `$a = 1 /* note */`), insert the semicolon **before** the comment starts, not after it.

---

## 5. Edge Cases & Verification Test Matrix

The test suite in `src/test/unit/parser.test.ts` must pass 100% of these cases:

### Case 1: Simple Statements & Assignments
```php
// Input:
$name = "Docsy"
$count = 10
return response()->json(['success' => true])

// Expected Output:
$name = "Docsy";
$count = 10;
return response()->json(['success' => true]);
```

### Case 2: Multiline Method Chaining (Laravel Fluent Query)
```php
// Input:
$user = User::query()
    ->where('email', $email)
    ->where('status', 'active')
    ->first()

// Expected Output:
$user = User::query()
    ->where('email', $email)
    ->where('status', 'active')
    ->first();
```
*(Notice: Lines 1, 2, and 3 must NOT have semicolons).*

### Case 3: Multiline Array
```php
// Input:
$data = [
    'id' => 1,
    'name' => 'Finance'
]

// Expected Output:
$data = [
    'id' => 1,
    'name' => 'Finance'
];
```
*(Notice: Keys inside array use commas; semicolon is placed after closing bracket `]`).*

### Case 4: Anonymous Functions / Closures Assigned to Variables
```php
// Input:
$callback = function () {
    return 'hello'
}

// Expected Output:
$callback = function () {
    return 'hello';
};
```
*(Notice: Line 2 gets `;`, and the closure closing brace `}` on Line 3 gets `;` because it is an assignment).*

### Case 5: Control Structures (Must NOT touch)
```php
if ($user->isAdmin()) {
    doSomething()
}
```
*(Notice: `if (...) {` and `}` must not receive semicolons; only `doSomething();` receives one).*

### Case 6: Preserving Inline Comments
```php
// Input:
$timeout = 5000 // In milliseconds

// Expected Output:
$timeout = 5000; // In milliseconds
```

---

## 6. Extension Configuration & Settings (`package.json`)

Expose these user settings in `package.json`:

```json
{
  "name": "php-auto-semi",
  "displayName": "PHP Smart Semicolon (Auto Semi)",
  "description": "Automatic Semicolon Insertion (ASI) on save for PHP, just like JavaScript/TypeScript Prettier.",
  "version": "0.1.0",
  "publisher": "personal",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Formatters", "Programming Languages"],
  "activationEvents": ["onLanguage:php"],
  "main": "./dist/extension.js",
  "contributes": {
    "configuration": {
      "title": "PHP Smart Semicolon",
      "properties": {
        "phpAutoSemi.enable": {
          "type": "boolean",
          "default": true,
          "description": "Enable/disable automatic semicolon insertion on save."
        },
        "phpAutoSemi.runOnSave": {
          "type": "boolean",
          "default": true,
          "description": "Automatically insert missing semicolons when saving a PHP file."
        },
        "phpAutoSemi.ignoreFiles": {
          "type": "array",
          "default": ["**/vendor/**", "**/*.blade.php"],
          "description": "Glob patterns of files to ignore."
        }
      }
    },
    "commands": [
      {
        "command": "phpAutoSemi.insertSemicolons",
        "title": "PHP: Insert Missing Semicolons"
      }
    ]
  }
}
```

---

## 7. Implementation Checklist for the Next Agent

1. [ ] **Initialize Workspace:**
   - Create `package.json`, `tsconfig.json`, and `esbuild.config.mjs`.
   - Install devDependencies: `typescript`, `@types/vscode`, `@types/node`, `esbuild`, `vitest`.
2. [ ] **Build State Machine Engine (`src/parser/`):**
   - Implement `state-machine.ts` with paren/bracket/brace depth tracking and lookahead.
   - Return an array of edits: `{ line: number, character: number, text: ';' }`.
3. [ ] **Unit Tests (`src/test/unit/`):**
   - Implement tests for Cases 1 through 6 in Section 5.
   - Run `npx vitest run` until 100% tests pass.
4. [ ] **VS Code Integration (`src/extension.ts`):**
   - Register `vscode.workspace.onWillSaveTextDocument`.
   - Filter for `event.document.languageId === 'php'`.
   - Check settings (`phpAutoSemi.enable` & `phpAutoSemi.runOnSave`).
   - Apply edits via `event.waitUntil(...)` with `vscode.TextEdit.insert(...)`.
   - Register manual command `phpAutoSemi.insertSemicolons`.
5. [ ] **Packaging & Local Installation:**
   - Run `npm run build` via `esbuild` to produce `dist/extension.js`.
   - Symlink or copy the extension folder to `~/.vscode/extensions/php-auto-semi`.
   - Reload VS Code / Cursor to verify in a live PHP project.
