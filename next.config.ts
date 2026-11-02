import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "@electric-sql/pglite", "ai"],
};

export default nextConfig;
