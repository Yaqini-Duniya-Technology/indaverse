import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Development, release and browser checks never write the same generated files.
  distDir: process.env.INDAVERSE_E2E === "1" ? ".next-e2e"
    : process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-IndaVerse-Web", value: "1" }] }];
  },
};
export default nextConfig;
