import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@ppt-digital-human/contracts"],
  experimental: {
    cpus: 2,
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
