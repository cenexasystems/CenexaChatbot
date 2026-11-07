import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cenexa ChatFlow",
    short_name: "ChatFlow",
    description: "Run your WhatsApp business from your phone",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#FFFFFF",
    icons: [
      { src: "/brand/cenexa-mark.png", sizes: "any", type: "image/png", purpose: "any" },
    ],
  };
}
