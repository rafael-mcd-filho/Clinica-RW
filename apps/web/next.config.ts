import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Accommodates a logo up to 2 MB plus multipart/form-data overhead.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
