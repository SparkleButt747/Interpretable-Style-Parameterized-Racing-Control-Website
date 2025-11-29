import type { MetadataRoute } from "next"

import { Settings } from "@/types/settings"

export const dynamic = "force-static"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: `${Settings.metadataBase}/sitemap.xml`,
  }
}
