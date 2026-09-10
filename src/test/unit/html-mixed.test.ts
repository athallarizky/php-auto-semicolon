import { describe, expect, it } from 'vitest';
import { analyze } from '../../analyze';
import { fix } from '../helpers';

describe('mixed PHP + HTML files', () => {
  it('leading HTML before `<?php` is skipped; `?>` implies `;` (no insert)', () => {
    const input = `<!DOCTYPE html>
<html>
<body>
<?php
echo $title
?>
</body>
</html>
`;
    expect(fix(input, analyze)).toBe(input);
  });

  it('statement before `?>` is left alone (close tag implies `;`)', () => {
    const input = `<?php
$a = 5
?>
<p><?= $a ?></p>
`;
    expect(fix(input, analyze)).toBe(input);
  });

  it('`<?php` re-open after HTML continues cleanly', () => {
    const input = `<ul>
<?php foreach ($items as $item): ?>
  <li><?= $item ?></li>
<?php endforeach; ?>
</ul>
`;
    expect(fix(input, analyze)).toBe(input);
  });

  it('alternative syntax inside HTML template; `?>` implies `;`', () => {
    const input = `<ul>
<?php if ($visible): ?>
  <li><?php echo render() ?></li>
<?php endif; ?>
</ul>
`;
    expect(fix(input, analyze)).toBe(input);
  });

  it('short echo tag `<?=` never gets a semicolon; `?>` implies `;`', () => {
    const input = `<?php
$x = 1
?>
<?= $x ?>
`;
    expect(fix(input, analyze)).toBe(input);
  });

  it('depth tracking is not poisoned by HTML braces', () => {
    const input = `<?php if ($a) { ?>
<div class="{{ weird }}">text</div>
<?php } ?>
<?php
$b = 2
`;
    const expected = `<?php if ($a) { ?>
<div class="{{ weird }}">text</div>
<?php } ?>
<?php
$b = 2;
`;
    expect(fix(input, analyze)).toBe(expected);
  });
});
