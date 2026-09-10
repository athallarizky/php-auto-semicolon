<?php

namespace App\Models;

use App\Casts\Money;
use App\Enums\Status;
use App\Traits\HasUuid;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Invoice extends Model
{
    use HasUuid;

    protected $fillable = [
        'number',
        'total',
        'status',
    ];

    protected $casts = [
        'total' => Money::class,
        'status' => Status::class,
        'issued_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $invoice) {
            $invoice->number = $invoice->number ?? static::nextNumber();
        });
    }

    public function scopePaid(Builder $query): Builder
    {
        return $query->where('status', Status::Paid);
    }

    public function scopeOverdue(Builder $query): Builder
    {
        return $query
            ->where('status', '!=', Status::Paid)
            ->whereDate('due_at', '<', now());
    }

    public function totals(): array
    {
        $subtotal = 0;
        $tax = 0.11 * $subtotal;

        return [
            'subtotal' => $subtotal,
            'tax' => $tax,
            'grand' => $subtotal + $tax,
        ];
    }
}
