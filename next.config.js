/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Fix for urdf-loader and three.js in webpack
    config.module.rules.push({
      test: /\.urdf$/,
      type: 'asset/source'
    });
    return config;
  }
};

module.exports = nextConfig;
