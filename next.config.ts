import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Inlined for the client panel. Next does not expose other env names to the browser.
  env: {
    SERVER_URL_UPLOAD_API_PHP: process.env.SERVER_URL_UPLOAD_API_PHP ?? "",
  },
};

export default nextConfig;
