import { describe, expect, it } from 'vitest';
import { analyze } from '../../analyze';
import { fix } from '../helpers';

describe('AGENT.md Section 5 — mandatory spec cases', () => {
  it('Case 1: simple statements & assignments', () => {
    const input = `<?php
$name = "Docsy"
$count = 10
return response()->json(['success' => true])
`;
    const expected = `<?php
$name = "Docsy";
$count = 10;
return response()->json(['success' => true]);
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('Case 2: multiline method chaining (Laravel fluent query)', () => {
    const input = `<?php
$user = User::query()
    ->where('email', $email)
    ->where('status', 'active')
    ->first()
`;
    const expected = `<?php
$user = User::query()
    ->where('email', $email)
    ->where('status', 'active')
    ->first();
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('Case 3: multiline array', () => {
    const input = `<?php
$data = [
    'id' => 1,
    'name' => 'Finance'
]
`;
    const expected = `<?php
$data = [
    'id' => 1,
    'name' => 'Finance'
];
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('Case 4: anonymous function assigned to a variable', () => {
    const input = `<?php
$callback = function () {
    return 'hello'
}
`;
    const expected = `<?php
$callback = function () {
    return 'hello';
};
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('Case 5: control structures are untouched', () => {
    const input = `<?php
if ($user->isAdmin()) {
    doSomething()
}
`;
    const expected = `<?php
if ($user->isAdmin()) {
    doSomething();
}
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('Case 6: inline comments are preserved', () => {
    const input = `<?php
$timeout = 5000 // In milliseconds
`;
    const expected = `<?php
$timeout = 5000; // In milliseconds
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('Case 6 variant: inline block comment', () => {
    const input = `<?php
$limit = 25 /* per page */
`;
    const expected = `<?php
$limit = 25; /* per page */
`;
    expect(fix(input, analyze)).toBe(expected);
  });
});
