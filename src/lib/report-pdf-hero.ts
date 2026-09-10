/**
 * How the server PDF picks up the same vehicle hero the page shows.
 *
 * Cache only — never starts a fal draw. A missing, drafting or unreadable
 * picture leaves the PDF as it was. The sample uses the same SVG the page
 * serves at SAMPLE_HERO_SRC, so the two layouts cannot drift.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { cachedHeroForReport } from "@/lib/order-hero";
import type { VehicleReport } from "@/lib/report";
import type { OrderStore } from "@/lib/store";
import { SAMPLE_HERO_SRC } from "@/lib/vehicle-hero";

/**
 * Same markup as `public/sample-vehicle-hero.svg`. The PDF renderer cannot
 * fetch `/sample-vehicle-hero.svg` over HTTP, and serverless deploys do not
 * always ship `public/` next to the function. Tests keep the two in lockstep.
 */
export const SAMPLE_HERO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="80 200 640 300" role="img" aria-label="Illustrated sedan">
  <path d="M150 390c20-70 70-120 160-140h180c90 8 150 55 180 140" fill="#f4f7fb" stroke="#1e293b" stroke-width="8" stroke-linejoin="round"/>
  <path d="M130 390h540c18 0 30 14 30 30v20c0 12-8 22-22 22H130c-16 0-26-10-26-24v-16c0-18 10-32 26-32z" fill="#f8fafc" stroke="#1e293b" stroke-width="8"/>
  <path d="M250 250h130v100H230c8-40 12-70 20-100z" fill="#b8d4ea" stroke="#1e293b" stroke-width="6"/>
  <path d="M400 250h150c20 20 32 55 42 100H400V250z" fill="#b8d4ea" stroke="#1e293b" stroke-width="6"/>
  <circle cx="240" cy="440" r="42" fill="#1e293b"/>
  <circle cx="240" cy="440" r="22" fill="#94a3b8"/>
  <circle cx="560" cy="440" r="42" fill="#1e293b"/>
  <circle cx="560" cy="440" r="22" fill="#94a3b8"/>
  <rect x="155" y="368" width="36" height="16" rx="4" fill="#fbbf24" stroke="#1e293b" stroke-width="4"/>
  <rect x="610" y="368" width="28" height="14" rx="3" fill="#f87171" stroke="#1e293b" stroke-width="4"/>
  <path d="M380 250v100" stroke="#1e293b" stroke-width="6"/>
</svg>`;

const EMBEDDABLE_DATA_URI =
  /^data:image\/(png|jpe?g|svg\+xml);base64,([A-Za-z0-9+/=]+)$/i;

function pngMagic(bytes: Buffer): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function jpegMagic(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function svgDataUri(svg: string): string {
  // The sample SVG has a 640×300 viewBox and no width/height. Without
  // those, react-pdf draws it at viewBox size (~300pt) and the report
  // spills onto a fourth page.
  const sized = /^<svg[^>]*\bwidth=/.test(svg)
    ? svg
    : svg.replace(/<svg\b/, '<svg width="136" height="52"');
  return `data:image/svg+xml;base64,${Buffer.from(sized).toString("base64")}`;
}

/**
 * Formats @react-pdf/renderer can embed without a network fetch.
 *
 * Cached heroes are usually PNG data URIs after the cutout pass. WebP and
 * remote fal URLs are skipped — better a report without a picture than a
 * render that hangs or throws.
 */
export function embeddableHeroSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  const trimmed = src.trim();
  const match = EMBEDDABLE_DATA_URI.exec(trimmed);
  if (!match) return null;
  const format = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) return null;
  if (format === "png" && !pngMagic(bytes)) return null;
  if ((format === "jpg" || format === "jpeg") && !jpegMagic(bytes)) return null;
  if (format === "svg+xml" && !bytes.toString("utf8").includes("<svg")) return null;
  return trimmed;
}

export async function sampleHeroDataUri(): Promise<string> {
  const file = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "public",
    path.basename(SAMPLE_HERO_SRC),
  );
  try {
    const svg = (await readFile(file, "utf8")).trim();
    if (svg.includes("<svg")) return svgDataUri(svg);
  } catch {
    // Serverless bundles often omit public/; the inlined copy is the same file.
  }
  return svgDataUri(SAMPLE_HERO_SVG.trim());
}

/**
 * The hero bytes the PDF may embed, or `null` so render continues without it.
 */
export async function heroSrcForPdf(
  report: VehicleReport,
  store?: OrderStore,
): Promise<string | null> {
  try {
    if (report.isSample) return await sampleHeroDataUri();
    if (!store) return null;
    const cached = await cachedHeroForReport(report, store);
    return embeddableHeroSrc(cached?.src);
  } catch (error) {
    console.error("[pdf] hero lookup failed", error);
    return null;
  }
}
