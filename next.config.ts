import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.KAKOMON_TEST_ENV === "1" ? "coverage/next-test" : ".next",
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
