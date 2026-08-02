import type { NextConfig } from "next";
import path from "path";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const studioRoot = path.resolve(__dirname, "academic-paper-studio");

const nextConfig: NextConfig = {
  output: "standalone",
  // 避免 Turbopack 缓存旧版 @prisma/client（schema 增字段后仍报 Unknown field）
  serverExternalPackages: ["@prisma/client", "prisma"],
  outputFileTracingExcludes: {
    "/*": ["./data/charts/**/*", "./papers/**/*"],
  },
  experimental: {
    // 附件上传上限 20MB，需大于该值（含 multipart 开销），否则 Next 默认 10MB 会静默截断请求体
    proxyClientMaxBodySize: "24mb",
    optimizePackageImports: [
      "lucide-react",
      "react-resizable-panels",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/core",
      "@tiptap/extension-bubble-menu",
      "@tiptap/extension-character-count",
      "@tiptap/extension-placeholder",
      "framer-motion",
      "mermaid",
    ],
  },
  turbopack: {
    resolveAlias: {
      canvas: "./empty.js",
      "@academic-paper-studio": "./academic-paper-studio/index.ts",
      "@academic-paper-studio/flow": "./academic-paper-studio/flow/index.ts",
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
      };
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      "@academic-paper-studio": path.join(studioRoot, "index.ts"),
      "@academic-paper-studio/flow": path.join(studioRoot, "flow", "index.ts"),
    };
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
