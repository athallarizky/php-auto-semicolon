<?php

namespace App\Repositories;

use App\Models\Invoice;
use Illuminate\Support\Facades\DB;

class InvoiceRepository
{
    public function search(string $term): array
    {
        $rows = DB::select(<<<'SQL'
            SELECT i.number, i.total, c.name AS customer
            FROM invoices i
            JOIN customers c ON c.id = i.customer_id
            WHERE c.name LIKE :term
              AND i.deleted_at IS NULL
            ORDER BY i.issued_at DESC
            SQL, ['term' => "%{$term}%"]);

        $explain = DB::select(<<<SQL
            EXPLAIN SELECT * FROM invoices WHERE total > 100
            SQL);

        $ids = array_map(static fn ($row) => $row->number, $rows);

        $chunk = Invoice::query()
            ->whereIn('number', $ids)
            ->chunkMap(function (Invoice $invoice) {
                return $invoice->only(['number', 'total']);
            });

        $found = count($rows);

        $summary = <<<TXT
            Found {$found} invoices for term "{$term}".
            TXT;

        return [
            'rows' => $rows,
            'ids' => $ids,
            'summary' => trim($summary),
        ];
    }
}
