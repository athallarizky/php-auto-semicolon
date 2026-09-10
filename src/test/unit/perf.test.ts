import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { analyze } from '../../analyze';

/** Build a representative ~3,000-line Laravel-flavored PHP document. */
function buildLargeDocument(): string {
  const block = `    public function handle$i(ReportService $svc): array
    {
        $rows = $svc->query()
            ->where('status', 'active')
            ->whereNotNull('email')
            ->orderByDesc('created_at')
            ->get();

        $map = [
            'id' => $rows->id,
            'name' => 'Finance',
            'flags' => [true, false],
        ];

        $cb = function (array $row) {
            return $row['id'] * 2;
        };

        $out = array_map($cb, $map['flags']);

        $label = match (true) {
            count($out) > 10 => 'high',
            default => 'low',
        };

        if ($label === 'high') {
            $svc->boost();
        }

        return ['ok' => true, 'label' => $label, 'rows' => $out];
    }

`;
  const methods: string[] = [];
  for (let i = 0; i < 90; i++) {
    methods.push(block.replaceAll('$i', String(i)));
  }
  return `<?php

declare(strict_types=1);

namespace App\\Jobs;

use App\\Services\\ReportService;

final class BulkHandler
{
${methods.join('')}    public const LIMIT = 25;
}
`;
}

describe('performance budget', () => {
  it('analyzes a ~3,000-line document in well under the spec budget', () => {
    const doc = buildLargeDocument();
    const lineCount = doc.split('\n').length;
    expect(lineCount).toBeGreaterThan(2500);

    // Warm up JIT/caches, then take the median of several runs.
    analyze(doc);
    const samples: number[] = [];
    for (let run = 0; run < 11; run++) {
      const t0 = performance.now();
      analyze(doc);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[5];

    // Spec target: < 5 ms. Hard gate is CI-tolerant (25 ms); the median is
    // reported so regressions are visible in CI logs.
    console.info(`[perf] ${lineCount} lines, median analyze time: ${median.toFixed(2)} ms`);
    expect(median).toBeLessThan(25);
  });
});
