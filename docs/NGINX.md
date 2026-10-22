# nginx: the same blocking as the .htaccess files

nginx ignores `.htaccess` entirely. On an nginx host, `.htaccess`, `sorter/.htaccess`, `sorter/stage/.htaccess`, and the `out/sorter/` copies do nothing, and every staged tax document is downloadable unless the server block has rules like the ones below.

The rules match the `.htaccess` files:

| Path under `/app/taxes/` | Direct HTTP |
|---|---|
| `out/`, `index.html` | served |
| `sorter/api.php`, `out/sorter/api.php` | passed to PHP-FPM |
| anything else under `sorter/` or `out/sorter/` (`stage/`, `sorted/`, uploads, `Summaries.md`, `Owed Audit.md`) | denied |
| dotfiles and dot-folders (`.env*`, `.git/`, `.agents/`, `.htaccess`) | denied |
| `context/`, `scripts/`, `src/`, `tests/`, `docs/`, `node_modules/` | denied |

`api.php` still reads and writes `sorter/stage/` on disk. These rules govern HTTP only.

## Paste into the `server { }` block

Change `/app/taxes` if the app lives at another path (locally under MAMP it is `/weng/app/taxes`).

Regex locations are tried **in the order they appear**, and the first match wins. Put these **above** the existing PHP block (`location ~ \.php$ { ... fastcgi_pass ...; }`). If they come after it, a request such as `/app/taxes/sorter/stage/x.php` matches the PHP block first and runs.

```nginx
# --- Tax Final Confirmation (app/taxes): keep above "location ~ \.php$" ---

# Dotfiles and dot-folders: .env, .env.local, .git/, .agents/, .htaccess
location ~ ^/app/taxes/(.*/)?\. {
    deny all;
}

# Source, tooling, and notes
location ~* ^/app/taxes/(context|scripts|src|tests|docs|node_modules)(/|$) {
    deny all;
}

# Document sorter: everything except api.php (stage/, sorted/, uploads, Summaries.md, Owed Audit.md)
location ~* ^/app/taxes/(out/)?sorter(/(?!api\.php$)|$) {
    deny all;
}

# --- end Tax Final Confirmation ---
```

`/app/taxes/sorter/api.php` and `/app/taxes/out/sorter/api.php` match none of these, so they fall through to the existing `location ~ \.php$` block and PHP-FPM runs them as before. Nothing else is needed for `api.php`.

## Alternative: prefix blocks with `^~`

This replaces only the sorter regex above; keep the dotfile and source-folder blocks. If you prefer prefix locations for the sorter, mark them `^~`. A plain prefix location (`location /app/taxes/sorter/ { deny all; }`) does **not** stop nginx from checking regex locations, so the `\.php$` block would still win for any `.php` file inside it. `^~` stops the regex search, so api.php then needs its own exact-match block with the FastCGI settings copied from your PHP block:

```nginx
location = /app/taxes/sorter/api.php {
    include snippets/fastcgi-php.conf;          # or: include fastcgi_params; fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php-fpm.sock;   # same as your existing PHP block
}
location = /app/taxes/out/sorter/api.php {
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}
location ^~ /app/taxes/sorter/     { deny all; }
location ^~ /app/taxes/out/sorter/ { deny all; }
```

Order of precedence in nginx: `=` exact match, then the longest `^~` prefix, then regex locations in file order, then the longest plain prefix. That is why the exact `api.php` blocks win over the `^~` deny blocks.

Both versions were checked with nginx 1.26 against a stand-in PHP block: `api.php` reached PHP, and every denied path above returned 403.

## Check after reloading nginx

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/app/taxes/sorter/api.php          # 200 (JSON)
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/app/taxes/sorter/stage/Summaries.md  # 403
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/app/taxes/.env                       # 403
```
