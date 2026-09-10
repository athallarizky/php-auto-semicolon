import { describe, expect, it } from 'vitest';
import { analyze } from '../../analyze';
import { fix } from '../helpers';

describe('strings and heredocs', () => {
  it('escaped quotes do not end the string', () => {
    const input = `<?php
$s = 'it\\'s fine'
$d = "say \\"hi\\""
`;
    const expected = `<?php
$s = 'it\\'s fine';
$d = "say \\"hi\\"";
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('string spanning lines: only the closing line is decided (valid PHP)', () => {
    const input = `<?php
$s = 'abc\\
def'
`;
    const expected = `<?php
$s = 'abc\\
def';
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('complex interpolation is opaque: "{$arr["key"]}"', () => {
    const input = `<?php
$s = "{$arr["key"]}"
$t = "{$user->name}!"
$u = "plain $var here"
`;
    const expected = `<?php
$s = "{$arr["key"]}";
$t = "{$user->name}!";
$u = "plain $var here";
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('dollar-brace interpolation', () => {
    const input = '<?php\n$s = "value: ${name}"\n';
    expect(fix(input, analyze)).toBe('<?php\n$s = "value: ${name}";\n');
  });

  it('shell-exec backtick string', () => {
    const input = `<?php
$out = ` + '`whoami`' + `
`;
    expect(fix(input, analyze)).toBe(`<?php
$out = ` + '`whoami`;' + `
`);
  });

  it('semicolon inside a string is not a statement boundary', () => {
    const input = `<?php
$s = "a;b;c"
`;
    expect(fix(input, analyze)).toBe(`<?php
$s = "a;b;c";
`);
  });

  it('heredoc: opener line skipped, body opaque, closer gets `;`', () => {
    const input = `<?php
$q = <<<SQL
    SELECT *
    FROM users WHERE id = {$id};
SQL
`;
    const expected = `<?php
$q = <<<SQL
    SELECT *
    FROM users WHERE id = {$id};
SQL;
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('nowdoc: single-quoted identifier, no interpolation', () => {
    const input = `<?php
$tpl = <<<'EOT'
Hello {$name}
EOT
`;
    const expected = `<?php
$tpl = <<<'EOT'
Hello {$name}
EOT;
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('quoted heredoc identifier', () => {
    const input = `<?php
$a = <<<"EOT"
x
EOT
`;
    expect(fix(input, analyze)).toBe(`<?php
$a = <<<"EOT"
x
EOT;
`);
  });

  it('indented closer (PHP 7.3 flexible heredoc) still gets `;`', () => {
    const input = `<?php
class Foo
{
    public function q(): string
    {
        return <<<SQL
            SELECT 1
            SQL
    }
}
`;
    const expected = `<?php
class Foo
{
    public function q(): string
    {
        return <<<SQL
            SELECT 1
            SQL;
    }
}
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('heredoc closer followed by more code on the same line', () => {
    const input = `<?php
foo(<<<EOT
body
EOT, 'x')
`;
    const expected = `<?php
foo(<<<EOT
body
EOT, 'x');
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('unclosed heredoc bails entirely (fail-closed)', () => {
    const input = `<?php
$a = 1;
$q = <<<EOT
never closed
`;
    expect(analyze(input)).toEqual([]);
  });

  it('unterminated string bails entirely (fail-closed)', () => {
    expect(analyze(`<?php\n$a = "open\n`)).toEqual([]);
  });
});
