import fs from "node:fs";
import path from "node:path";
import { structuredData } from "./structured-data.js";

const PLACEHOLDER = "__SITE_URL__";

/**
 * Fills in the site address everywhere search engines need an absolute URL:
 * canonical + social tags in index.html, the JSON-LD block, and robots.txt / sitemap.xml / llms.txt after the build.
 * With no address known (local dev), tags that need one are simply left out instead of being wrong.
 */
export default function seoPlugin(siteUrl) {
  const url = (siteUrl || "").replace(/\/+$/, "");
  let outDir = "";
  let isBuild = false;
  return {
    name: "qorvena-seo",
    configResolved(config) { isBuild = config.command === "build"; outDir = path.resolve(config.root, config.build.outDir); },
    transformIndexHtml(html) {
      const jsonLd = `<script type="application/ld+json">${JSON.stringify(structuredData(url))}</script>`;
      const out = html.replace("<!--SEO_JSON_LD-->", jsonLd);
      if (url) return out.split(PLACEHOLDER).join(url);
      return out.split("\n").filter((line) => !line.includes(PLACEHOLDER)).join("\n");
    },
    closeBundle() {
      if (!isBuild) return;
      const today = new Date().toISOString().slice(0, 10);
      for (const file of ["robots.txt", "sitemap.xml", "llms.txt"]) {
        const target = path.join(outDir, file);
        if (!fs.existsSync(target)) continue;
        let text = fs.readFileSync(target, "utf8");
        if (url) text = text.split(PLACEHOLDER).join(url).split("__BUILD_DATE__").join(today);
        else if (file === "sitemap.xml") { fs.unlinkSync(target); continue; } // a sitemap needs absolute addresses
        else text = text.split("\n").filter((line) => !line.includes(PLACEHOLDER)).join("\n");
        fs.writeFileSync(target, text);
      }
    }
  };
}
