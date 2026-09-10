#!/usr/bin/env node
// Standalone project scanner built on the same analyze() engine the
// extension uses. Usage: node scripts/scan-project.mjs <rootDir> [--apply]
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { analyze } = require('../tmp/analyze.cjs');

const root = process.argv[2];
const apply = process.argv.includes('--apply');
if (!root) {
  console.error('usage: node scripts/scan-project.mjs <rootDir> [--apply]');
  process.exit(1);
}

const EXCLUDE_DIRS = new Set([
  'vendor',
  'node_modules',
  'storage',
  '.git',
  '.idea',
  '.vscode',
  'dist',
  'build',
  'coverage',
]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry.name)) {
        walk(join(dir, entry.name), files);
      }
    } else if (entry.name.endsWith('.php')) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

const files = walk(root);
let scanned = 0;
let withEdits = 0;
let totalEdits = 0;
const findings = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  scanned++;
  const edits = analyze(text);
  if (edits.length > 0) {
    withEdits++;
    totalEdits += edits.length;
    const rel = relative(root, file);
    const details = edits.map((e) => {
      const line = text.slice(0, text.indexOf('\n') >= 0 ? undefined : undefined);
      void line;
      const ls = lineStarts(text);
      const start = ls[e.line] ?? 0;
      const end = text.indexOf('\n', start);
      const content = text.slice(start, end === -1 ? undefined : end);
      return `  L${e.line + 1}: ${content.trim().slice(0, 90)}`;
    });
    findings.push({ file: rel, edits, details });
  }
}

console.log(`scanned ${scanned} PHP files (vendor excluded)`);
console.log(`files with missing semicolons: ${withEdits}`);
console.log(`total insertions needed: ${totalEdits}`);
console.log('---');

for (const f of findings) {
  console.log(`${f.file} (${f.edits.length}):`);
  for (const d of f.details) console.log(d);
}

if (apply) {
  for (const f of findings) {
    const abs = join(root, f.file);
    const text = readFileSync(abs, 'utf8');
    const ls = lineStarts(text);
    const offsets = f.edits
      .map((e) => ls[e.line] + e.character)
      .sort((a, b) => b - a);
    let out = text;
    for (const off of offsets) out = out.slice(0, off) + ';' + out.slice(off);
    writeFileSync(abs, out);
  }
  console.log(`---\napplied fixes to ${withEdits} file(s)`);
} else if (withEdits > 0) {
  console.log('---\n(dry run — re-run with --apply to write changes)');
}
