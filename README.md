# PHP Smart Semicolon

[![CI](https://github.com/athallarizky/php-auto-semicolon/actions/workflows/ci.yml/badge.svg)](https://github.com/athallarizky/php-auto-semicolon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Automatic semicolon insertion for PHP, on save.** The missing piece of the JS-to-PHP workflow.

```php
// ── you type ──────────────────────────────   // ── you hit save ────────────────────────
$name = "Docsy"                                 $name = "Docsy";
$count = 10                                     $count = 10;

$user = User::query()                           $user = User::query()
    ->where('email', $email)                        ->where('email', $email)
    ->first()                                       ->first();

$data = [                                       $data = [
    'id' => 1,                                      'id' => 1,
    'name' => 'Finance'                             'name' => 'Finance'
]                                               ];

$callback = function () {                       $callback = function () {
    return 'hello'                                  return 'hello';
}                                               };
```

No configuration. No keybindings. Just save.

---

## Why this exists

If you come from JavaScript/TypeScript, your muscle memory has been trained by Prettier and runtime ASI: *end the line, move on*. Then you write PHP and —

```
Parse error: syntax error, unexpected token ";", expecting ","
```

And the tools that would normally save you **can't**: Laravel Pint, PHP-CS-Fixer, and `@prettier/plugin-php` all refuse to run on files with syntax errors. A formatter that crashes on broken code can't fix the one thing that's broken.

**PHP Smart Semicolon** fills that gap. It's not a formatter — it's a tiny, focused repair tool that runs *before* formatting ever gets involved, on every save:

| | |
|---|---|
| ⚡ **Fast** | Single-pass lexer. ~2 ms for a 3,000-line file. Zero runtime dependencies. |
| 🔒 **Fail-closed** | Uncertain? It does nothing. A false negative costs one save; a false positive breaks code. |
| 🧠 **Context-aware** | Tracks bracket depth, strings, comments, heredocs, interpolation, and PHP↔HTML boundaries *across lines*. |
| 🔗 **Chaining-safe** | Fluent chains only terminate on the last line. Multiline arrays terminate after `]`. |
| 🧩 **Closure-aware** | `$fn = function () { ... }` → `};`. `array_map(function () { ... }, $arr)` → untouched. |
| 📝 **Comment-preserving** | Inserts *before* trailing comments: `$timeout = 5000; // ms` |
| 🖥 **Editor support** | Works in VS Code **and** Cursor. |

## Installation

### VS Code / Cursor — from source

```bash
git clone https://github.com/athallarizky/php-auto-semicolon.git
cd php-auto-semicolon
npm install
npm run package          # → php-auto-semi-0.1.0.vsix
code --install-extension php-auto-semi-0.1.0.vsix
# or: cursor --install-extension php-auto-semi-0.1.0.vsix
```

Reload the window and open any PHP file.

### Try it in 10 seconds

Create `test.php`, leave the semicolons out, hit `Cmd/Ctrl+S`:

```php
<?php
$greeting = "Hello, world"
echo strtoupper($greeting)
```

Save → both lines terminated. Undo works normally if you ever disagree with an insertion.

## Usage

- **On save** — automatic, nothing to invoke. Runs for manual saves and auto-save alike.
- **Manual** — Command Palette → **`PHP: Insert Missing Semicolons`**.

## Format on save: pairing with a formatter

This extension is **not a formatter** — it's the repair step that runs *before* one. VS Code applies `onWillSave` edits (this extension) first and formatting second, so formatters that refuse broken code (Laravel Pint, PHP-CS-Fixer) never see an invalid file:

```
save → ① missing semicolons inserted → ② formatter styles valid code
```

The extension works standalone — no formatter required. But if you also want style formatting on save, add a `.vscode/settings.json` to your project and pick the recipe that matches it:

### Intelephense — zero setup

Formats out of the box, no PHP install needed. The pragmatic default for Dockerized projects:

```json
{
  "editor.formatOnSave": true,
  "[php]": {
    "editor.defaultFormatter": "bmewburn.vscode-intelephense-client"
  }
}
```

### Laravel Pint — the project standard

Use Pint when it's already your project's style authority (`composer require --dev laravel/pint`). Needs a local PHP binary:

```json
{
  "editor.formatOnSave": true,
  "[php]": {
    "editor.defaultFormatter": "open-southeners.laravel-pint"
  }
}
```

### Laravel Pint inside Docker — no local PHP

Pint runs in your container via the same extension:

```json
{
  "editor.formatOnSave": true,
  "[php]": {
    "editor.defaultFormatter": "open-southeners.laravel-pint"
  },
  "laravel-pint.runInDocker": true,
  "laravel-pint.dockerContainerName": "your-app-container",
  "laravel-pint.dockerContainerRootPath": "/var/www/html"
}
```

> **Tip:** run `vendor/bin/pint` once across the codebase *before* enabling Pint on save. If existing files aren't Pint-clean yet, the first save of each will restyle them — usually surprising mid-task. Dockerized? `docker compose exec app ./vendor/bin/pint`.

### Settings

| Setting | Default | Description |
| :--- | :--- | :--- |
| `phpAutoSemi.enable` | `true` | Master switch. |
| `phpAutoSemi.runOnSave` | `true` | Insert on save (manual + auto-save). |
| `phpAutoSemi.ignoreFiles` | `["**/vendor/**", "**/*.blade.php"]` | Glob patterns to skip. |

## How it works

Most "auto semicolon" attempts are regex per line — and they break immediately, because *a line cannot be judged in isolation*. This extension is a real **two-pass engine**:

### Pass 1 — Scan (`src/parser/state-machine.ts`)

One character-at-a-time walk through the document with a 9-state lexer:

```
inline-html ─ code ─┬─ line-comment ─ block-comment
                    ├─ single-quote ─ double-quote ─ backtick
                    └─ heredoc ─ nowdoc
```

While scanning, it tracks parenthesis/bracket/brace depth with a **brace-context stack** — every `{` is classified on entry (`control`, `declaration`, `expr-value`, `match`, `use-group`) so the engine knows what a closing `}` means. String interpolation (`"{$arr["key"]}"`), PHP 8 attributes (`#[Route(...)]`), flexible heredocs, `?>`-inside-comment quirks, and mixed PHP/HTML templates are all handled as first-class cases. Per line it records: where significant code starts and ends, effective depth *relative to the innermost brace*, what the last significant character was, and the statement head since the last `;`/`{`/`}` boundary.

### Pass 2 — Decide (`src/parser/decide.ts`)

A `;` is inserted on line *N* only when **every** gate passes:

1. The document scanned cleanly (no unclosed strings/heredocs, no unbalanced brackets — otherwise **zero edits anywhere**)
2. The line has code and doesn't end inside a string/comment/heredoc
3. It ends with an expression-shaped character — identifier, `)` `]` `}` `"` `'`
4. It sits at effective depth zero (not inside a call, array, or match arm)
5. It isn't a control/declaration header (`if`, `abstract class`, …)
6. The next significant line doesn't start with a continuation token (`->`, `?->`, `::`, `??`, `.`, `&&`, `extends`, …)
7. A trailing `}` only counts when it provably closes an anonymous closure or `match` in value position

### The fail-closed philosophy

> **When uncertain, insert nothing.**

A missed semicolon is *harmless* — PHP tells you exactly where it is, and the next save fixes it. An incorrectly inserted semicolon *silently corrupts valid code*. Every ambiguous construct in the engine resolves toward doing nothing:

- Match arms, `use Foo\{...}` members, brace-less control bodies — never touched
- The file has *any* unbalanced bracket? No edits at all — the scanner can't be trusted on that file
- `}` gets `;` only with positive proof it closes a closure/match used as a value

### Deliberately skipped (known false negatives)

Rare, valid constructs that can't be proven safe — skipped rather than risked:

- `do { ... } while ($x)` without `;` — the trailing `while (...)` looks like a control header
- `declare(strict_types=1)` without `;`
- `$f ??= function () { ... }` split across lines (compound-assign closures)
- Trait conflict blocks (`use A, B { ... insteadof ... }`)

### Correct-by-PHP deviations from the original spec

- `namespace`, `use`, enum `case`, and interface method signatures **do** get `;` — the naive keyword block-list would leave them broken
- A statement right before `?>` is left alone — the close tag already implies `;` in PHP

## Quality

- **148 unit tests**, including the six mandatory spec cases and a full edge-case matrix (CRLF, tabs, attributes, heredocs, mixed templates, labels, `#[Attr]`, interpolation, goto…)
- **Idempotence corpus** — realistic Laravel-flavored fixtures (controller, model, seeder, heredoc-heavy repository, HTML template, enums/traits) that are validated as *parseable PHP* by a real parser ([php-parser](https://www.npmjs.com/package/php-parser)) and must yield **zero edits**. Found a false positive in the wild? Drop the file into `src/test/fixtures/` and it becomes a permanent regression test.
- **Performance budget** — a 3,000-line document analyzes in ~2 ms (median), gated in CI.

## CLI: scan a whole project

The same engine is available headlessly — useful for auditing a legacy codebase:

```bash
npm run scan -- /path/to/laravel/project          # dry run, report only
npm run scan -- /path/to/laravel/project --apply  # write the fixes
```

`vendor/`, `node_modules/`, and `storage/` are excluded automatically.

## Development

```bash
npm run typecheck    # strict TypeScript
npm run lint         # eslint
npm test             # vitest (148 tests)
npm run build        # typecheck + esbuild → dist/extension.js
npm run watch        # rebuild on change
```

Press **F5** to launch an Extension Development Host with the local build. `demo/test-asi.php` is a ready-made playground containing every spec case.

## License

[MIT](LICENSE)
