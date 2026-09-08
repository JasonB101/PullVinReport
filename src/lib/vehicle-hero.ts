/**
 * The illustrated vehicle hero on a paid report.
 *
 * A cartoon of the year/make/model — never a photograph of this VIN. The
 * picture is generated once per year/make/model/trim/color and cached, so
 * reopening a report (or another order for the same example) costs nothing.
 * Missing key, a timeout or a rejection all end the same way: no hero, and a
 * report that reads exactly as it did before the picture existed.
 */
import { fal, isFalConfigured } from "@/lib/config";
import type { Field, VehicleReport } from "@/lib/report";
import { sectionListings } from "@/lib/report";
import type { VehicleHeroRecord } from "@/lib/store";

export const HERO_LABEL = "Illustration · not this VIN";
export const SAMPLE_HERO_SRC = "/sample-vehicle-hero.svg";

const COLOR_LABELS = [
  "Exterior colour",
  "Exterior color",
  "Ext colour",
  "Ext color",
  "Color",
  "Colour",
];
const TRIM_LABELS = ["Trim", "Trim level", "Series", "Package"];

export type HeroFacts = {
  year: string;
  make: string;
  model: string;
  trim: string;
  color: string;
  bodyStyle: string;
  engine: string;
  cacheKey: string;
};

function normalizePart(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function fieldValues(fields: Field[], labels: string[]): string[] {
  const wanted = new Set(labels.map((label) => label.toLowerCase()));
  return fields
    .filter((field) => wanted.has(field.label.toLowerCase()) && field.value.trim())
    .map((field) => normalizePart(field.value));
}

function pickRicher(base: string, candidates: string[]): string {
  const cleaned = [base, ...candidates]
    .map(normalizePart)
    .filter((value) => value.length > 0);
  if (cleaned.length === 0) return "";
  const lowerBase = base.trim().toLowerCase();
  const richer = cleaned
    .filter(
      (value) =>
        lowerBase.length > 0 &&
        value.toLowerCase().startsWith(lowerBase) &&
        value.length > base.trim().length,
    )
    .sort((a, b) => b.length - a.length)[0];
  if (richer) return richer;
  return cleaned.sort((a, b) => b.length - a.length)[0] ?? "";
}

function pickColor(candidates: string[]): string {
  const counts = new Map<string, { value: string; count: number }>();
  for (const raw of candidates) {
    const value = normalizePart(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { value, count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || b.value.length - a.value.length,
  )[0]?.value ?? "";
}

/**
 * The facts an illustration may use — year, make, model, a richer listing
 * trim when one exists, an exterior colour from the listings, body style.
 * The VIN is never part of this.
 */
export function heroFacts(report: VehicleReport): HeroFacts | null {
  const year = normalizePart(report.vehicle.year ?? "");
  const make = normalizePart(report.vehicle.make ?? "");
  const model = normalizePart(report.vehicle.model ?? "");
  if (!year || !make || !model) return null;

  const listingFields = report.sections
    .filter((section) => section.layout === "listings")
    .flatMap((section) => sectionListings(section))
    .flatMap((listing) => [...listing.summary, ...listing.detail]);

  const recordFields = report.sections.flatMap((section) => section.records.flat());
  const specFields = report.specifications;
  const allFields = [...listingFields, ...recordFields, ...specFields];

  const trim = pickRicher(report.vehicle.trim ?? "", fieldValues(allFields, TRIM_LABELS));
  const color = pickColor(fieldValues(allFields, COLOR_LABELS));
  const bodyStyle = normalizePart(report.vehicle.bodyStyle ?? "");
  const engine = normalizePart(report.vehicle.engine ?? "");

  const cacheKey = [year, make, model, trim, color, bodyStyle, engine]
    .map((part) => part.toLowerCase())
    .join("|");

  return { year, make, model, trim, color, bodyStyle, engine, cacheKey };
}

export function heroPrompt(facts: HeroFacts): string {
  const name = [facts.year, facts.make, facts.model, facts.trim]
    .filter(Boolean)
    .join(" ");
  const painted = facts.color ? ` painted ${facts.color}` : "";
  const body = facts.bodyStyle ? `, ${facts.bodyStyle}` : "";
  const engine = facts.engine ? `, ${facts.engine}` : "";

  return [
    `Flat cartoon illustration of a generic example ${name}${body}${engine}${painted}.`,
    "Soft vector, cel-shaded, clean outlines, editorial magazine drawing of a car on a simple studio backdrop.",
    "No people, no license plate, no VIN, no badge text, no photograph, no photorealism, no 3D automotive catalog render, no stock photo.",
    "This is an invented illustrated example, not a picture of a real specific vehicle.",
  ].join(" ");
}

export function heroAlt(facts: HeroFacts): string {
  const name = [facts.year, facts.make, facts.model, facts.trim]
    .filter(Boolean)
    .join(" ");
  const color = facts.color ? ` in ${facts.color}` : "";
  return `Cartoon illustration of a ${name}${color} — not a photo of this VIN`;
}

function falInput(facts: HeroFacts): Record<string, unknown> {
  const prompt = heroPrompt(facts);
  if (fal.model.includes("recraft")) {
    return {
      prompt,
      image_size: "landscape_4_3",
      style: fal.style,
    };
  }
  return {
    prompt,
    image_size: "landscape_4_3",
    num_images: 1,
    output_format: "jpeg",
    sync_mode: true,
    num_inference_steps: 4,
  };
}

type FalImage = { url?: string; content_type?: string };

function firstImage(payload: unknown): FalImage | null {
  if (typeof payload !== "object" || payload === null) return null;
  const images = (payload as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length === 0) return null;
  const image = images[0];
  if (typeof image === "string") return { url: image };
  if (typeof image !== "object" || image === null) return null;
  const url = (image as FalImage).url;
  return typeof url === "string" && url.length > 0 ? (image as FalImage) : null;
}

const MAX_BYTES = 900_000;

async function asStoredSrc(
  url: string,
  contentType: string,
  signal: AbortSignal,
): Promise<{ src: string; contentType: string }> {
  if (url.startsWith("data:")) {
    return { src: url, contentType: contentType || "image/jpeg" };
  }

  try {
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) return { src: url, contentType };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return { src: url, contentType };
    }
    const type = response.headers.get("content-type") || contentType || "image/jpeg";
    return { src: `data:${type};base64,${buffer.toString("base64")}`, contentType: type };
  } catch {
    return { src: url, contentType };
  }
}

/**
 * Asks fal for one illustration, or returns nothing.
 *
 * Soft-fail everywhere: no key, a timeout, a rejection or an empty reply all
 * become `null`. The report the buyer paid for must never depend on this.
 */
export async function generateVehicleHero(
  report: VehicleReport,
  options: { timeoutMs?: number } = {},
): Promise<VehicleHeroRecord | null> {
  if (!isFalConfigured()) return null;
  const facts = heroFacts(report);
  if (!facts) return null;

  const timeoutMs = options.timeoutMs ?? fal.timeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${fal.baseUrl}/${fal.model}`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Key ${fal.apiKey}`,
      },
      body: JSON.stringify(falInput(facts)),
    });

    if (!response.ok) {
      console.error(`[hero] fal returned HTTP ${response.status}`);
      return null;
    }

    const image = firstImage(await response.json());
    if (!image?.url) {
      console.error("[hero] fal reply had no image");
      return null;
    }

    const stored = await asStoredSrc(
      image.url,
      image.content_type || "image/jpeg",
      controller.signal,
    );

    return {
      cacheKey: facts.cacheKey,
      src: stored.src,
      contentType: stored.contentType,
      model: fal.model,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `no reply within ${timeoutMs}ms`
        : (error as Error).message;
    console.error(`[hero] not generated: ${reason}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
