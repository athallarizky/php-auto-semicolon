<?php

namespace App\Billing;

interface Discountable
{
    public function discount(): int;

    public function label(): string;
}

enum Plan: string
{
    case Free = 'free';
    case Pro = 'pro';
    case Enterprise = 'enterprise';

    public function label(): string
    {
        return match ($this) {
            Plan::Free => 'Free plan',
            Plan::Pro => 'Pro plan',
            Plan::Enterprise => 'Enterprise plan',
        };
    }

    public function monthlyPrice(): int
    {
        return match ($this) {
            Plan::Free => 0,
            Plan::Pro => 29000,
            Plan::Enterprise => 149000,
        };
    }
}

trait HasPlan
{
    public function isPaid(): bool
    {
        return $this->plan !== Plan::Free;
    }
}

abstract class Subscription implements Discountable
{
    use HasPlan;

    public function __construct(
        protected readonly Plan $plan,
    ) {
    }

    public function discount(): int
    {
        return $this->plan === Plan::Enterprise ? 20 : 0;
    }
}
