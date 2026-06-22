import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable static generation for all pages — this app is fully dynamic
  // (it requires auth on every page load) so static prerendering is not needed.
  // This fixes the Vercel build crash caused by @supabase/ssr needing env vars at build time.
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
};

export default nextConfig;