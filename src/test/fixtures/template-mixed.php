<?php $title = 'Monthly Report'; ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <title><?= e($title) ?></title>
</head>
<body>
    <?php if (count($rows) > 0): ?>
    <table>
        <?php foreach ($rows as $row): ?>
        <tr>
            <td><?= e($row['name']) ?></td>
            <td class="total"><?= number_format($row['total'], 2) ?></td>
        </tr>
        <?php endforeach; ?>
    </table>
    <?php else: ?>
    <p>No records found.</p>
    <?php endif; ?>
    <?php
    $stamp = date('Y-m-d');
    echo "<!-- generated {$stamp} -->";
    ?>
</body>
</html>
