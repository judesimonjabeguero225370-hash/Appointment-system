import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import seoPlugin from "./seo/vite-plugin.js";

// Social-share, canonical and sitemap tags need an absolute address. Set VITE_SITE_URL (e.g. https://qorvena.vercel.app) in Vercel;
// on Vercel it falls back to the project's production domain automatically.
function siteUrl(mode) {
  const env = loadEnv(mode, process.cwd(), "");
  const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
  return (env.VITE_SITE_URL || process.env.VITE_SITE_URL || fromVercel || "").replace(/\/+$/, "");
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), seoPlugin(siteUrl(mode))],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true
  }
}));
