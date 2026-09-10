import { describe, expect, it } from 'vitest';
import { analyze } from '../../analyze';
import { fix } from '../helpers';

describe('closures, anonymous classes, and match expressions', () => {
  it('closure assigned to a variable gets `};`', () => {
    const input = `<?php
$fn = function () {
    return 1
}
`;
    expect(fix(input, analyze)).toBe(`<?php
$fn = function () {
    return 1;
};
`);
  });

  it('static closure assigned to a variable gets `};`', () => {
    const input = `<?php
$fn = static function () {
    return 1
}
`;
    expect(fix(input, analyze)).toBe(`<?php
$fn = static function () {
    return 1;
};
`);
  });

  it('closure with `use` capture gets `};`', () => {
    const input = `<?php
$fn = function () use ($x, &$y) {
    return $x
}
`;
    expect(fix(input, analyze)).toBe(`<?php
$fn = function () use ($x, &$y) {
    return $x;
};
`);
  });

  it('closure as function argument does NOT get `};` (closure-as-argument guard)', () => {
    const input = `<?php
array_map(function () {
    return 1
}, $arr)
`;
    const expected = `<?php
array_map(function () {
    return 1;
}, $arr);
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('closure as trailing argument with `)` on its own line', () => {
    const input = `<?php
$this->each(function (Item $item) {
    $item->save()
})
`;
    const expected = `<?php
$this->each(function (Item $item) {
    $item->save();
});
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('returned closure gets `};`', () => {
    const input = `<?php
return function () {
    return 1
}
`;
    expect(fix(input, analyze)).toBe(`<?php
return function () {
    return 1;
};
`);
  });

  it('closure stored in array element does not break — outer `]` gets `;`', () => {
    const input = `<?php
$map = [
    'key' => function () {
        return 1
    },
]
`;
    const expected = `<?php
$map = [
    'key' => function () {
        return 1;
    },
];
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('arrow function (`fn`) has no braces — normal insertion applies', () => {
    const input = `<?php
$double = fn ($n) => $n * 2
`;
    expect(fix(input, analyze)).toBe(`<?php
$double = fn ($n) => $n * 2;
`);
  });

  it('anonymous class assigned to a variable gets `};`', () => {
    const input = `<?php
$logger = new class {
    public function log($m)
    {
        echo $m
    }
}
`;
    const expected = `<?php
$logger = new class {
    public function log($m)
    {
        echo $m;
    }
};
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('match expression assigned to a variable gets `};`; arms stay bare', () => {
    const input = `<?php
$code = match (true) {
    $x > 90 => 'high'
    default => 'low'
}
`;
    // arms are suppressed entirely; only `}` gains `;`
    expect(fix(input, analyze)).toBe(`<?php
$code = match (true) {
    $x > 90 => 'high'
    default => 'low'
};
`);
  });

  it('returned match expression gets `};`', () => {
    const input = `<?php
return match ($x) {
    1 => 'a'
    default => 'b'
}
`;
    expect(fix(input, analyze)).toBe(`<?php
return match ($x) {
    1 => 'a'
    default => 'b'
};
`);
  });

  it('closure via ternary keeps assignment context', () => {
    const input = `<?php
$handler = $debug
    ? function () { return 1
    }
    : function () { return 2
    }
`;
    const expected = `<?php
$handler = $debug
    ? function () { return 1;
    }
    : function () { return 2;
    };
`;
    expect(fix(input, analyze)).toBe(expected);
  });

  it('multi-statement closure bodies are all fixed', () => {
    const input = `<?php
$run = function ($a) {
    $b = $a + 1
    return $b
}
`;
    const expected = `<?php
$run = function ($a) {
    $b = $a + 1;
    return $b;
};
`;
    expect(fix(input, analyze)).toBe(expected);
  });
});
