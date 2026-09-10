import { describe, expect, it } from 'vitest';
import { analyze } from '../../analyze';
import { fix } from '../helpers';

describe('control structures and declarations', () => {
  it('brace-less control header never terminates (the killer false positive)', () => {
    const input = `<?php
if ($ready)
    doIt()
`;
    const expected = `<?php
if ($ready)
    doIt();
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('else / elseif / while / for / foreach / switch / try headers are untouched', () => {
    const headers = [
      'else',
      'elseif ($a)',
      'while ($i < 10)',
      'for ($i = 0; $i < 5; $i++)',
      'foreach ($items as $item)',
      'switch ($x)',
      'try',
    ];
    for (const h of headers) {
      const input = `<?php\n${h} { }\n`;
      const edits = analyze(input);
      expect(edits.filter((e) => e.line === 1), h).toHaveLength(0);
    }
  });

  it('catch / finally headers are untouched', () => {
    const input = `<?php
try {
} catch (Exception $e) {
} finally {
}
`;
    expect(fix(input, analyze)).toBe(input);
  });

  it('alternative syntax: headers end with `:`, terminators carry their own `;`', () => {
    const input = `<?php
if ($x):
    doIt()
endif;
foreach ($items as $item):
    process($item)
endforeach;
`;
    const expected = `<?php
if ($x):
    doIt();
endif;
foreach ($items as $item):
    process($item);
endforeach;
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('do-while: the trailing `while (...)` is deliberately NOT terminated (fail-closed)', () => {
    const input = `<?php
do {
    tick()
} while ($x)
`;
    const expected = `<?php
do {
    tick();
} while ($x)
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('switch arms with `:` are untouched; arm statements are terminated', () => {
    const input = `<?php
switch ($x) {
    case 'a':
        handleA()
        break
    case 'b':
        handleB()
        break
    default:
        handleDefault()
        break
}
`;
    const expected = `<?php
switch ($x) {
    case 'a':
        handleA();
        break;
    case 'b':
        handleB();
        break;
    default:
        handleDefault();
        break;
}
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('multiline class header with extends/implements', () => {
    const input = `<?php
abstract class ReportController
    extends BaseController
    implements ReportContract
{
    public int $limit = 25

    public function build(): array
    {
        return []
    }
}
`;
    const expected = `<?php
abstract class ReportController
    extends BaseController
    implements ReportContract
{
    public int $limit = 25;

    public function build(): array
    {
        return [];
    }
}
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('interface and trait headers are untouched', () => {
    const input = `<?php
interface HasName
{
    public function name(): string
}
trait LogsActivity
{
    public function log(string $m): void
    {
        echo $m
    }
}
`;
    const expected = `<?php
interface HasName
{
    public function name(): string;
}
trait LogsActivity
{
    public function log(string $m): void
    {
        echo $m;
    }
}
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('enum with backing type and cases', () => {
    const input = `<?php
enum Suit: string
{
    case Hearts = 'H'
    case Spades = 'S'
}
`;
    const expected = `<?php
enum Suit: string
{
    case Hearts = 'H';
    case Spades = 'S';
}
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('namespace and use statements DO get semicolons (spec deviation, correct PHP)', () => {
    const input = `<?php
namespace App\\Controllers
use App\\Models\\User
const FOO = 1
`;
    const expected = `<?php
namespace App\\Controllers;
use App\\Models\\User;
const FOO = 1;
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('use-group braces never receive semicolons', () => {
    const input = `<?php
use App\\Support\\{
    Str,
    Arr
}
`;
    expect(fix(input, analyze)).toBe(input);
  });

  it('declare without braces is deliberately not terminated (fail-closed)', () => {
    const input = `<?php
declare(strict_types=1)
`;
    expect(fix(input, analyze)).toBe(input);
  });

  it('function with return type on its own header line', () => {
    const input = `<?php
function add(int $a, int $b): int
{
    return $a + $b
}
`;
    const expected = `<?php
function add(int $a, int $b): int
{
    return $a + $b;
}
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('global function call and variable statements at top level', () => {
    const input = `<?php
config(['app.debug' => true])
$locale = app()->getLocale()
echo $locale
`;
    const expected = `<?php
config(['app.debug' => true]);
$locale = app()->getLocale();
echo $locale;
`;
    expect(fix(input, analyze)).toBe(expected);
  });
});
