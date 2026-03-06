/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
