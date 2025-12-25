import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';
const repoName = 'E46M3CSL_TuningTool';

const nextConfig: NextConfig = {
  output: 'export',
  // basePath: isProd ? `/${repoName}` : '', // Custom Domain uses root path
  // assetPrefix: isProd ? `/${repoName}/` : '', // Custom Domain uses root path
  // Optional: Disable image optimization since it requires server
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
