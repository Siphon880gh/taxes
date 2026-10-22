<?php
// Server-side settings for api.php. Executing this file directly prints nothing, and .htaccess and the
// nginx rules in docs/NGINX.md deny it anyway. Keep it identical to public/sorter/app-config.php.
return [
    // Pages allowed to call api.php: scheme://host[:port], no path, no trailing slash.
    // A request whose Origin (or, for a GET without Origin, Referer) is not listed gets 403.
    "origins" => [
        "https://wengindustries.com",
        "https://www.wengindustries.com",
        "http://localhost:8888",   // MAMP: /weng/app/taxes/out/
        "http://127.0.0.1:8888",
        "http://localhost:43123",  // npm run dev
        "http://127.0.0.1:43123",
    ],
];
