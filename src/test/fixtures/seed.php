<?php

namespace Database\Seeders;

use App\Enums\Status;
use App\Models\Invoice;
use Illuminate\Database\Seeder;

class InvoiceSeeder extends Seeder
{
    public function run(): void
    {
        $statuses = [Status::Draft, Status::Sent, Status::Paid];

        foreach (range(1, 10) as $i) {
            $invoice = Invoice::create([
                'number' => sprintf('INV-%04d', $i),
                'total' => $i * 12500,
                'status' => $statuses[$i % 3],
            ]);

            if ($i % 2 === 0) {
                $invoice->markAsSeen();
            }
        }

        $send = function (string $to): bool {
            return mail($to, 'seeded', 'done');
        };

        $ok = $send('ops@example.com') && $send('fin@example.com');

        do {
            $processed = Invoice::whereNull('sent_at')->count();
        } while ($processed > 0);

        static::$seeded = $ok ?: false;
    }
}
