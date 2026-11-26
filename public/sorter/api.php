<?php
// Upload endpoint for the static export. The panel calls /sorter/api.php.
// Staged files are written to stage/ beside this script and are not executed.
//
// App-only gate (every action, reads included):
//   1. Origin (or, for a GET without Origin, the Referer's origin) must be in app-config.php "origins".
//   2. The X-Taxes-App: 1 header must be present, which forces a CORS preflight from any other website.
//   3. GET ?action=handshake sets a signed, HttpOnly, SameSite=Strict session cookie (12 hours); every other
//      action needs a valid, unexpired cookie.
//   4. POSTs also need the CSRF token the handshake returned, in X-Taxes-Csrf.
// Anything else gets 403 {"ok":false,"error":"forbidden"}. Responses are never cached.
// Optional AI reorganize (ai-status, ai-plan, ai-apply): keys from the app's .env, see .example.env.
declare(strict_types=1);

// PHP notices and warnings carry absolute file paths; keep them out of the JSON the browser reads.
ini_set("display_errors", "0");
ini_set("html_errors", "0");

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

const SESSION_COOKIE = "taxes_sorter";
const SESSION_TTL = 12 * 60 * 60;
const DEFAULT_ORIGINS = [
    "https://wengindustries.com",
    "https://www.wengindustries.com",
    "http://localhost:8888",
    "http://127.0.0.1:8888",
    "http://localhost:43123",
    "http://127.0.0.1:43123",
];

function fail(string $message, int $status = 400): never
{
    throw new RuntimeException($message, $status);
}

/** Server-side settings from app-config.php beside this script (optional). */
function app_config(): array
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . "/app-config.php";
        $loaded = is_file($file) ? require $file : [];
        $config = is_array($loaded) ? $loaded : [];
    }
    return $config;
}

/** "scheme://host[:port]" in lower case, default ports dropped; "" when the value is not an http(s) URL. */
function normalize_origin(string $value): string
{
    $parts = parse_url(trim($value));
    if (!is_array($parts) || !isset($parts["scheme"], $parts["host"])) {
        return "";
    }
    $scheme = strtolower((string) $parts["scheme"]);
    if ($scheme !== "http" && $scheme !== "https") {
        return "";
    }
    $host = strtolower((string) $parts["host"]);
    $port = isset($parts["port"]) ? (int) $parts["port"] : null;
    if ($port === null || ($scheme === "https" && $port === 443) || ($scheme === "http" && $port === 80)) {
        return $scheme . "://" . $host;
    }
    return $scheme . "://" . $host . ":" . $port;
}

function allowed_origins(): array
{
    $list = app_config()["origins"] ?? DEFAULT_ORIGINS;
    $out = [];
    foreach (is_array($list) ? $list : [] as $origin) {
        $normal = normalize_origin((string) $origin);
        if ($normal !== "") {
            $out[] = $normal;
        }
    }
    return $out;
}

function origin_is_allowed(string $origin): bool
{
    $normal = normalize_origin($origin);
    return $normal !== "" && in_array($normal, allowed_origins(), true);
}

/** Origin header; for a GET without one (same-origin browsers omit it), the Referer's origin. */
function request_origin_allowed(string $method): bool
{
    $origin = (string) ($_SERVER["HTTP_ORIGIN"] ?? "");
    if ($origin !== "") {
        return origin_is_allowed($origin);
    }
    $referer = (string) ($_SERVER["HTTP_REFERER"] ?? "");
    return $method === "GET" && $referer !== "" && origin_is_allowed($referer);
}

function send_cors(): void
{
    header("Vary: Origin");
    $origin = (string) ($_SERVER["HTTP_ORIGIN"] ?? "");
    if ($origin !== "" && origin_is_allowed($origin)) {
        header("Access-Control-Allow-Origin: " . $origin);
        header("Access-Control-Allow-Credentials: true");
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
        header("Access-Control-Allow-Headers: Content-Type, X-Taxes-App, X-Taxes-Csrf");
        header("Access-Control-Max-Age: 600");
    }
}

/** HMAC key from .app-secret.php beside this script, created with random_bytes on first use. Never served or committed. */
function app_secret(): string
{
    static $key = null;
    if (is_string($key)) {
        return $key;
    }
    $file = __DIR__ . "/.app-secret.php";
    if (is_file($file)) {
        $loaded = require $file;
        if (is_string($loaded) && preg_match('/^[0-9a-f]{64}$/', $loaded) === 1) {
            return $key = $loaded;
        }
    }
    $fresh = bin2hex(random_bytes(32));
    $tmp = $file . "." . bin2hex(random_bytes(4)) . ".tmp";
    $body = "<?php\n// Generated by api.php. Server-side secret for the sorter session cookie: never commit, upload, or serve it.\nreturn '" . $fresh . "';\n";
    if (file_put_contents($tmp, $body, LOCK_EX) === false || !rename($tmp, $file)) {
        @unlink($tmp);
        fail("sorter error", 500);
    }
    @chmod($file, 0600);
    return $key = $fresh;
}

function sign(string $purpose, string $payload): string
{
    return hash_hmac("sha256", $purpose . "|" . $payload, app_secret());
}

function cookie_path(): string
{
    $dir = str_replace("\\", "/", dirname((string) ($_SERVER["SCRIPT_NAME"] ?? "/sorter/api.php")));
    return rtrim($dir, "/") . "/";
}

function request_is_https(): bool
{
    return (!empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off")
        || strtolower((string) ($_SERVER["HTTP_X_FORWARDED_PROTO"] ?? "")) === "https";
}

/** Sets the session cookie and returns the CSRF token bound to it. */
function issue_session(): array
{
    $issued = time();
    $payload = $issued . "." . bin2hex(random_bytes(16));
    setcookie(SESSION_COOKIE, $payload . "." . sign("session", $payload), [
        "expires" => $issued + SESSION_TTL,
        "path" => cookie_path(),
        "secure" => request_is_https(),
        "httponly" => true,
        "samesite" => "Strict",
    ]);
    return ["csrf" => sign("csrf", $payload), "expires" => $issued + SESSION_TTL];
}

/** The signed "issued.nonce" payload of a valid, unexpired session cookie, or null. */
function session_payload(): ?string
{
    $raw = (string) ($_COOKIE[SESSION_COOKIE] ?? "");
    if (preg_match('/^(\d{1,12})\.([0-9a-f]{32})\.([0-9a-f]{64})$/', $raw, $m) !== 1) {
        return null;
    }
    $payload = $m[1] . "." . $m[2];
    if (!hash_equals(sign("session", $payload), $m[3])) {
        return null;
    }
    $age = time() - (int) $m[1];
    return $age < -60 || $age > SESSION_TTL ? null : $payload;
}

function forbidden(): never
{
    respond(403, ["ok" => false, "error" => "forbidden"]);
}

function respond(int $status, array $body): never
{
    send_cors();
    http_response_code($status);
    header("Content-Type: application/json; charset=utf-8");
    header("Cache-Control: no-store, max-age=0");
    header("Pragma: no-cache");
    header("X-Content-Type-Options: nosniff");
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
            if (basename($path) === "Owed Audit.md" || $path === "AGENTS.md") {
                continue;
            }
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

function owed_audit_paths(string $stage): array
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
            if (is_link($abs)) {
                continue;
            }
            if (is_dir($abs)) {
                $walk($abs);
                continue;
            }
            if ($name === "Owed Audit.md" && is_file($abs)) {
                $found[] = substr(str_replace("\\", "/", $abs), strlen($root) + 1);
            }
        }
    };
    $walk($root);
    sort($found);
    return $found;
}

function read_owed_audit(string $rel, string $stage): array
{
    $rel = str_replace("\\", "/", $rel);
    if (basename($rel) !== "Owed Audit.md") {
        fail("only Owed Audit.md can be opened");
    }
    $abs = stage_file($rel, $stage);
    if (is_link($abs) || !is_file($abs)) {
        fail("Owed Audit.md was not found", 404);
    }
    $markdown = file_get_contents($abs);
    if ($markdown === false) {
        fail("could not read Owed Audit.md", 500);
    }
    $root = rtrim(str_replace("\\", "/", (string) realpath($stage)), "/");
    return [
        "path" => substr(str_replace("\\", "/", $abs), strlen($root) + 1),
        "markdown" => $markdown,
    ];
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
        "owedAudits" => owed_audit_paths($stage),
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

// ---------------------------------------------------------------------------------------------------------------
// "Ask AI to reorganize": optional. Keys come from the app's .env (see .example.env) and stay on this server.
// GET ?action=ai-status says whether a key is set and names the uploads folder. POST ai-plan asks the provider for a
// move plan built from file names only and returns it with a signed, one-time token. POST ai-apply checks the token
// and moves the files the user kept with place_file().

const AI_PLAN_TTL = 30 * 60;
const AI_MAX_FILES = 2000;
const AI_MAX_MOVES = 500;
const AI_KEEP_IN_PLACE = ["AGENTS.md", "Summaries.md", "Owed Audit.md"];
const AI_DEFAULT_MODELS = ["openai" => "gpt-4.1-mini", "anthropic" => "claude-sonnet-4-5"];
const AI_FOLDERS = [
    "_Last year's return", "_This year's return", "_Needs Human Review", "_Proof of identity", "Credits", "Deductions",
    "Estimated tax payments", "Income - Investments", "Income - Other", "Income - Partnerships and S-corps",
    "Income - Rental", "Income - Retirement", "Income - Self-employment", "Income - Wages", "Records - Statements",
    "Regulations - Health Insurance", "Retirement & HSA", "zz_Duplicates",
];

function ai_cut(string $text, int $length): string
{
    return function_exists("mb_substr") ? mb_substr($text, 0, $length) : substr($text, 0, $length);
}

/** KEY=value lines: blank lines and # comments skipped, optional "export ", quotes, inline " #" comments. */
function parse_env(string $text): array
{
    $out = [];
    foreach (preg_split("/\r\n|\n|\r/", $text) ?: [] as $line) {
        $line = trim($line);
        if ($line === "" || $line[0] === "#") {
            continue;
        }
        if (preg_match('/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/', $line, $m) !== 1) {
            continue;
        }
        $value = $m[2];
        if ($value !== "" && ($value[0] === '"' || $value[0] === "'")) {
            $quote = $value[0];
            $end = strpos($value, $quote, 1);
            while ($quote === '"' && $end !== false && $value[$end - 1] === "\\") {
                $end = strpos($value, $quote, $end + 1);
            }
            $inner = $end === false ? substr($value, 1) : substr($value, 1, $end - 1);
            $value = $quote === '"' ? strtr($inner, ["\\n" => "\n", "\\\"" => "\"", "\\\\" => "\\"]) : $inner;
        } else {
            $value = trim((string) preg_replace('/\s+#.*$/', "", $value));
        }
        $out[$m[1]] = $value;
    }
    return $out;
}

/** The first .env found: beside this script, the app folder above it, or the app folder above out/ (deployed copy). */
function env_file(): ?string
{
    $candidates = [__DIR__ . "/.env", dirname(__DIR__) . "/.env"];
    if (basename(dirname(__DIR__)) === "out") {
        $candidates[] = dirname(__DIR__, 2) . "/.env";
    }
    foreach ($candidates as $file) {
        if (is_file($file) && is_readable($file)) {
            return $file;
        }
    }
    return null;
}

function env_value(string $name): string
{
    static $values = null;
    if ($values === null) {
        $file = env_file();
        $values = $file === null ? [] : parse_env((string) file_get_contents($file));
    }
    $value = $values[$name] ?? getenv($name);
    return is_string($value) ? trim($value) : "";
}

/** Provider, model, key and base URL, or a reason when no usable key is set. The key never leaves this file. */
function ai_settings(): array
{
    $keys = ["openai" => env_value("OPENAI_API_KEY"), "anthropic" => env_value("ANTHROPIC_API_KEY")];
    $wanted = strtolower(env_value("AI_PROVIDER"));
    $aliases = ["chatgpt" => "openai", "gpt" => "openai", "claude" => "anthropic"];
    $wanted = $aliases[$wanted] ?? $wanted;
    if ($wanted !== "" && !isset($keys[$wanted])) {
        return ["configured" => false, "reason" => "AI_PROVIDER must be openai or anthropic."];
    }
    $provider = $wanted !== "" ? $wanted : ($keys["openai"] !== "" ? "openai" : ($keys["anthropic"] !== "" ? "anthropic" : ""));
    if ($provider === "" || $keys[$provider] === "") {
        $reason = $wanted === "anthropic" ? "ANTHROPIC_API_KEY is not set in .env."
            : ($wanted === "openai" ? "OPENAI_API_KEY is not set in .env." : "No OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.");
        return ["configured" => false, "reason" => $reason];
    }
    $model = env_value("AI_MODEL");
    $base = $provider === "openai" ? env_value("OPENAI_BASE_URL") : env_value("ANTHROPIC_BASE_URL");
    return [
        "configured" => true,
        "provider" => $provider,
        "model" => $model !== "" ? $model : AI_DEFAULT_MODELS[$provider],
        "key" => $keys[$provider],
        "base" => rtrim($base !== "" ? $base : ($provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com"), "/"),
    ];
}

function ai_status_payload(string $stage): array
{
    $settings = ai_settings();
    // Relative to the app folder only: the browser never sees where the app lives on disk.
    $body = ["ok" => true, "configured" => $settings["configured"], "folder" => "sorter/stage"];
    if ($settings["configured"]) {
        return $body + ["provider" => $settings["provider"], "model" => $settings["model"]];
    }
    return $body + ["reason" => $settings["reason"]];
}

/** Files the AI may move: every listed document except the app's own notes and dotfiles such as .DS_Store. */
function ai_movable_files(string $stage): array
{
    $out = [];
    foreach (list_stage($stage) as $file) {
        $name = basename($file["path"]);
        if (!in_array($name, AI_KEEP_IN_PLACE, true) && $name[0] !== ".") {
            $out[] = $file;
        }
    }
    return $out;
}

/** A folder path under the upload root, or "" when it is unsafe: no leading /, no empty, . or .. or dot segments. */
function ai_clean_category($value): string
{
    if (!is_string($value)) {
        return "";
    }
    $value = trim(str_replace("\\", "/", $value));
    $value = rtrim($value, "/");
    if ($value === "" || str_contains($value, "\0") || str_starts_with($value, "/") || strlen($value) > 200
        || preg_match('/^[A-Za-z]:/', $value) === 1) {
        return "";
    }
    $parts = explode("/", $value);
    if (count($parts) > 6) {
        return "";
    }
    foreach ($parts as $index => $part) {
        $part = trim($part);
        if ($part === "" || $part === "." || $part === ".." || $part[0] === ".") {
            return "";
        }
        $parts[$index] = $part;
    }
    return implode("/", $parts);
}

/**
 * Keeps the moves that name a listed file and a safe folder under the upload root; drops the rest.
 * $files: [["path" => ..., "category" => ...], ...] as list_stage() returns them.
 */
function ai_validate_plan($raw, array $files): array
{
    if (!is_array($raw) || !isset($raw["moves"]) || !is_array($raw["moves"])) {
        fail("The AI reply was not a move plan. Try again.", 502);
    }
    $current = [];
    foreach ($files as $file) {
        $current[(string) $file["path"]] = (string) ($file["category"] ?? "");
    }
    $moves = [];
    $seen = [];
    $skipped = 0;
    foreach ($raw["moves"] as $move) {
        $path = is_array($move) && is_string($move["path"] ?? null) ? str_replace("\\", "/", trim($move["path"])) : "";
        $category = is_array($move) ? ai_clean_category($move["category"] ?? null) : "";
        $unsafe = $path === "" || str_contains("/" . $path . "/", "/../") || str_starts_with($path, "/");
        if ($unsafe || $category === "" || !array_key_exists($path, $current) || isset($seen[$path])
            || count($moves) >= AI_MAX_MOVES) {
            $skipped += 1;
            continue;
        }
        if ($current[$path] === $category) {
            continue;
        }
        $seen[$path] = true;
        $reason = is_string($move["reason"] ?? null) ? trim($move["reason"]) : "";
        $moves[] = ["path" => $path, "category" => $category, "reason" => ai_cut($reason, 240)];
    }
    $summary = is_string($raw["summary"] ?? null) ? ai_cut(trim($raw["summary"]), 600) : "";
    return ["moves" => $moves, "skipped" => $skipped, "summary" => $summary];
}

function ai_prompt(array $files, array $categories): array
{
    $system = "You reorganize a folder of tax documents into category folders. You only see file paths and sizes.\n"
        . "Reply with JSON only, no prose, in this shape: {\"summary\": string, \"moves\": [{\"path\": string, \"category\": string, \"reason\": string}]}.\n"
        . "- path: copy it exactly from the file list.\n"
        . "- category: the destination folder, relative to the upload root, with / between levels. No leading /, no . or .. segments, no segment that starts with a dot.\n"
        . "- Prefer existing folders, then these standard folders: " . implode("; ", AI_FOLDERS) . ".\n"
        . "- Keep a top-level tax-year folder (for example \"Tax Year 2025 - ...\") as the parent when files already sit under one.\n"
        . "- Use _Needs Human Review when the name gives no clue. Leave out files that are already in the right folder.\n"
        . "- Only move files. Do not rename them.";
    $list = array_map(static fn(array $f): string => $f["path"] . "  (" . (int) $f["bytes"] . " bytes)", array_slice($files, 0, AI_MAX_FILES));
    $user = "Existing folders:\n" . ($categories === [] ? "(none)" : implode("\n", $categories))
        . "\n\nFiles:\n" . implode("\n", $list);
    return [$system, $user];
}

function ai_http_post(string $url, array $headers, array $body): array
{
    $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $headers[] = "Content-Type: application/json";
    if (function_exists("curl_init")) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 120,
        ]);
        $text = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($text === false) {
            fail("Could not reach the AI provider: " . $error, 502);
        }
    } else {
        $context = stream_context_create(["http" => [
            "method" => "POST",
            "header" => implode("\r\n", $headers),
            "content" => $json,
            "timeout" => 120,
            "ignore_errors" => true,
        ]]);
        $text = @file_get_contents($url, false, $context);
        if ($text === false) {
            fail("Could not reach the AI provider.", 502);
        }
        $status = preg_match('{^HTTP/\S+\s+(\d{3})}', (string) ($http_response_header[0] ?? ""), $m) === 1 ? (int) $m[1] : 0;
    }
    $decoded = json_decode((string) $text, true);
    if ($status < 200 || $status > 299) {
        $message = is_array($decoded) ? (string) ($decoded["error"]["message"] ?? "") : "";
        fail("The AI provider answered HTTP " . $status . ($message !== "" ? ": " . ai_cut($message, 300) : "."), 502);
    }
    if (!is_array($decoded)) {
        fail("The AI provider sent an unreadable reply.", 502);
    }
    return $decoded;
}

/** The JSON object inside a model reply (tolerates ```json fences and text around it). */
function ai_json_from_text(string $text): ?array
{
    $start = strpos($text, "{");
    $end = strrpos($text, "}");
    if ($start === false || $end === false || $end < $start) {
        return null;
    }
    $decoded = json_decode(substr($text, $start, $end - $start + 1), true);
    return is_array($decoded) ? $decoded : null;
}

function ai_request_plan(array $settings, array $files, array $categories): array
{
    [$system, $user] = ai_prompt($files, $categories);
    if ($settings["provider"] === "openai") {
        $reply = ai_http_post($settings["base"] . "/chat/completions", ["Authorization: Bearer " . $settings["key"]], [
            "model" => $settings["model"],
            "response_format" => ["type" => "json_object"],
            "messages" => [["role" => "system", "content" => $system], ["role" => "user", "content" => $user]],
        ]);
        $text = (string) ($reply["choices"][0]["message"]["content"] ?? "");
    } else {
        $reply = ai_http_post($settings["base"] . "/v1/messages", ["x-api-key: " . $settings["key"], "anthropic-version: 2023-06-01"], [
            "model" => $settings["model"],
            "max_tokens" => 8000,
            "system" => $system,
            "messages" => [["role" => "user", "content" => $user]],
        ]);
        $text = "";
        foreach (is_array($reply["content"] ?? null) ? $reply["content"] : [] as $block) {
            if (is_array($block) && ($block["type"] ?? "") === "text") {
                $text .= (string) ($block["text"] ?? "");
            }
        }
    }
    $plan = ai_json_from_text($text);
    if ($plan === null) {
        fail("The AI reply was not a move plan. Try again.", 502);
    }
    return $plan;
}

function ai_plan_hash(array $moves): string
{
    $pairs = array_map(static fn(array $m): array => [(string) $m["path"], (string) $m["category"]], $moves);
    return hash("sha256", (string) json_encode($pairs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function ai_plan_token(string $session, array $moves): string
{
    $payload = (time() + AI_PLAN_TTL) . "." . bin2hex(random_bytes(12));
    return $payload . "." . sign("ai-plan", $session . "|" . $payload . "|" . ai_plan_hash($moves));
}

/** Checks the token against this session and plan, then records its nonce so it works once. */
function ai_spend_token(string $token, string $session, array $moves): void
{
    if (preg_match('/^(\d{1,12})\.([0-9a-f]{24})\.([0-9a-f]{64})$/', $token, $m) !== 1) {
        fail("This plan is no longer valid. Ask AI again.", 409);
    }
    $payload = $m[1] . "." . $m[2];
    if (!hash_equals(sign("ai-plan", $session . "|" . $payload . "|" . ai_plan_hash($moves)), $m[3]) || (int) $m[1] < time()) {
        fail("This plan is no longer valid. Ask AI again.", 409);
    }
    $file = __DIR__ . "/.ai-plans-used.json";
    $handle = fopen($file, "c+");
    if ($handle === false) {
        fail("sorter error", 500);
    }
    try {
        flock($handle, LOCK_EX);
        $used = json_decode((string) stream_get_contents($handle), true);
        $used = is_array($used) ? array_filter($used, static fn($expires): bool => is_int($expires) && $expires >= time()) : [];
        if (isset($used[$m[2]])) {
            fail("This plan was already applied. Ask AI again.", 409);
        }
        $used[$m[2]] = (int) $m[1];
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, (string) json_encode($used));
        fflush($handle);
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
    @chmod($file, 0600);
}

function ai_plan(string $session, string $stage): array
{
    $settings = ai_settings();
    if (!$settings["configured"]) {
        fail("AI is not set up: " . $settings["reason"], 409);
    }
    $files = ai_movable_files($stage);
    if ($files === []) {
        fail("Nothing is staged to reorganize.");
    }
    $plan = ai_validate_plan(ai_request_plan($settings, $files, list_categories($stage)), $files);
    return $plan + [
        "token" => ai_plan_token($session, $plan["moves"]),
        "provider" => $settings["provider"],
        "model" => $settings["model"],
    ];
}

/** Applies the moves at the indexes in $keep from a plan returned by ai_plan(). */
function ai_apply(string $session, string $planJson, string $token, string $keep, string $stage): array
{
    $decoded = json_decode($planJson, true);
    if (!is_array($decoded)) {
        fail("bad plan");
    }
    $moves = [];
    foreach ($decoded as $move) {
        if (!is_array($move) || !is_string($move["path"] ?? null) || !is_string($move["category"] ?? null)) {
            fail("bad plan");
        }
        $moves[] = ["path" => $move["path"], "category" => $move["category"]];
    }
    ai_spend_token($token, $session, $moves);
    $indexes = $keep === "" ? [] : array_map("intval", explode(",", $keep));
    $moved = [];
    $failed = [];
    foreach (array_unique($indexes) as $index) {
        if (!isset($moves[$index])) {
            continue;
        }
        $move = $moves[$index];
        try {
            if (ai_clean_category($move["category"]) === "" || in_array(basename($move["path"]), AI_KEEP_IN_PLACE, true)) {
                fail("bad move");
            }
            $moved[] = ["from" => $move["path"]] + place_file($move["path"], $move["category"], $stage);
        } catch (RuntimeException $error) {
            $failed[] = ["path" => $move["path"], "error" => $error->getMessage()];
        }
    }
    return ["moved" => $moved, "failed" => $failed];
}

$method = (string) ($_SERVER["REQUEST_METHOD"] ?? "GET");
if ($method === "OPTIONS") {
    if (!origin_is_allowed((string) ($_SERVER["HTTP_ORIGIN"] ?? ""))) {
        forbidden();
    }
    send_cors();
    header("Cache-Control: no-store, max-age=0");
    http_response_code(204);
    exit;
}

try {
    if (!request_origin_allowed($method) || ($_SERVER["HTTP_X_TAXES_APP"] ?? "") !== "1") {
        forbidden();
    }
    if ($method === "GET" && ($_GET["action"] ?? "") === "handshake") {
        respond(200, ["ok" => true] + issue_session());
    }
    $session = session_payload();
    if ($session === null) {
        forbidden();
    }
    if ($method === "POST") {
        $csrf = (string) ($_SERVER["HTTP_X_TAXES_CSRF"] ?? "");
        if ($csrf === "" || !hash_equals(sign("csrf", $session), $csrf)) {
            forbidden();
        }
    }
    ensure_dir($stage);
    if ($method === "GET") {
        if (($_GET["action"] ?? "") === "ai-status") {
            respond(200, ai_status_payload($stage));
        }
        if (isset($_GET["owed"])) {
            $result = read_owed_audit((string) $_GET["owed"], $stage);
            respond(200, ["ok" => true] + $result);
        }
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
    if ($action === "ai-plan") {
        respond(200, ["ok" => true] + ai_plan($session, $stage));
    }
    if ($action === "ai-apply") {
        $result = ai_apply($session, (string) ($_POST["plan"] ?? ""), (string) ($_POST["token"] ?? ""), (string) ($_POST["keep"] ?? ""), $stage);
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
