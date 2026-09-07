/**
 * Pre-purchase VIN decode against the NHTSA vPIC database.
 *
 * This is the only vehicle lookup that happens before a payment. vPIC is a
 * free public dataset published by the US Department of Transportation: it
 * decodes what the manufacturer stamped into the VIN — year, make, model,
 * body — and knows nothing about titles, accidents or ownership. That makes it
 * exactly right for "is this the car you meant?" and useless as a substitute
 * for the paid report, which is pulled from an entirely separate set of
 * records only after checkout completes.
 *
 * Everything here fails soft. A decode is a reassurance, not a gate: if vPIC
 * is slow, down or has never heard of the VIN, the buyer still checks out.
 */
import type { VehicleSummary } from "@/lib/report";
import { normalizeVin } from "@/lib/vin";

const VPIC_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues";

const TIMEOUT_MS = 4_000;

/** Long enough to cover a reload or a bounce through Stripe and back. */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Keeps a warm serverless instance from re-asking, without growing forever. */
const CACHE_LIMIT = 200;

export type VinDecode = {
  vin: string;
  vehicle: VehicleSummary;
  /** `2012 Toyota Camry`, ready to print. Never empty when a decode succeeds. */
  label: string;
  /** Short supporting details worth showing next to the label. */
  details: { label: string; value: string }[];
};

export type VinDecodeResult =
  | { status: "decoded"; decode: VinDecode }
  | { status: "unavailable" };

const UNAVAILABLE: VinDecodeResult = { status: "unavailable" };

const cache = new Map<string, { expires: number; result: VinDecodeResult }>();

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * vPIC returns every field it knows about, mostly empty or filled with
 * "Not Applicable" placeholders, so values are only kept when they say
 * something.
 */
function field(row: Record<string, unknown>, key: string): string | undefined {
  const value = text(row[key]);
  if (!value || /^(not applicable|not available|n\/a)$/i.test(value)) {
    return undefined;
  }
  return value;
}

/** Title case, because vPIC shouts makes back at you as `TOYOTA`. */
function titleCase(value: string): string {
  if (value !== value.toUpperCase()) return value;
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

/**
 * Reads one vPIC result row. Exported so the shape the government sends can be
 * tested without hitting the network.
 */
export function parseVpicRow(
  row: Record<string, unknown>,
  vin: string,
): VinDecode | null {
  const year = field(row, "ModelYear");
  const make = field(row, "Make");
  const model = field(row, "Model");

  // Without at least a make and a model there is nothing worth showing, and a
  // half-decode reads as a mistake on our side rather than a gap in vPIC.
  if (!make || !model) return null;

  const vehicle: VehicleSummary = {
    year,
    make: titleCase(make),
    model: titleCase(model),
    trim: field(row, "Trim"),
    bodyStyle: field(row, "BodyClass"),
    engine: field(row, "EngineModel"),
    fuelType: field(row, "FuelTypePrimary"),
    madeIn: field(row, "PlantCountry") && titleCase(field(row, "PlantCountry")!),
  };

  const details = [
    { label: "Body", value: vehicle.bodyStyle },
    { label: "Doors", value: field(row, "Doors") },
    { label: "Engine", value: displacement(row) },
    { label: "Fuel", value: vehicle.fuelType && titleCase(vehicle.fuelType) },
    { label: "Assembled in", value: vehicle.madeIn },
  ].filter((detail): detail is { label: string; value: string } =>
    Boolean(detail.value),
  );

  return {
    vin: normalizeVin(vin),
    vehicle,
    label: [year, vehicle.make, vehicle.model, vehicle.trim]
      .filter(Boolean)
      .join(" "),
    details,
  };
}

function displacement(row: Record<string, unknown>): string | undefined {
  const litres = field(row, "DisplacementL");
  const cylinders = field(row, "EngineCylinders");
  if (!litres && !cylinders) return undefined;
  const rounded = litres ? `${Number(litres).toFixed(1)}L` : "";
  return [rounded, cylinders ? `${cylinders}-cyl` : ""].filter(Boolean).join(" ");
}

function remember(vin: string, result: VinDecodeResult): VinDecodeResult {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(vin, { expires: Date.now() + CACHE_TTL_MS, result });
  return result;
}

/**
 * Decodes a VIN for the pre-purchase preview.
 *
 * Never throws and never reaches the paid report provider. The result is
 * cached in-process because `/preview` is rendered dynamically, so the
 * framework's data cache is bypassed and a buyer who reloads or returns from a
 * canceled checkout would otherwise re-ask for the same answer.
 */
export async function decodeVin(vin: string): Promise<VinDecodeResult> {
  const normalized = normalizeVin(vin);

  const cached = cache.get(normalized);
  if (cached && cached.expires > Date.now()) return cached.result;
  cache.delete(normalized);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `${VPIC_URL}/${encodeURIComponent(normalized)}?format=json`,
      {
        signal: controller.signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) return UNAVAILABLE;

    const payload = (await response.json()) as { Results?: unknown };
    const row = Array.isArray(payload.Results) ? payload.Results[0] : undefined;
    if (!row || typeof row !== "object") return UNAVAILABLE;

    const decode = parseVpicRow(row as Record<string, unknown>, normalized);
    return remember(
      normalized,
      decode ? { status: "decoded", decode } : UNAVAILABLE,
    );
  } catch {
    // Timeouts and transport failures are not the buyer's problem: they are
    // deliberately not cached, so the next page view tries again.
    return UNAVAILABLE;
  } finally {
    clearTimeout(timeout);
  }
}
