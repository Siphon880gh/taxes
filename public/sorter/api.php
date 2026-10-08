<?php
// Upload endpoint for the static export. The panel calls /sorter/api.php.
// Staged files are written to stage/ beside this script and are not executed.
declare(strict_types=1);

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
const MAX_EXTRACT_BYTES = 256 * 1024 * 1024;

if (!function_exists("str_contains")) {
    function str_contains(string $haystack, string $needle): bool
    {
        return $needle === "" || strpos($haystack, $needle) !== false;
    }
}

if (!function_exists("str_starts_with")) {
    function str_starts_with(string $haystack, string $needle): bool
    {
        return $needle === "" || strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}

if (!function_exists("str_ends_with")) {
    function str_ends_with(string $haystack, string $needle): bool
    {
        if ($needle === "") {
            return true;
        }
        return substr($haystack, -strlen($needle)) === $needle;
    }
}

$stage = __DIR__ . "/stage";

function fail(string $message, int $status = 400): never
{
    throw new RuntimeException($message, $status);
}

function send_cors(): void
{
    $origin = $_SERVER["HTTP_ORIGIN"] ?? "";
    $allowed = [
        "http://localhost:43123",
        "http://127.0.0.1:43123",
    ];
    if (in_array($origin, $allowed, true)) {
        header("Access-Control-Allow-Origin: " . $origin);
        header("Vary: Origin");
    }
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
}

function respond(int $status, array $body): never
{
    send_cors();
    http_response_code($status);
    header("Content-Type: application/json; charset=utf-8");
    header("Cache-Control: no-store");
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function normalize_under(string $root, string $path): string
{
    $rootReal = realpath($root);
    if ($rootReal === false) {
        fail("path traversal");
    }
    $rootReal = rtrim(str_replace("\\", "/", $rootReal), "/");
    $path = str_replace("\\", "/", $path);
    if ($path === "" || $path[0] !== "/") {
        $path = $rootReal . "/" . $path;
    }
    $parts = [];
    foreach (explode("/", $path) as $index => $part) {
        if ($part === "" || $part === ".") {
            if ($index === 0) {
                $parts[] = "";
            }
            continue;
        }
        if ($part === "..") {
            fail("path traversal");
        }
        $parts[] = $part;
    }
    $resolved = implode("/", $parts);
    if ($resolved !== $rootReal && !str_starts_with($resolved, $rootReal . "/")) {
        fail("path traversal");
    }
    return $resolved;
}

function sanitize_base(string $name): string
{
    $name = str_replace(["\0", "\\"], ["", "/"], $name);
    $name = basename($name);
    if ($name === "" || $name === "." || $name === ".." || $name === ".gitkeep" || $name === ".htaccess" || $name === ".incoming") {
        fail("bad filename");
    }
    return $name;
}

function archive_kind(string $name): ?string
{
    $lower = strtolower($name);
    if (str_ends_with($lower, ".tar.gz") || str_ends_with($lower, ".tgz") || str_ends_with($lower, ".tar")) {
        return "tar";
    }
    if (str_ends_with($lower, ".zip")) {
        return "zip";
    }
    return null;
}

function unique_path(string $dir, string $filename): string
{
    $ext = pathinfo($filename, PATHINFO_EXTENSION);
    $base = pathinfo($filename, PATHINFO_FILENAME);
    $suffix = $ext === "" ? "" : "." . $ext;
    $candidate = normalize_under($dir, $dir . "/" . $filename);
    $n = 2;
    while (file_exists($candidate)) {
        $candidate = normalize_under($dir, $dir . "/" . $base . " (" . $n . ")" . $suffix);
        $n += 1;
        if ($n > 1000) {
            fail("too many name collisions", 409);
        }
    }
    return $candidate;
}

function ensure_dir(string $dir): void
{
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        fail("could not create a directory", 500);
    }
}

function remove_tree(string $dir): void
{
    if (!file_exists($dir)) {
        return;
    }
    if (is_link($dir) || is_file($dir)) {
        unlink($dir);
        return;
    }
    foreach (scandir($dir) ?: [] as $name) {
        if ($name === "." || $name === "..") {
            continue;
        }
        remove_tree($dir . "/" . $name);
    }
    rmdir($dir);
}

function is_bad_archive_name(string $name): bool
{
    $name = str_replace("\\", "/", $name);
    if ($name === "" || str_starts_with($name, "/") || preg_match("/^[A-Za-z]:/", $name) === 1) {
        return true;
    }
    foreach (explode("/", $name) as $part) {
        if ($part === "..") {
            return true;
        }
    }
    return false;
}

function skip_archive_name(string $name): bool
{
    $name = str_replace("\\", "/", $name);
    return $name === "" || $name === ".DS_Store" || str_starts_with($name, "__MACOSX/") || $name === "__MACOSX" || str_contains($name, "/__MACOSX/") || str_ends_with($name, "/.DS_Store");
}

function write_capped($in, string $target, int &$total): void
{
    ensure_dir(dirname($target));
    $out = fopen($target, "wb");
    if ($out === false || $in === false) {
        fail("could not write extracted file", 500);
    }
    try {
        while (!feof($in)) {
            $chunk = fread($in, 1024 * 1024);
            if ($chunk === false) {
                fail("could not read archive", 400);
            }
            if ($chunk === "") {
                break;
            }
            $total += strlen($chunk);
            if ($total > MAX_EXTRACT_BYTES) {
                fail("archive expands past the size limit", 413);
            }
            fwrite($out, $chunk);
        }
    } finally {
        fclose($out);
        if (is_resource($in)) {
            fclose($in);
        }
    }
}

function extract_zip(string $archive, string $dest, int &$total): void
{
    $zip = new ZipArchive();
    if ($zip->open($archive) !== true) {
        fail("could not extract archive");
    }
    try {
        for ($i = 0; $i < $zip->numFiles; $i += 1) {
            $name = str_replace("\\", "/", (string) $zip->getNameIndex($i));
            if (is_bad_archive_name($name)) {
                fail("path traversal");
            }
            if (skip_archive_name($name)) {
                continue;
            }
            $opsys = 0;
            $attr = 0;
            $zip->getExternalAttributesIndex($i, $opsys, $attr);
            $mode = ($attr >> 16) & 0170000;
            if ($mode === 0120000) {
                fail("symlink in archive");
            }
            if (str_ends_with($name, "/")) {
                $dir = normalize_under($dest, $dest . "/" . rtrim($name, "/"));
                ensure_dir($dir);
                continue;
            }
            $target = normalize_under($dest, $dest . "/" . $name);
            $stream = $zip->getStream($zip->getNameIndex($i));
            if ($stream === false) {
                fail("could not extract archive");
            }
            write_capped($stream, $target, $total);
        }
    } finally {
        $zip->close();
    }
}

function extract_tar(string $archive, string $dest, int &$total): void
{
    $resolved = realpath($archive);
    if ($resolved === false) {
        fail("could not extract archive");
    }
    try {
        $phar = new PharData($resolved);
    } catch (Throwable $error) {
        fail("could not extract archive");
    }
    $needle = "/" . basename($resolved) . "/";
    $entries = new RecursiveIteratorIterator($phar, RecursiveIteratorIterator::SELF_FIRST);
    foreach ($entries as $entry) {
        $pathname = str_replace("\\", "/", $entry->getPathname());
        $pos = strpos($pathname, $needle);
        if ($pos === false) {
            fail("path traversal");
        }
        $rel = substr($pathname, $pos + strlen($needle));
        if (is_bad_archive_name($rel)) {
            fail("path traversal");
        }
        if (skip_archive_name($rel)) {
            continue;
        }
        if ($entry->isLink()) {
            fail("symlink in archive");
        }
        if ($entry->isDir()) {
            ensure_dir(normalize_under($dest, $dest . "/" . $rel));
            continue;
        }
        if (!$entry->isFile()) {
            continue;
        }
        $target = normalize_under($dest, $dest . "/" . $rel);
        $stream = fopen("phar://" . $resolved . "/" . $rel, "rb");
        if ($stream === false) {
            fail("could not extract archive");
        }
        write_capped($stream, $target, $total);
    }
}

function relocate(string $scratch, string $stage): array
{
    $stored = [];
    $walk = function (string $dir) use (&$walk, &$stored, $scratch, $stage): void {
        foreach (scandir($dir) ?: [] as $name) {
            if ($name === "." || $name === ".." || $name === "__MACOSX" || $name === ".DS_Store") {
                continue;
            }
            $abs = $dir . "/" . $name;
            if (is_link($abs)) {
                continue;
            }
            $rel = substr(str_replace("\\", "/", $abs), strlen(str_replace("\\", "/", $scratch)) + 1);
            if (is_bad_archive_name($rel)) {
                fail("path traversal");
            }
            if (is_dir($abs)) {
                $walk($abs);
                continue;
            }
            if (!is_file($abs)) {
                continue;
            }
            $destDir = normalize_under($stage, $stage . "/" . dirname($rel));
            ensure_dir($destDir);
            $dest = unique_path($destDir, basename($abs));
            if (!rename($abs, $dest)) {
                fail("could not store extracted file", 500);
            }
            $stageReal = rtrim(str_replace("\\", "/", (string) realpath($stage)), "/");
            $stored[] = substr(str_replace("\\", "/", $dest), strlen($stageReal) + 1);
        }
    };
    $walk($scratch);
    sort($stored);
    return $stored;
}

function save_upload(array $file, string $stage): array
{
    if (($file["error"] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_INI_SIZE || ($file["error"] ?? 0) === UPLOAD_ERR_FORM_SIZE) {
        fail("file is larger than the upload limit", 413);
    }
    if (($file["error"] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        fail("upload failed");
    }
    if (($file["size"] ?? 0) > MAX_UPLOAD_BYTES) {
        fail("file is larger than 64MB", 413);
    }
    $tmp = (string) ($file["tmp_name"] ?? "");
    if ($tmp === "" || !is_uploaded_file($tmp)) {
        fail("upload failed");
    }
    $filename = sanitize_base((string) ($file["name"] ?? ""));
    ensure_dir($stage);
    $kind = archive_kind($filename);
    if ($kind === null) {
        $dest = unique_path($stage, $filename);
        if (!move_uploaded_file($tmp, $dest)) {
            fail("could not store file", 500);
        }
        chmod($dest, 0644);
        return ["archive" => false, "stored" => [basename($dest)]];
    }
    $ext = $kind === "zip" ? ".zip" : (str_ends_with(strtolower($filename), ".tar") ? ".tar" : ".tar.gz");
    $named = sys_get_temp_dir() . "/sorter-" . bin2hex(random_bytes(6)) . $ext;
    if (!copy($tmp, $named)) {
        fail("could not read upload", 500);
    }
    $scratch = $stage . "/.incoming/extract-" . bin2hex(random_bytes(4));
    ensure_dir($scratch);
    try {
        $total = 0;
        if ($kind === "zip") {
            extract_zip($named, $scratch, $total);
        } else {
            extract_tar($named, $scratch, $total);
        }
        return ["archive" => true, "stored" => relocate($scratch, $stage)];
    } finally {
        @unlink($named);
        remove_tree($scratch);
    }
}

function list_stage(string $stage): array
{
    $files = [];
    if (!is_dir($stage)) {
        return $files;
    }
    $root = rtrim(str_replace("\\", "/", (string) realpath($stage)), "/");
    $walk = function (string $dir) use (&$walk, &$files, $root): void {
        foreach (scandir($dir) ?: [] as $name) {
            if ($name === "." || $name === ".." || $name === ".gitkeep" || $name === ".htaccess" || $name === ".incoming") {
                continue;
            }
            $abs = $dir . "/" . $name;
            if (is_link($abs)) {
                continue;
            }
            if (is_dir($abs)) {
                $walk($abs);
                continue;
            }
            if (!is_file($abs)) {
                continue;
            }
            $path = substr(str_replace("\\", "/", $abs), strlen($root) + 1);
            $parent = dirname($path);
            $files[] = [
                "path" => $path,
                "bytes" => filesize($abs) ?: 0,
                "category" => $parent === "." ? "" : $parent,
            ];
        }
    };
    $walk($root);
    usort($files, static fn(array $a, array $b): int => $a["path"] <=> $b["path"]);
    return $files;
}

function visible_child_dirs(string $dir): array
{
    $found = [];
    if (!is_dir($dir)) {
        return $found;
    }
    foreach (scandir($dir) ?: [] as $name) {
        if ($name === "." || $name === ".." || $name === "" || $name[0] === ".") {
            continue;
        }
        $abs = $dir . "/" . $name;
        if (is_link($abs) || !is_dir($abs)) {
            continue;
        }
        $found[] = $name;
    }
    return $found;
}

function document_folders_present(string $stage): bool
{
    if (visible_child_dirs($stage) !== []) {
        return true;
    }
    $sorter = dirname($stage);
    foreach (visible_child_dirs($sorter) as $name) {
        if ($name === "stage") {
            continue;
        }
        if ($name === "sorted") {
            if (visible_child_dirs($sorter . "/sorted") !== []) {
                return true;
            }
            continue;
        }
        return true;
    }
    return false;
}

function status_payload(string $stage): array
{
    return [
        "ok" => true,
        "root" => "sorter/stage",
        "files" => list_stage($stage),
        "categories" => list_categories($stage),
        "summaries" => is_file($stage . "/Summaries.md"),
        "folders" => document_folders_present($stage),
    ];
}

function sanitize_category(string $category): string
{
    $category = trim(str_replace(["\0", "\\"], ["", "/"], $category));
    if ($category === "" || str_starts_with($category, "/")) {
        fail("bad category");
    }
    $clean = [];
    foreach (explode("/", $category) as $part) {
        if ($part === "" || $part === "." || $part === ".." || $part[0] === ".") {
            fail("bad category");
        }
        $clean[] = $part;
    }
    return implode("/", $clean);
}

function list_categories(string $stage): array
{
    $found = [];
    if (!is_dir($stage)) {
        return $found;
    }
    $root = rtrim(str_replace("\\", "/", (string) realpath($stage)), "/");
    $walk = function (string $dir) use (&$walk, &$found, $root): void {
        foreach (scandir($dir) ?: [] as $name) {
            if ($name === "." || $name === ".." || $name === "" || $name[0] === ".") {
                continue;
            }
            $abs = $dir . "/" . $name;
            if (is_link($abs) || !is_dir($abs)) {
                continue;
            }
            $found[] = substr(str_replace("\\", "/", $abs), strlen($root) + 1);
            $walk($abs);
        }
    };
    $walk($root);
    sort($found);
    return $found;
}

function stage_file(string $rel, string $stage): string
{
    if ($rel === "" || str_contains($rel, "\0") || str_starts_with($rel, "/") || str_starts_with($rel, "\\")) {
        fail("bad path");
    }
    return normalize_under($stage, $stage . "/" . $rel);
}

function place_file(string $rel, string $category, string $stage): array
{
    $category = sanitize_category($category);
    $source = stage_file($rel, $stage);
    if (!file_exists($source)) {
        fail("staged file not found", 404);
    }
    if (is_link($source) || !is_file($source)) {
        fail("only a staged file can be placed");
    }
    $categoryDir = normalize_under($stage, $stage . "/" . $category);
    if (is_link($categoryDir)) {
        fail("bad category");
    }
    ensure_dir($categoryDir);
    $root = rtrim(str_replace("\\", "/", (string) realpath($stage)), "/");
    $sourceNorm = str_replace("\\", "/", $source);
    if (dirname($sourceNorm) === str_replace("\\", "/", $categoryDir)) {
        return ["path" => substr($sourceNorm, strlen($root) + 1), "category" => $category];
    }
    $dest = unique_path($categoryDir, basename($source));
    if (!rename($source, $dest)) {
        fail("could not place that file", 500);
    }
    chmod($dest, 0644);
    return ["path" => substr(str_replace("\\", "/", $dest), strlen($root) + 1), "category" => $category];
}

function remove_category(string $category, string $stage): void
{
    $category = sanitize_category($category);
    $dir = normalize_under($stage, $stage . "/" . $category);
    if (is_link($dir) || !is_dir($dir)) {
        fail("category not found", 404);
    }
    $left = array_values(array_diff(scandir($dir) ?: [], [".", ".."]));
    if ($left !== []) {
        fail("Move every document out of this category before removing it.");
    }
    if (!rmdir($dir)) {
        fail("could not remove that category", 500);
    }
}

function uploads_of(array $files): array
{
    if (!isset($files["name"])) {
        return [];
    }
    if (!is_array($files["name"])) {
        return [$files];
    }
    $out = [];
    foreach ($files["name"] as $index => $name) {
        $out[] = [
            "name" => $name,
            "type" => $files["type"][$index] ?? "",
            "tmp_name" => $files["tmp_name"][$index] ?? "",
            "error" => $files["error"][$index] ?? UPLOAD_ERR_NO_FILE,
            "size" => $files["size"][$index] ?? 0,
        ];
    }
    return $out;
}

send_cors();
if (($_SERVER["REQUEST_METHOD"] ?? "GET") === "OPTIONS") {
    http_response_code(204);
    exit;
}

try {
    ensure_dir($stage);
    $method = $_SERVER["REQUEST_METHOD"] ?? "GET";
    if ($method === "GET") {
        respond(200, status_payload($stage));
    }
    if ($method !== "POST") {
        respond(405, ["ok" => false, "error" => "method not allowed"]);
    }
    $action = (string) ($_POST["action"] ?? "upload");
    if ($action === "status") {
        respond(200, status_payload($stage));
    }
    if ($action === "place") {
        $result = place_file((string) ($_POST["path"] ?? ""), (string) ($_POST["category"] ?? ""), $stage);
        respond(200, ["ok" => true] + $result);
    }
    if ($action === "remove") {
        remove_category((string) ($_POST["category"] ?? ""), $stage);
        respond(200, ["ok" => true]);
    }
    if ($action === "upload") {
        $uploads = uploads_of($_FILES["file"] ?? []);
        if ($uploads === []) {
            respond(400, ["ok" => false, "error" => "missing file"]);
        }
        $stored = [];
        $archive = false;
        foreach ($uploads as $upload) {
            $result = save_upload($upload, $stage);
            $archive = $archive || $result["archive"];
            $stored = array_merge($stored, $result["stored"]);
        }
        respond(200, ["ok" => true, "archive" => $archive, "stored" => $stored]);
    }
    respond(400, ["ok" => false, "error" => "unknown action"]);
} catch (Throwable $error) {
    if (!$error instanceof RuntimeException) {
        respond(500, ["ok" => false, "error" => "sorter error"]);
    }
    $status = $error->getCode();
    if ($status < 400 || $status > 599) {
        $status = 400;
    }
    respond($status, ["ok" => false, "error" => $error->getMessage()]);
}
