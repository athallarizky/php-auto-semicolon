import { describe, expect, it } from 'vitest';
import { analyze } from '../../analyze';

describe('smoke', () => {
  it('terminates a trivial missing semicolon', () => {
    expect(analyze('<?php\n$a = 1\n')).toEqual([{ line: 1, character: 6, text: ';' }]);
  });

  it('returns no edits for files without PHP tags', () => {
    expect(analyze('just text\n')).toEqual([]);
  });
});
