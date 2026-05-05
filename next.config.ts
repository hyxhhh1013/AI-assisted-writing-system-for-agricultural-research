import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
      };
    }
    return config;
  },
  // @ts-ignore
  turbopack: {
    resolveAlias: {
      canvas: './empty.js',
    },
  },
};

export default nextConfig;
