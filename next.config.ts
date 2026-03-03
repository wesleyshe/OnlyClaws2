import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.dicebear.com' },
    ],
  },
  async rewrites() {
    return [
      // Compatibility shim for clients that accidentally double-prefix /api.
      { source: '/api/api/:path*', destination: '/api/:path*' },
    ];
  },
};

export default nextConfig;
