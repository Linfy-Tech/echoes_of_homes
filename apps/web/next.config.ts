import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Keep browser calls same-origin so the session cookie and CSRF origin check
    // retain the web origin. The Fastify API listens separately in local dev.
    const apiBaseUrl = (process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
    return [
      { source: '/v1/:path*', destination: `${apiBaseUrl}/v1/:path*` },
      { source: '/healthz', destination: `${apiBaseUrl}/healthz` },
    ];
  },
};

export default nextConfig;
