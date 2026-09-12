/**
 * How the server PDF picks up the same vehicle hero the page shows.
 *
 * Cache only — never starts a fal draw. A missing, drafting or unreadable
 * picture leaves the PDF as it was. The sample uses the same PNG the page
 * serves at SAMPLE_HERO_SRC, so the two layouts cannot drift.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { cachedHeroForReport } from "@/lib/order-hero";
import type { VehicleReport } from "@/lib/report";
import type { OrderStore } from "@/lib/store";
import { SAMPLE_HERO_SRC } from "@/lib/vehicle-hero";

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

export function sampleHeroFilePath(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "public",
    path.basename(SAMPLE_HERO_SRC),
  );
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

/**
 * The sample PNG as a data URI the PDF renderer can embed.
 *
 * The renderer cannot fetch `/sample-vehicle-hero.png` over HTTP. The file
 * lives in `public/` and is traced into the sample PDF function so a
 * serverless deploy still has the bytes. Soft-fail to `null` if the file
 * is missing or is not a PNG — never fall back to a cartoon placeholder.
 */
export async function sampleHeroDataUri(): Promise<string | null> {
  try {
    const bytes = await readFile(sampleHeroFilePath());
    if (!pngMagic(bytes)) return null;
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
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
