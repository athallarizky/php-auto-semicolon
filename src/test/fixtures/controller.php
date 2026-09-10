<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

#[Deprecated(message: 'use ReportApiController')]
final class ReportController extends Controller
{
    public function __construct(
        private readonly ReportService $reports,
        private int $timeout = 5000, // in milliseconds
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $user = User::query()
            ->where('status', 'active')
            ->whereNotNull('email')
            ->orderByDesc('created_at')
            ->limit(25)
            ->get();

        $data = [
            'id' => $user->id,
            'name' => 'Finance',
            'tags' => ['q1', 'q2'],
        ];

        $callback = function (array $row) {
            return $row['id'] * 2;
        };

        $mapped = array_map($callback, $data['tags']);

        $label = match (true) {
            $user->count > 100 => 'high',
            $user->count > 10 => 'medium',
            default => 'low',
        };

        if ($user->exists()) {
            $this->reports->track($user);
        } else {
            logger()->warning('missing user');
        }

        return response()->json([
            'success' => true,
            'label' => $label,
            'rows' => $mapped,
        ]);
    }

    public function store(Request $request): void
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'body' => 'nullable|string',
        ]);

        $report = $this->reports->create($validated['title'], $validated['body'] ?? '');
        $report->save();
    }
}
