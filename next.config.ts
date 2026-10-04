import type { NextConfig } from "next";

// The client bundle cannot inline a dotted env name. Same URL, public name only.
const uploadApi = process.env["SERVER_URL_UPLOAD_API.PHP"] ?? "";
process.env.NEXT_PUBLIC_SERVER_URL_UPLOAD_API_PHP = uploadApi;

const nextConfig: NextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_SERVER_URL_UPLOAD_API_PHP: uploadApi,
  },
};

export default nextConfig;
