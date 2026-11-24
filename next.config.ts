import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // the e2e container reaches the dev server as http://app:3000
  allowedDevOrigins: ["app"],
};

export default nextConfig;
