import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  distDir: process.env.KAKOMON_TEST_ENV === "1" ? "coverage/next-test" : ".next",
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default async function config(phase: string): Promise<NextConfig> {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const { assertMockAssetManifest } = await import("./scripts/build-mock-asset-manifest.mjs");
    assertMockAssetManifest(path.resolve(__dirname));
  }
  return nextConfig;
}
