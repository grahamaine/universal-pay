import type { MetadataRoute } from "next";

// Web app manifest — makes Universal Pay installable to the home screen /
// desktop (served at /manifest.webmanifest, linked automatically by Next).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Universal Pay",
    short_name: "Universal Pay",
    description:
      "Pay or split with anyone — any chain, any token, one balance.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f1",
    theme_color: "#6366f1",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
