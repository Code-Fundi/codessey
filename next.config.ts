import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url))),
  reactStrictMode: true,
  transpilePackages: ["@sparkjsdev/spark", "three"],
  webpack: (config) => {
    config.module.parser = {
      ...config.module.parser,
      javascript: {
        ...(typeof config.module.parser?.javascript === "object"
          ? config.module.parser.javascript
          : {}),
        url: false,
      },
    };
    return config;
  },
};

export default nextConfig;
