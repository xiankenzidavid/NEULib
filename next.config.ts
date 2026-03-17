import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Vercel expects root paths, so no basePath/assetPrefix
  output: 'export',

  // Ignore type and lint errors during build (optional)
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // Image handling
  images: {
    unoptimized: true, // required for static export
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co',        pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos',       pathname: '/**' },
      { protocol: 'https', hostname: 'www.gstatic.com',     pathname: '/**' },
    ],
  },

  // Turbopack config
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
