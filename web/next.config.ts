import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8010";

const nextConfig: NextConfig = {
  experimental: {
    // the generated report can take ~40 s (text + visuals); the dev proxy default cuts at 30 s
    proxyTimeout: 120_000,
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
