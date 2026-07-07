<?php
$title = "spush PHP example";
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title><?= htmlspecialchars($title, ENT_QUOTES, "UTF-8") ?></title>
  </head>
  <body>
    <h1><?= htmlspecialchars($title, ENT_QUOTES, "UTF-8") ?></h1>
    <p>This file can be uploaded with spush.</p>
  </body>
</html>
