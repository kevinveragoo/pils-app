//
//  manifest.ts
//  pils-app
//
//  Created by Elisa Kevin Veragoo + ChatGPT on 23/10/2026.
//
import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { id: "/", name: "PILS Services", short_name: "PILS", start_url: "/", scope: "/", display: "standalone", background_color: "#ffffff", theme_color: "#176b63", icons: [{ src: "/notification-icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/notification-icon-512.png", sizes: "512x512", type: "image/png" }] };
}
