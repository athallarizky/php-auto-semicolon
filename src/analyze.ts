import { decide } from './parser/decide';
import { scan } from './parser/state-machine';
import type { InsertionEdit } from './parser/types';

/**
 * Public API: analyze a PHP document and return the positions where a missing
 * semicolon should be inserted. Pure function, no vscode dependency.
 *
 * Returns an empty array when the document cannot be analyzed safely
 * (unclosed strings/heredocs/comments, unbalanced brackets) — fail-closed:
 * a false negative costs one extra save, a false positive breaks valid code.
 */
export function analyze(text: string): InsertionEdit[] {
  if (!text.includes('<?')) {
    return [];
  }
  const scanResult = scan(text);
  if (!scanResult.clean) {
    return [];
  }
  return decide(scanResult);
}
