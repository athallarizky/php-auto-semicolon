import { describe, expect, it } from 'vitest';
import { analyze } from '../../analyze';
import { fix } from '../helpers';

describe('comments and attributes', () => {
  it('inserts before a trailing `//` comment at the exact column', () => {
    const input = `<?php
$timeout = 5000 // In milliseconds
`;
    const edits = analyze(input);
    expect(edits).toEqual([{ line: 1, character: 15, text: ';' }]);
    expect(fix(input, analyze)).toBe(`<?php
$timeout = 5000; // In milliseconds
`);
  });

  it('inserts before a trailing `#` comment', () => {
    const input = `<?php
$port = 8080 # override
`;
    expect(fix(input, analyze)).toBe(`<?php
$port = 8080; # override
`);
  });

  it('inserts before a trailing block comment', () => {
    const input = `<?php
$limit = 25 /* per page */
`;
    expect(fix(input, analyze)).toBe(`<?php
$limit = 25; /* per page */
`);
  });

  it('comment-only lines are transparent to lookahead chaining', () => {
    const input = `<?php
$u = User::query() // base query
    ->first()
`;
    const expected = `<?php
$u = User::query() // base query
    ->first();
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('multiline docblocks are fully skipped', () => {
    const input = `<?php
/**
 * @param int $x
 */
function double($x)
{
    return $x * 2
}
`;
    const expected = `<?php
/**
 * @param int $x
 */
function double($x)
{
    return $x * 2;
}
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('PHP 8 attribute line does not get a semicolon', () => {
    const input = `<?php
#[Route('/users', name: 'users')]
class UserController
{
}
`;
    expect(fix(input, analyze)).toBe(input);
  });

  it('multiline attribute does not get a semicolon on its closing bracket', () => {
    const input = `<?php
#[Route(
    '/users'
)]
class UserController
{
}
`;
    expect(fix(input, analyze)).toBe(input);
  });

  it('attribute before a closure assignment still works', () => {
    const input = `<?php
$middleware = #[Deprecated]
    function () {
        return 1
    }
`;
    const expected = `<?php
$middleware = #[Deprecated]
    function () {
        return 1;
    };
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('`?>` inside a line comment closes PHP (real PHP behavior)', () => {
    const input = `<?php
$a = 1 // note ?>
<b><?= $a ?></b>
`;
    expect(fix(input, analyze)).toBe(input);
  });

  it('division is not mistaken for a comment start', () => {
    const input = `<?php
$half = $total / 2
`;
    expect(fix(input, analyze)).toBe(`<?php
$half = $total / 2;
`);
  });

  it('statement with only a comment after a semicolon stays untouched', () => {
    const input = `<?php
doWork(); // done
`;
    expect(fix(input, analyze)).toBe(input);
  });
});
