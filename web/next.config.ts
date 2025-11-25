import type { NextConfig } from 'next';

const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

const nextConfig: NextConfig = {
  // Static export for Capacitor builds
  output: isCapacitorBuild ? 'export' : undefined,
  // Disable image optimization for static export
  images: isCapacitorBuild
    ? {
        unoptimized: true,
      }
    : undefined,
  experimental: {
    cpus: 1,
    swcPlugins: [['@lingui/swc-plugin', {}]],
  },
  turbopack: {
    rules: {
      '*.po': {
        loaders: ['@lingui/loader'],
        as: '*.js',
      },
    },
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.po$/,
      use: '@lingui/loader',
    });
    return config;
  },
};

export default nextConfig;
