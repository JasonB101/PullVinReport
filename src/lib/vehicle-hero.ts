/**
 * The illustrated vehicle hero on a paid report.
 *
 * A product-cutout of the year/make/model — never a photograph of this VIN.
 * The picture is generated once per year/make/model/trim/color and cached, so
 * reopening a report (or another order for the same example) costs nothing.
 * Missing key, a timeout or a rejection all end the same way: no hero, and a
 * report that reads exactly as it did before the picture existed.
 */
import { fal, isFalConfigured } from "@/lib/config";
import type { Field, VehicleReport } from "@/lib/report";
import { reportPaintColor, sectionListings } from "@/lib/report";
import type { VehicleHeroRecord } from "@/lib/store";

export const SAMPLE_HERO_SRC = "/sample-vehicle-hero.png";
/**
 * Bump this when the drawing contract changes (colour source, cutout, prompt)
 * so a cached white studio shot cannot be served as the new hero.
 */
export const HERO_CACHE_VERSION = "cutout-v3";

/**
 * Caption under the PDF hero. The on-page cutout has no on-image label
 * (screen readers get `heroAlt`); a forwarded PDF is read by people who
 * never saw the page, so the illustration must say so in print.
 */
export const HERO_ILLUSTRATION_LABEL = "Illustration — not this VIN";

const TRIM_LABELS = ["Trim", "Trim level", "Series", "Package"];
const BODY_LABELS = ["Style", "Body Type", "Body Style", "Body"];

/**
 * Recraft will happily draw the common hardtop of a model (Beetle, 911)
 * when the catalog string only mentions Convertible in passing. An explicit
 * clause is what actually changes the body.
 *
 * "Open-top" means a normal convertible silhouette (top up or neatly down) —
 * never a floating roof or exploded open panels.
 */
const OPEN_TOP_WORD = /\b(convertible|cabriolet|roadster|soft-?top)\b/i;
const SHORT_OPEN_TOP = /^(convertible|cabriolet|roadster|soft-?top)$/i;
const OPEN_TOP_CLAUSE =
  "convertible cabriolet with folding fabric soft-top; not a hardtop coupe; show the open-top body or convertible roofline as one coherent car silhouette — top up or top neatly down as a clean catalog pose, never a floating or detached soft-top above the car, never an exploded view with open hood or trunk.";

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

export type HeroVehicleParts = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  color?: string | null;
  bodyStyle?: string | null;
  engine?: string | null;
};

/**
 * Year/make/model family used to reuse a drawing when the exact trim/colour
 * key is not known yet (pre-pay vPIC has no paint) or differs slightly after
 * the paid listings arrive. Prevents a second fal bill for the same car.
 */
export function heroFamilyPrefix(facts: Pick<HeroFacts, "year" | "make" | "model">): string {
  return [HERO_CACHE_VERSION, facts.year, facts.make, facts.model]
    .map((part) => part.toLowerCase())
    .join("|") + "|";
}

export function heroFactsFromParts(parts: HeroVehicleParts): HeroFacts | null {
  const year = normalizePart(parts.year ?? "");
  const make = normalizePart(parts.make ?? "");
  const model = normalizePart(parts.model ?? "");
  if (!year || !make || !model) return null;

  const trim = normalizePart(parts.trim ?? "");
  const color = normalizePart(parts.color ?? "");
  const bodyStyle = normalizePart(parts.bodyStyle ?? "");
  const engine = normalizePart(parts.engine ?? "");

  const cacheKey = [HERO_CACHE_VERSION, year, make, model, trim, color, bodyStyle, engine]
    .map((part) => part.toLowerCase())
    .join("|");

  return { year, make, model, trim, color, bodyStyle, engine, cacheKey };
}

function canonicalOpenTopToken(value: string): string {
  const lower = value.toLowerCase();
  if (lower === "cabriolet") return "Cabriolet";
  if (lower === "roadster") return "Roadster";
  if (lower.startsWith("soft")) return "Soft-top";
  return "Convertible";
}

/**
 * A catalog `Style` is often a long line (`2.0T S Convertible 2D`).
 * When a short body token is also on the record, that is what Recraft
 * should see.
 */
function preferHeroBodyStyle(vehicleBody: string, candidates: string[]): string {
  const short = [vehicleBody, ...candidates]
    .map(normalizePart)
    .find((value) => SHORT_OPEN_TOP.test(value));
  return short ? canonicalOpenTopToken(short) : vehicleBody;
}

export function isOpenTopHero(facts: Pick<HeroFacts, "trim" | "bodyStyle">): boolean {
  return OPEN_TOP_WORD.test(`${facts.trim} ${facts.bodyStyle}`);
}

/**
 * The facts an illustration may use — year, make, model, a richer listing
 * trim when one exists, an exterior colour from the build record or listings,
 * body style. The VIN is never part of this.
 */
export function heroFacts(report: VehicleReport): HeroFacts | null {
  const listingFields = report.sections
    .filter((section) => section.layout === "listings")
    .flatMap((section) => sectionListings(section))
    .flatMap((listing) => [...listing.summary, ...listing.detail]);

  const recordFields = report.sections.flatMap((section) => section.records.flat());
  const specFields = report.specifications;
  const allFields = [...listingFields, ...recordFields, ...specFields];

  return heroFactsFromParts({
    year: report.vehicle.year,
    make: report.vehicle.make,
    model: report.vehicle.model,
    trim: pickRicher(report.vehicle.trim ?? "", fieldValues(allFields, TRIM_LABELS)),
    color: reportPaintColor(report),
    bodyStyle: preferHeroBodyStyle(
      normalizePart(report.vehicle.bodyStyle ?? ""),
      fieldValues(allFields, BODY_LABELS),
    ),
    engine: report.vehicle.engine,
  });
}

export function heroPrompt(facts: HeroFacts): string {
  const name = [facts.year, facts.make, facts.model, facts.trim]
    .filter(Boolean)
    .join(" ");
  const body = facts.bodyStyle ? `, ${facts.bodyStyle}` : "";
  const engine = facts.engine ? `, ${facts.engine}` : "";
  const colorLine = facts.color
    ? `Exact exterior colour: ${facts.color}. Paint the whole body ${facts.color} — not white, not a default studio silver, not a different shade.`
    : "Paint colour as a typical factory example for this year, make and model.";
  const openTop = isOpenTopHero(facts) ? OPEN_TOP_CLAUSE : "";

  return [
    `Isolated product-cutout illustration of a generic example ${name}${body}${engine}.`,
    openTop,
    colorLine,
    "Closed stock catalog three-quarter front view, clean product cutout, illustrated vehicle only — one coherent car silhouette.",
    "Doors, hood, bonnet, trunk, hatch and windows shut; no accessories being used; no open hood, no open trunk, no open hatch, no open doors, no windows popped for drama; no exploded view; no floating or detached roof or parts.",
    "Transparent background, no studio backdrop, no floor, no ground shadow plate, no scenery, no horizon.",
    "Soft illustrated product rendering — not a photograph of a real specific vehicle, no photoreal VIN clone, no 3D dealership catalog photo.",
    "No people, no license plate, no VIN, no badge text.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function heroAlt(facts: HeroFacts): string {
  const name = [facts.year, facts.make, facts.model, facts.trim]
    .filter(Boolean)
    .join(" ");
  const color = facts.color ? ` in ${facts.color}` : "";
  return `Illustrated ${name}${color}`;
}

/**
 * Buyer-facing status while fal is still drawing, or while the browser is
 * still decoding the cutout. Illustration language, never a spinner label.
 */
export const HERO_DRAFT_COPY = "Drafting vehicle illustration…";

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
    output_format: "png",
    sync_mode: true,
    num_inference_steps: 4,
  };
}

type FalImage = { url?: string; content_type?: string };

function firstImage(payload: unknown): FalImage | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as { images?: unknown; image?: unknown };
  if (Array.isArray(record.images) && record.images.length > 0) {
    const image = record.images[0];
    if (typeof image === "string") return { url: image };
    if (typeof image === "object" && image !== null) {
      const url = (image as FalImage).url;
      if (typeof url === "string" && url.length > 0) return image as FalImage;
    }
  }
  if (typeof record.image === "string") return { url: record.image };
  if (typeof record.image === "object" && record.image !== null) {
    const url = (record.image as FalImage).url;
    if (typeof url === "string" && url.length > 0) return record.image as FalImage;
  }
  return null;
}

const MAX_BYTES = 1_400_000;

async function asStoredSrc(
  url: string,
  contentType: string,
  signal: AbortSignal,
): Promise<{ src: string; contentType: string }> {
  if (url.startsWith("data:")) {
    return { src: url, contentType: contentType || "image/png" };
  }

  try {
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) return { src: url, contentType };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return { src: url, contentType };
    }
    const type = response.headers.get("content-type") || contentType || "image/png";
    return { src: `data:${type};base64,${buffer.toString("base64")}`, contentType: type };
  } catch {
    return { src: url, contentType };
  }
}

async function falPost(
  model: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown | null> {
  const response = await fetch(`${fal.baseUrl}/${model}`, {
    method: "POST",
    cache: "no-store",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: `Key ${fal.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error(`[hero] fal ${model} returned HTTP ${response.status}`);
    return null;
  }
  return response.json();
}

/**
 * Recraft returns an opaque raster. Cut the background so the card can show
 * the aurora through — transparent PNG is required, not a studio plate.
 */
async function cutoutImage(
  imageUrl: string,
  signal: AbortSignal,
): Promise<FalImage | null> {
  const payload = await falPost(
    fal.rembgModel,
    { image_url: imageUrl, sync_mode: true, crop_to_bbox: true },
    signal,
  );
  return payload ? firstImage(payload) : null;
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
  const facts = heroFacts(report);
  if (!facts) return null;
  return generateVehicleHeroFromFacts(facts, options);
}

/**
 * Same fal draw as a paid report, from year/make/model facts alone.
 * Used on the pre-pay preview where we have a vPIC decode but no order.
 */
export async function generateVehicleHeroFromFacts(
  facts: HeroFacts,
  options: { timeoutMs?: number } = {},
): Promise<VehicleHeroRecord | null> {
  if (!isFalConfigured()) return null;

  const timeoutMs = options.timeoutMs ?? fal.timeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const drawn = firstImage(await falPost(fal.model, falInput(facts), controller.signal));
    if (!drawn?.url) {
      console.error("[hero] fal reply had no image");
      return null;
    }

    const cut = await cutoutImage(drawn.url, controller.signal);
    if (!cut?.url) {
      console.error("[hero] background cut failed — not storing an opaque studio plate");
      return null;
    }

    const stored = await asStoredSrc(
      cut.url,
      cut.content_type || "image/png",
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
