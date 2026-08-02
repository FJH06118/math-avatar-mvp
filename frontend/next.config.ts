import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ppt-digital-human/contracts"],
  experimental: {
    cpus: 2,
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
