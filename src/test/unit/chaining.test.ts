import { describe, expect, it } from 'vitest';
import { analyze } from '../../analyze';
import { fix } from '../helpers';

describe('chaining lookahead — next line continues the expression', () => {
  const cases: Array<[string, string]> = [
    ['->', `$u = User::query()\n    ->first()`],
    ['?->', `$x = $a\n    ?->b()`],
    ['::', `$c = Foo\n    ::class`],
    ['.', `$s = 'a'\n    . 'b'`],
    ['+', `$n = 1\n    + 2`],
    ['-', `$n = 1\n    - 2`],
    ['*', `$n = 2\n    * 3`],
    ['/', `$n = 6\n    / 3`],
    ['%', `$n = 7\n    % 3`],
    ['&&', `$ok = $a\n    && $b`],
    ['||', `$ok = $a\n    || $b`],
    ['??', `$v = $a\n    ?? $b`],
    ['<', `$v = $a\n    < $b`],
    ['>', `$v = $a\n    > $b`],
    ['&', `$v = $a\n    & $b`],
    ['|', `$v = $a\n    | $b`],
    ['^', `$v = $a\n    ^ $b`],
    ['=', `$x = $a\n    = $b`],
    ['(', `foo()\n(bar())`],
    ['[', `$a = foo()\n[0]`],
    ['{', `foo()\n{`],
    [',', `foo($a\n    , $b)`],
    ['word: and', `$r = $a\n    and $b`],
    ['word: or', `$r = $a\n    or $b`],
    ['word: xor', `$r = $a\n    xor $b`],
    ['word: instanceof', `$r = $a\n    instanceof Foo`],
    ['word: implements', `class A\n    implements B`],
    ['word: as', `use A\n    as B`],
  ];

  for (const [label, body] of cases) {
    it(`suppresses insertion before a line starting with "${label}"`, () => {
      const input = `<?php\n${body}\n`;
      // The FIRST line must never receive a `;`.
      const out = fix(input, analyze);
      const outLines = out.split('\n');
      expect(outLines[1], label).not.toContain(';');
    });
  }

  it('suppresses before a line starting with a `{` opener; match arms stay bare', () => {
    const withBrace = `<?php
$fn = match ($x)
{
    1 => 'a'
}
`;
    const out = fix(withBrace, analyze);
    expect(out.split('\n')[1]).toBe('$fn = match ($x)');
    expect(out.split('\n')[3]).toBe(`    1 => 'a'`);
    expect(out.split('\n')[4]).toBe('};');
  });

  it('identifier-starting lines do NOT suppress (word boundary)', () => {
    const input = `<?php
$x = foo()
android()
`;
    const expected = `<?php
$x = foo();
android();
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('blank and comment-only lines are transparent to lookahead', () => {
    const input = `<?php
$u = User::query()

    // filter by email
    ->where('email', $e)

    ->first()
`;
    const expected = `<?php
$u = User::query()

    // filter by email
    ->where('email', $e)

    ->first();
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('multiline ternary gets its semicolon only on the final line', () => {
    const input = `<?php
$label = $isReady
    ? 'ready'
    : 'pending'
`;
    const expected = `<?php
$label = $isReady
    ? 'ready'
    : 'pending';
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('line ending WITH an operator never gets a semicolon (reverse matrix)', () => {
    const endings = ['.', '+', '&&', '||', '??', '=>', '=', ',', '(', '[', ':', '?'];
    for (const e of endings) {
      const input = `<?php\n$x = ${e}\n;\n`;
      const edits = analyze(input);
      expect(edits.filter((ed) => ed.line === 1), e).toHaveLength(0);
    }
  });

  it('last line of file (no trailing newline) still gets a semicolon', () => {
    expect(fix('<?php\n$a = 1', analyze)).toBe('<?php\n$a = 1;');
  });

  it('statement before a `?>` close tag is not terminated (close tag implies `;`)', () => {
    const input = `<?php
$a = 5
?>
<p>hi</p>
`;
    expect(fix(input, analyze)).toBe(input);
  });
});
