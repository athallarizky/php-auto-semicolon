import { describe, expect, it } from 'vitest';
import { analyze } from '../../analyze';
import { fix } from '../helpers';

describe('miscellaneous edge cases', () => {
  it('empty file', () => {
    expect(analyze('')).toEqual([]);
  });

  it('whitespace-only file', () => {
    expect(analyze("   \n\t\n")).toEqual([]);
  });

  it('comment-only file', () => {
    expect(analyze("<?php\n// nothing here\n")).toEqual([]);
  });

  it('file without any PHP tag is ignored', () => {
    expect(analyze("<div>plain html</div>\n")).toEqual([]);
  });

  it('goto labels are untouched', () => {
    const input = `<?php
start:
$i = $i + 1
if ($i < 10) {
    goto start
}
`;
    const expected = `<?php
start:
$i = $i + 1;
if ($i < 10) {
    goto start;
}
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('CRLF line endings', () => {
    const input = ['<?php', '$a = 1', '$b = new Foo()', ''].join('\r\n');
    const expected = ['<?php', '$a = 1;', '$b = new Foo();', ''].join('\r\n');
    expect(fix(input, analyze)).toBe(expected);
  });

  it('CRLF insertion position excludes the CR', () => {
    const input = '<?php\r\n$a = 1\r\n';
    const edits = analyze(input);
    expect(edits).toEqual([{ line: 1, character: 6, text: ';' }]);
  });

  it('tabs count as one character in columns', () => {
    const input = "<?php\n\t\t$value = 42\n";
    const edits = analyze(input);
    expect(edits).toEqual([{ line: 1, character: 13, text: ';' }]);
  });

  it('already-terminated file is a no-op (basic idempotence)', () => {
    const input = `<?php
$a = 1;
$b = [1, 2, 3];
$c = foo() -> bar();
class A {
    public function b(): void {
        $this->c = 1;
    }
}
`;
    expect(analyze(input)).toEqual([]);
  });

  it('unbalanced parens anywhere bail the whole file', () => {
    expect(analyze('<?php\n$ok = fine();\n$bad = oops(\n')).toEqual([]);
  });

  it('multiple edits are sorted and applied at correct columns', () => {
    const input = `<?php
$a = 1
$b = 2
$c = 3
`;
    expect(analyze(input)).toEqual([
      { line: 1, character: 6, text: ';' },
      { line: 2, character: 6, text: ';' },
      { line: 3, character: 6, text: ';' },
    ]);
  });

  it('static property and constant access chains', () => {
    const input = `<?php
$now = Carbon::now()
$limit = self::LIMIT
$svc = static::resolver()::instance()
`;
    const expected = `<?php
$now = Carbon::now();
$limit = self::LIMIT;
$svc = static::resolver()::instance();
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('list() and nested assignments', () => {
    const input = `<?php
[$min, $max] = getRange()
list($x, $y) = point()
`;
    const expected = `<?php
[$min, $max] = getRange();
list($x, $y) = point();
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('throw and yield statements', () => {
    const input = `<?php
throw new RuntimeException('nope')
yield $value
`;
    const expected = `<?php
throw new RuntimeException('nope');
yield $value;
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('references and compound assignments', () => {
    const input = `<?php
$b = &$a
$c += 5
$d .= 'x'
`;
    const expected = `<?php
$b = &$a;
$c += 5;
$d .= 'x';
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('instanceof continuation', () => {
    const input = `<?php
$ok = $obj
    instanceof Foo
`;
    const expected = `<?php
$ok = $obj
    instanceof Foo;
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('very long statement heads (>256 chars) still terminate', () => {
    const long = '$' + 'a'.repeat(300);
    const input = `<?php\n${long} = 1\n`;
    expect(fix(input, analyze)).toBe(`<?php\n${long} = 1;\n`);
  });

  it('suppressed (error-control) operator statements still terminate', () => {
    const input = `<?php
@file_put_contents($path, $data)
$ok = @unlink($file)
`;
    const expected = `<?php
@file_put_contents($path, $data);
$ok = @unlink($file);
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('`::class` constants never look like class declarations (Laravel relations)', () => {
    // Real-world shape from a Laravel model — `Folder::class` inside a
    // return statement previously poisoned decl-head detection and
    // suppressed every semicolon in the file.
    const input = `<?php

class Folder extends Model {
    public function parent(): BelongsTo {
        return $this->belongsTo(Folder::class, 'parent_id')
    }

    public function children(): HasMany {
        return $this->hasMany(Folder::class, 'parent_id')
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by')
    }
}
`;
    const expected = `<?php

class Folder extends Model {
    public function parent(): BelongsTo {
        return $this->belongsTo(Folder::class, 'parent_id');
    }

    public function children(): HasMany {
        return $this->hasMany(Folder::class, 'parent_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('`->class` property access and `::class` in arrays stay expressions', () => {
    const input = `<?php
return $this->morphMap([
    'folder' => Folder::class
])
$x = $obj->class
`;
    const expected = `<?php
return $this->morphMap([
    'folder' => Folder::class
]);
$x = $obj->class;
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('typed by-reference parameter and nullable types do not confuse the scanner', () => {
    const input = `<?php
function tweak(?string &$s, int|false $n): void
{
    $s = trim($s ?? '')
    $n = (int) $n
}
`;
    const expected = `<?php
function tweak(?string &$s, int|false $n): void
{
    $s = trim($s ?? '');
    $n = (int) $n;
}
`;
    expect(fix(input, analyze)).toBe(expected);
  });
});
