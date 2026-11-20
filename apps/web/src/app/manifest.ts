import type { MetadataRoute } from "next";

// Colours match the light theme tokens in globals.css (--bg, --brand). The
// test in tests/manifest.test.mjs keeps them in step.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rolewright",
    short_name: "Rolewright",
    description: "Tailor your resume to each job. Every change is checked against facts you confirmed.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#2f3a8f",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
