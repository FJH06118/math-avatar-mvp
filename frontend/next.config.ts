import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  outputFileTracingRoot: join(frontendRoot, ".."),
  transpilePackages: ["@ppt-digital-human/contracts"],
  experimental: {
    cpus: 2,
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
