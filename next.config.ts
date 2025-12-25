import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const repoName = 'E46M3CSL_TuningTool';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: isProd ? `/${repoName}` : '',
  assetPrefix: isProd ? `/${repoName}/` : '',
  // Optional: Disable image optimization since it requires server
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
