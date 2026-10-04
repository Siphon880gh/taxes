<?php
declare(strict_types=1);

const MAX_BYTES = 33554432;
const ALLOWED_EXTENSIONS = [
    "pdf", "png", "jpg", "jpeg", "gif", "webp", "tif", "tiff",
    "txt", "csv", "rtf", "doc", "docx", "xls", "xlsx", "heic", "ofx", "qfx",
];

function sorterRoot(): string
{
    $env = getenv("SORTER_ROOT");
    if (is_string($env) && $env !== "") {
        if (!is_dir($env) && !mkdir($env, 0775, true) && !is_dir($env)) {
            fail(500, "Could not create the sorter root.");
        }
        return rtrim($env, "/");
    }
    return __DIR__;
}

/** @return list<string> */
function categories(): array
{
    $path = __DIR__ . "/categories.json";
    $raw = file_get_contents($path);
    if ($raw === false) {
        fail(500, "Category list is missing.");
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || $decoded === []) {
        fail(500, "Category list is unreadable.");
    }
    $names = [];
    foreach ($decoded as $name) {
        if (!is_string($name) || $name === "" || strpbrk($name, "/\\") !== false || str_contains($name, "..")) {
            fail(500, "Category list has an invalid name.");
        }
        $names[] = $name;
    }
    return $names;
}

function fail(int $status, string $error): never
{
    respond(["ok" => false, "error" => $error], $status);
}

/** @param array<string, mixed> $payload */
function respond(array $payload, int $status = 200): never
{
    if (PHP_SAPI !== "cli") {
        http_response_code($status);
        header("Content-Type: application/json; charset=utf-8");
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit($status >= 400 ? 1 : 0);
}

/** @return array{0: string, 1: string, 2: list<string>} */
function ensureDirs(): array
{
    $root = sorterRoot();
    $stage = $root . "/stage";
    if (!is_dir($stage) && !mkdir($stage, 0775, true) && !is_dir($stage)) {
        fail(500, "Could not create the staging directory.");
    }
    $names = categories();
    foreach ($names as $name) {
        $dir = $root . "/" . $name;
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            fail(500, "Could not create a category folder.");
        }
    }
    return [$root, $stage, $names];
}

/** @return list<array{name: string, bytes: int}> */
function listFiles(string $dir): array
{
    $scan = scandir($dir);
    if ($scan === false) {
        return [];
    }
    $items = [];
    foreach ($scan as $name) {
        if ($name === "." || $name === ".." || str_starts_with($name, ".")) {
            continue;
        }
        $path = $dir . "/" . $name;
        if (!is_file($path)) {
            continue;
        }
        $size = filesize($path);
        $items[] = ["name" => $name, "bytes" => $size === false ? 0 : $size];
    }
    usort($items, static fn (array $a, array $b): int => strcmp($a["name"], $b["name"]));
    return $items;
}

/** @return array{ok: true, stageDir: string, files: list<array{name: string, bytes: int}>, categories: list<array{name: string, files: list<array{name: string, bytes: int}>}>} */
function statusPayload(): array
{
    [$root, $stage, $names] = ensureDirs();
    $categories = [];
    foreach ($names as $name) {
        $categories[] = ["name" => $name, "files" => listFiles($root . "/" . $name)];
    }
    return [
        "ok" => true,
        "stageDir" => "sorter/stage",
        "files" => listFiles($stage),
        "categories" => $categories,
    ];
}

function stagedName(string $original): string
{
    $base = basename(str_replace("\\", "/", $original));
    $base = str_replace("\0", "", $base);
    $base = preg_replace('/[\x00-\x1F\x7F]/', "", $base) ?? "";
    $base = trim($base);
    if ($base === "" || $base === "." || $base === "..") {
        return "";
    }
    if (strlen($base) > 180) {
        $base = substr($base, -180);
    }
    return $base;
}

function extensionOf(string $name): string
{
    $pos = strrpos($name, ".");
    if ($pos === false || $pos === strlen($name) - 1) {
        return "";
    }
    return strtolower(substr($name, $pos + 1));
}

function uniquePath(string $dir, string $name): string
{
    $path = $dir . "/" . $name;
    if (!file_exists($path)) {
        return $path;
    }
    $ext = extensionOf($name);
    $stem = $ext === "" ? $name : substr($name, 0, -(strlen($ext) + 1));
    for ($i = 2; $i < 1000; $i++) {
        $candidate = $ext === "" ? $stem . "-" . $i : $stem . "-" . $i . "." . $ext;
        $path = $dir . "/" . $candidate;
        if (!file_exists($path)) {
            return $path;
        }
    }
    fail(500, "Could not find a free file name.");
}

/** @return array{name: string}|array{error: string} */
function tryStore(string $tmp, string $original, bool $uploaded): array
{
    if ($tmp === "" || !is_file($tmp)) {
        return ["error" => "That upload did not arrive."];
    }
    if ($uploaded && !is_uploaded_file($tmp)) {
        return ["error" => "That upload did not arrive."];
    }
    [, $stage] = ensureDirs();
    $name = stagedName($original);
    if ($name === "") {
        return ["error" => "That file needs a name."];
    }
    $ext = extensionOf($name);
    if (!in_array($ext, ALLOWED_EXTENSIONS, true)) {
        return ["error" => "That file type cannot be staged."];
    }
    $bytes = filesize($tmp);
    if ($bytes === false || $bytes <= 0) {
        return ["error" => "That file is empty."];
    }
    if ($bytes > MAX_BYTES) {
        return ["error" => "That file is larger than 32 MB."];
    }
    $dest = uniquePath($stage, $name);
    $stageReal = realpath($stage);
    $parentReal = realpath(dirname($dest));
    if ($stageReal === false || $parentReal === false || $parentReal !== $stageReal) {
        return ["error" => "Could not stage that file."];
    }
    $stored = $uploaded ? move_uploaded_file($tmp, $dest) : copy($tmp, $dest);
    if (!$stored) {
        return ["error" => "Could not stage that file."];
    }
    return ["name" => basename($dest)];
}

function placeFile(string $file, string $category): string
{
    [$root, $stage, $names] = ensureDirs();
    if (!in_array($category, $names, true)) {
        fail(400, "Unknown category.");
    }
    $name = stagedName($file);
    if ($name === "" || $name !== basename(str_replace("\\", "/", $file))) {
        fail(400, "Unknown staged file.");
    }
    $from = $stage . "/" . $name;
    $stageReal = realpath($stage);
    $fromReal = realpath($from);
    if ($stageReal === false || $fromReal === false || !is_file($fromReal) || dirname($fromReal) !== $stageReal) {
        fail(404, "That file is not in the staging directory.");
    }
    $destDir = $root . "/" . $category;
    $dest = uniquePath($destDir, $name);
    $destParent = realpath(dirname($dest));
    $categoryReal = realpath($destDir);
    if ($destParent === false || $categoryReal === false || $destParent !== $categoryReal) {
        fail(400, "Could not place that file.");
    }
    if (!rename($fromReal, $dest)) {
        fail(500, "Could not place that file.");
    }
    return basename($dest);
}

/** @param list<array{name?: string, error?: string}> $results */
function finishUpload(array $results): never
{
    $staged = [];
    $rejected = [];
    foreach ($results as $result) {
        if (isset($result["name"])) {
            $staged[] = $result["name"];
        } else {
            $rejected[] = ["name" => $result["file"] ?? "", "error" => $result["error"] ?? "Could not stage that file."];
        }
    }
    $payload = ["ok" => $staged !== [], "staged" => $staged, "rejected" => $rejected];
    if ($staged === []) {
        $payload["error"] = $rejected[0]["error"] ?? "No files were staged.";
        respond($payload, 400);
    }
    respond($payload);
}

function cli(array $argv): never
{
    $cmd = $argv[1] ?? "status";
    if ($cmd === "status") {
        respond(statusPayload());
    }
    if ($cmd === "upload") {
        $path = $argv[2] ?? "";
        if ($path === "" || !is_file($path)) {
            fail(400, "Upload needs a readable file.");
        }
        $stored = tryStore($path, basename($path), false);
        $stored["file"] = basename($path);
        finishUpload([$stored]);
    }
    if ($cmd === "place") {
        $file = $argv[2] ?? "";
        $category = $argv[3] ?? "";
        $placed = placeFile($file, $category);
        respond(["ok" => true, "placed" => $placed, "category" => $category]);
    }
    fail(400, "Unknown sorter action.");
}

/** @return list<array{name: string, tmp: string, error: int}> */
function collectUploads(): array
{
    $out = [];
    foreach (["file", "files"] as $key) {
        if (!isset($_FILES[$key]) || !is_array($_FILES[$key])) {
            continue;
        }
        $item = $_FILES[$key];
        if (is_array($item["name"] ?? null)) {
            $count = count($item["name"]);
            for ($i = 0; $i < $count; $i++) {
                $out[] = [
                    "name" => (string) $item["name"][$i],
                    "tmp" => (string) $item["tmp_name"][$i],
                    "error" => (int) $item["error"][$i],
                ];
            }
        } else {
            $out[] = [
                "name" => (string) ($item["name"] ?? ""),
                "tmp" => (string) ($item["tmp_name"] ?? ""),
                "error" => (int) ($item["error"] ?? UPLOAD_ERR_NO_FILE),
            ];
        }
    }
    return $out;
}

if (PHP_SAPI === "cli") {
    cli($argv);
}

$method = $_SERVER["REQUEST_METHOD"] ?? "GET";
$action = isset($_GET["action"]) ? (string) $_GET["action"] : "";
$json = null;
$contentType = $_SERVER["CONTENT_TYPE"] ?? "";
if ($method === "POST" && str_contains($contentType, "application/json")) {
    $raw = file_get_contents("php://input");
    $decoded = json_decode($raw === false ? "" : $raw, true);
    $json = is_array($decoded) ? $decoded : [];
    if ($action === "" && isset($json["action"])) {
        $action = (string) $json["action"];
    }
}
if ($action === "" && isset($_POST["action"])) {
    $action = (string) $_POST["action"];
}

if ($action === "status" && ($method === "GET" || $method === "POST")) {
    respond(statusPayload());
}

if ($method === "POST" && $action === "upload") {
    $results = [];
    foreach (collectUploads() as $upload) {
        if ($upload["error"] === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        if ($upload["error"] === UPLOAD_ERR_INI_SIZE || $upload["error"] === UPLOAD_ERR_FORM_SIZE) {
            $results[] = ["file" => $upload["name"], "error" => "That file is larger than 32 MB."];
            continue;
        }
        if ($upload["error"] !== UPLOAD_ERR_OK) {
            $results[] = ["file" => $upload["name"], "error" => "That upload did not arrive."];
            continue;
        }
        $stored = tryStore($upload["tmp"], $upload["name"], true);
        $stored["file"] = $upload["name"];
        $results[] = $stored;
    }
    if ($results === []) {
        fail(400, "Choose a file to stage.");
    }
    finishUpload($results);
}

if ($method === "POST" && $action === "place") {
    $file = "";
    $category = "";
    if (is_array($json)) {
        $file = (string) ($json["file"] ?? "");
        $category = (string) ($json["category"] ?? "");
    }
    if ($file === "" && isset($_POST["file"])) {
        $file = (string) $_POST["file"];
    }
    if ($category === "" && isset($_POST["category"])) {
        $category = (string) $_POST["category"];
    }
    $placed = placeFile($file, $category);
    respond(["ok" => true, "placed" => $placed, "category" => $category]);
}

fail(400, "Unknown sorter action.");
