import { describe, expect, it } from 'vitest';
import { scan } from '../../parser/state-machine';

describe('scanner: LineInfo invariants', () => {
  it('records paren depth at end of each line', () => {
    const r = scan(`<?php
foo(bar(
    $x
), $y)
`);
    expect(r.lines[2].paren).toBe(2); // line "    $x"
    expect(r.lines[3].paren).toBe(0); // line "), $y)" closes both
    expect(r.lines[3].lastSigChar).toBe(')'.charCodeAt(0));
    expect(r.clean).toBe(true);
  });

  it('records bracket depth for multiline arrays', () => {
    const r = scan(`<?php
$a = [
    'x' => 1
]
`);
    expect(r.lines[2].bracket).toBe(1);
    expect(r.lines[3].bracket).toBe(0);
    expect(r.lines[3].finalBracketPop).toBe('value');
  });

  it('classifies control vs expr-value vs declaration brace pops', () => {
    const r = scan(`<?php
if (true) {
    work()
}
$f = function () {
}
class Foo {
}
`);
    expect(r.lines[3].finalBracePop).toBe('control');
    expect(r.lines[5].finalBracePop).toBe('expr-value');
    expect(r.lines[5].finalBraceAssignment).toBe(true);
    expect(r.lines[7].finalBracePop).toBe('declaration');
  });

  it('marks lines ending inside strings/comments/heredocs as endsInContext', () => {
    const r = scan(`<?php
$s = 'abc
done'
/* block
comment */
$x = <<<EOT
body
EOT;
`);
    expect(r.lines[1].endsInContext).toBe(true); // inside single-quote
    expect(r.lines[2].endsInContext).toBe(false);
    expect(r.lines[3].endsInContext).toBe(true); // inside block comment
    expect(r.lines[4].endsInContext).toBe(false); // "comment */" — closes, no code
    expect(r.lines[5].endsInContext).toBe(true); // heredoc opener
    expect(r.lines[6].hasCode).toBe(false); // heredoc body
    expect(r.lines[7].lastSigChar).toBe(';'.charCodeAt(0)); // closer + ;
    expect(r.clean).toBe(true);
  });

  it('synthesizes code for a bare heredoc closer line', () => {
    const r = scan(`<?php
$q = <<<SQL
    SELECT *
SQL
`);
    expect(r.lines[3].hasCode).toBe(true);
    expect(r.lines[3].lastSigChar).toBe('L'.charCodeAt(0));
    expect(r.lines[3].codeEndCol).toBe(3);
    expect(r.lines[3].stmtClass).toBe('expr');
  });

  it('treats `#[` as attribute bracket and plain `#` as comment', () => {
    const attr = scan(`<?php
#[Route('/users')]
class C {
}
`);
    expect(attr.lines[1].finalBracketPop).toBe('attribute');
    expect(attr.clean).toBe(true);

    const comment = scan(`<?php
$a = 1 # shell-style comment
$b = 2
`);
    expect(comment.lines[1].stmtClass).toBe('expr');
    expect(comment.lines[2].lastSigChar).toBe('2'.charCodeAt(0));
    expect(comment.clean).toBe(true);
  });

  it('keeps complex string interpolation opaque to depth tracking', () => {
    const r = scan(`<?php
$s = "{$arr["key"]}"
$t = "{$foo->bar[1]}"
`);
    expect(r.clean).toBe(true);
    expect(r.lines[1].paren).toBe(0);
    expect(r.lines[1].bracket).toBe(0);
    expect(r.lines[2].paren).toBe(0);
  });

  it('bails (clean=false) on stray closing brackets', () => {
    expect(scan(`<?php\nfoo)\n`).clean).toBe(false);
    expect(scan(`<?php\n$a = 1]\n`).clean).toBe(false);
    expect(scan(`<?php\n}\n`).clean).toBe(false);
  });

  it('bails on unclosed string / heredoc / block comment at EOF', () => {
    expect(scan(`<?php\n$s = 'abc\n`).clean).toBe(false);
    expect(scan(`<?php\n$s = <<<EOT\nbody\n`).clean).toBe(false);
    expect(scan(`<?php\n/* never closed\n`).clean).toBe(false);
  });

  it('bails on unbalanced depths at EOF (mid-typing protection)', () => {
    expect(scan(`<?php\nfoo(bar(\n`).clean).toBe(false);
    expect(scan(`<?php\nif (true) {\nwork()\n`).clean).toBe(false);
  });

  it('handles `?>` inside a line comment (real PHP behavior)', () => {
    const r = scan(`<?php
$a = 1 // note ?>
plain html
`);
    expect(r.lines[2].hasCode).toBe(false); // html after close tag
    expect(r.clean).toBe(true);
  });

  it('records first significant text for lookahead', () => {
    const r = scan(`<?php
$a = 1
    ->chain()
`);
    expect(r.lines[2].firstSigText.startsWith('->chain')).toBe(true);
  });

  it('tracks statement class at EOL', () => {
    const r = scan(`<?php
if ($x)
    doIt();
abstract class Foo
{
}
$x = 1
case 'a':
?>
`);
    expect(r.lines[1].stmtClass).toBe('control-header');
    expect(r.lines[3].stmtClass).toBe('decl-header');
    expect(r.lines[6].stmtClass).toBe('expr');
    expect(r.lines[7].stmtClass).toBe('none'); // after `:` reset
    expect(r.lines[8].stmtClass).toBe('none'); // tag-only line
  });

  it('emits a record for the trailing empty line', () => {
    const r = scan("<?php\n$a = 1\n");
    expect(r.lines.length).toBe(3);
    expect(r.lines[2].hasCode).toBe(false);
  });
});
