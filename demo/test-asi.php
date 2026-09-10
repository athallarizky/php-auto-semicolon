<?php

// Demo file — save this file (Cmd/Ctrl+S) and watch semicolons appear.
// Covers all six spec cases from AGENT.md Section 5.

$name = "Docsy"
$count = 10

$user = User::query()
    ->where('email', $email)
    ->first()

$data = [
    'id' => 1,
    'name' => 'Finance'
]

$callback = function () {
    return 'hello'
}

if ($user->isAdmin()) {
    doSomething()
}

$timeout = 5000 // In milliseconds
