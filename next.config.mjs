/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/admin',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ]
  },
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
