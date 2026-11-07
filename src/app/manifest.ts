import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cenexa ChatFlow",
    short_name: "ChatFlow",
    description: "Run your WhatsApp business from your phone",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#F3F7FC",
    theme_color: "#0B2D5E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
