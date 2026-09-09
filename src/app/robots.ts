import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/admin/", "/status", "/status/", "/report/", "/order/", "/api/"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
