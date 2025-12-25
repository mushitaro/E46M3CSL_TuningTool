import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // Optional: Disable image optimization since it requires server
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
