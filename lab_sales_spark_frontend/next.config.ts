import type { NextConfig } from "next";
import { version } from "./package.json";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // package.json is the single source of truth for the app version; surface it
  // to the renderer so no component has to hardcode a version string.
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default nextConfig;
