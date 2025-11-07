import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true, // ⚠️ Ignore toutes les erreurs ESLint
  },
  typescript: {
    ignoreBuildErrors: true, // ⚠️ Ignore aussi les erreurs TypeScript
  },
};

export default nextConfig;
