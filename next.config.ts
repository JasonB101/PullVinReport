import type { NextConfig } from "next";

import { legacyDomainRedirects } from "./src/lib/config";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep the Stripe SDK on Node's HTTP client, not a bundled web/fetch build.
  serverExternalPackages: ["stripe"],
  // Host-level 301/308 from the retired domain. Cloudflare can do this too;
  // keeping it here covers Vercel if DNS still points at this deployment.
  async redirects() {
    return legacyDomainRedirects();
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // Purchased reports and the admin console must never be indexed.
        source: "/(report|admin)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/api/report/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
