import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 2,
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
