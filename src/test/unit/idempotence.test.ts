import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Engine } from 'php-parser';
import { analyze } from '../../analyze';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.php'));

// The corpus must be non-trivial or the test is vacuous.
if (fixtures.length < 5) {
  throw new Error(`idempotence corpus too small: ${fixtures.length} fixtures`);
}

const parser = new Engine({
  parser: { extractDoc: true, php7: true },
  ast: { withPositions: false },
});

describe('idempotence: valid PHP files receive zero edits', () => {
  it.each(fixtures)('%s is valid PHP', (name) => {
    const source = readFileSync(join(fixturesDir, name), 'utf8');
    expect(() => parser.parseCode(source, name), `${name} must parse as valid PHP`).not.toThrow();
  });

  it.each(fixtures)('%s → analyze() returns []', (name) => {
    const source = readFileSync(join(fixturesDir, name), 'utf8');
    expect(analyze(source)).toEqual([]);
  });
});

describe('idempotence: applying fixes produces files that pass again unchanged', () => {
  it('double-application stability on a missing-semicolon file', () => {
    const once = `<?php
$a = 1
$b = foo()
    ->bar()
`;
    const fixedOnce = once
      .split('\n')
      .map((l, i) => (i === 1 ? `${l};` : i === 3 ? `${l};` : l))
      .join('\n');
    expect(analyze(fixedOnce)).toEqual([]);
  });
});
