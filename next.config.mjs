/** @type {import('next').NextConfig} */
const nextConfig = {
  // E2E/dev: Playwright обращается к серверу по `127.0.0.1`, а Next
  // воспринимает это как cross-origin относительно `localhost`. Без
  // явного разрешения это станет ошибкой в Next.js 15.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
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
