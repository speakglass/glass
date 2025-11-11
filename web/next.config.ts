import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
