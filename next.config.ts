import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint:     { ignoreDuringBuilds: true },

  images: {
    unoptimized: true,
    qualities: [75, 85, 90, 95, 100],
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co',        pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos',       pathname: '/**' },
      { protocol: 'https', hostname: 'www.gstatic.com',     pathname: '/**' }
    ],
  },

  turbopack: {
    root: path.resolve(__dirname),
  },

  // 👇 Key settings for Firebase Hosting
  output: 'export',   // replaces `next export`
  distDir: 'out'      // ensures build output goes to /out
};

export default nextConfig;