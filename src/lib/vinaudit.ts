import {
  isVinAuditConfigured,
  missingVinAuditKeys,
  vinaudit,
} from "@/lib/config";
import type {
  Field,
  OdometerReading,
  ReportCheck,
  ReportSection,
  VehicleReport,
  VehicleSummary,
} from "@/lib/report";
import { normalizeVin } from "@/lib/vin";

export class ProviderNotConfiguredError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(
      `VinAudit is not configured. Missing: ${missing.join(", ")}. Paid reports are disabled until these are set.`,
    );
    this.name = "ProviderNotConfiguredError";
    this.missing = missing;
  }
}

export class ProviderRequestError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* Response normalization                                                      */
/* -------------------------------------------------------------------------- */

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && !Array.isArray(item),
    );
  }
  if (typeof value === "object" && value !== null) {
    return [value as Record<string, unknown>];
  }
  return [];
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(stringify).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => `${humanizeKey(key)}: ${stringify(inner)}`)
      .filter((part) => !part.endsWith(": "))
      .join(" · ");
  }
  return String(value);
}

const KEY_LABELS: Record<string, string> = {
  vin: "VIN",
  jsi: "Junk, salvage & insurance",
  meterunit: "Odometer unit",
  meter: "Odometer",
  titlenumber: "Title number",
  vehicleuse: "Vehicle use",
  reportlink: "Provider report",
  nhtsa: "NHTSA",
  msrp: "MSRP",
};

export function humanizeKey(key: string): string {
  const lower = key.toLowerCase();
  if (KEY_LABELS[lower]) return KEY_LABELS[lower];
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function toFields(record: Record<string, unknown>): Field[] {
  return Object.entries(record)
    .map(([key, value]) => ({ label: humanizeKey(key), value: stringify(value) }))
    .filter((field) => field.value.length > 0);
}

function pickAttribute(
  attributes: Record<string, unknown>,
  ...candidates: string[]
): string | undefined {
  const lowered = new Map(
    Object.entries(attributes).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const candidate of candidates) {
    const value = lowered.get(candidate.toLowerCase());
    const text = stringify(value);
    if (text) return text;
  }
  return undefined;
}

function buildSection(
  key: string,
  title: string,
  description: string,
  emptyLabel: string,
  value: unknown,
): ReportSection {
  return {
    key,
    title,
    description,
    emptyLabel,
    records: asRecordArray(value)
      .map(toFields)
      .filter((fields) => fields.length > 0),
  };
}

function check(
  key: string,
  label: string,
  count: number,
  foundDetail: string,
  clearDetail: string,
): ReportCheck {
  return {
    key,
    label,
    status: count > 0 ? "found" : "clear",
    count,
    detail: count > 0 ? foundDetail : clearDetail,
  };
}

function parseOdometer(titles: Record<string, unknown>[]): OdometerReading[] {
  const readings: OdometerReading[] = [];
  for (const title of titles) {
    const raw = stringify(title.meter ?? title.odometer ?? title.mileage);
    const numeric = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    readings.push({
      date: stringify(title.date) || "Unknown date",
      value: numeric,
      unit: stringify(title.meterunit) || "mi",
      source: stringify(title.state) || "Title record",
    });
  }
  return readings.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Converts a VinAudit `pullreport` payload into the app's report model.
 * The provider adds and renames fields over time, so anything unrecognised is
 * rendered generically rather than dropped.
 */
export function normalizeVinAuditReport(
  payload: Record<string, unknown>,
  vin: string,
): VehicleReport {
  const attributes =
    (payload.attributes as Record<string, unknown> | undefined) ?? {};

  const vehicle: VehicleSummary = {
    year: pickAttribute(attributes, "Year", "model_year"),
    make: pickAttribute(attributes, "Make"),
    model: pickAttribute(attributes, "Model"),
    trim: pickAttribute(attributes, "Trim", "Trim Level", "Series"),
    bodyStyle: pickAttribute(attributes, "Style", "Body Type", "Body Style"),
    engine: pickAttribute(attributes, "Engine", "Engine Type"),
    transmission: pickAttribute(attributes, "Transmission", "Transmission Type"),
    drivetrain: pickAttribute(attributes, "Drive Type", "Drivetrain"),
    fuelType: pickAttribute(attributes, "Fuel Type"),
    madeIn: pickAttribute(attributes, "Made In", "Manufactured In", "Country"),
  };

  const titles = asRecordArray(payload.titles);
  const jsi = asRecordArray(payload.jsi);
  const accidents = asRecordArray(payload.accidents);
  const thefts = asRecordArray(payload.thefts);
  const liens = asRecordArray(payload.liens);
  const impounds = asRecordArray(payload.impounds);
  const exports = asRecordArray(payload.exports);
  const sales = asRecordArray(payload.sales);
  const recalls = asRecordArray(payload.recalls);

  const brandedTitles = titles.filter((title) => {
    const brand = `${stringify(title.brand)} ${stringify(title.title)} ${stringify(title.type)}`.toLowerCase();
    return /salvage|junk|rebuilt|flood|lemon|fire|hail|total loss|reconstruct/.test(
      brand,
    );
  });

  const checks: ReportCheck[] = [
    check(
      "titles",
      "Title records",
      titles.length,
      `${titles.length} title record${titles.length === 1 ? "" : "s"} on file`,
      "No title records returned",
    ),
    check(
      "branded",
      "Branded title",
      brandedTitles.length + jsi.length,
      "Salvage, junk or insurance-loss activity reported",
      "No salvage, junk or insurance brand found",
    ),
    check(
      "accidents",
      "Accident records",
      accidents.length,
      `${accidents.length} accident record${accidents.length === 1 ? "" : "s"} reported`,
      "No accident records reported",
    ),
    check(
      "thefts",
      "Theft records",
      thefts.length,
      "Theft record reported",
      "No active theft record",
    ),
    check(
      "liens",
      "Liens & repossessions",
      liens.length,
      "Lien or repossession activity reported",
      "No lien or repossession reported",
    ),
    check(
      "impounds",
      "Impounds",
      impounds.length,
      "Impound record reported",
      "No impound record",
    ),
    check(
      "exports",
      "Export records",
      exports.length,
      "Export record reported",
      "No export record",
    ),
    check(
      "recalls",
      "Open recalls",
      recalls.length,
      `${recalls.length} recall campaign${recalls.length === 1 ? "" : "s"} listed`,
      "No recall campaigns listed",
    ),
  ];

  const sections: ReportSection[] = [
    buildSection(
      "titles",
      "Title & registration history",
      "Every title and registration event the provider has on file, newest data as reported by the issuing state.",
      "No title or registration events were returned for this VIN.",
      titles,
    ),
    buildSection(
      "jsi",
      "Junk, salvage & insurance records",
      "NMVTIS junk, salvage and total-loss entries reported by insurers, recyclers and salvage yards.",
      "No junk, salvage or insurance-loss records were returned.",
      jsi,
    ),
    buildSection(
      "accidents",
      "Accident & damage records",
      "Reported collision and damage events.",
      "No accident or damage records were returned.",
      accidents,
    ),
    buildSection(
      "thefts",
      "Theft records",
      "Reported thefts and recoveries.",
      "No theft records were returned.",
      thefts,
    ),
    buildSection(
      "liens",
      "Liens & repossessions",
      "Financial interests recorded against the vehicle.",
      "No liens or repossessions were returned.",
      liens,
    ),
    buildSection(
      "impounds",
      "Impound records",
      "Impound and towing events.",
      "No impound records were returned.",
      impounds,
    ),
    buildSection(
      "exports",
      "Export records",
      "Records of the vehicle leaving the country.",
      "No export records were returned.",
      exports,
    ),
    buildSection(
      "sales",
      "Sales & listing history",
      "Prior retail and auction listings, including asking prices where available.",
      "No prior sales listings were returned.",
      sales,
    ),
    buildSection(
      "recalls",
      "Safety recalls",
      "Manufacturer recall campaigns that apply to this vehicle.",
      "No recall campaigns were returned.",
      recalls,
    ),
  ];

  const specifications: Field[] = Object.entries(attributes)
    .map(([key, value]) => ({ label: humanizeKey(key), value: stringify(value) }))
    .filter((field) => field.value.length > 0);

  const providerReportUrl = stringify(payload.reportlink) || undefined;

  return {
    vin: normalizeVin(vin),
    source: "vinaudit",
    isSample: false,
    generatedAt: new Date().toISOString(),
    vehicle,
    headline:
      checks.some((c) => c.key === "branded" && c.status === "found")
        ? "Branded-title activity was reported for this VIN."
        : "No salvage, junk or insurance-loss brand was reported for this VIN.",
    specifications,
    checks,
    sections,
    odometer: parseOdometer(titles),
    providerReportUrl,
    raw: payload,
  };
}

/* -------------------------------------------------------------------------- */
/* API call                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Pulls a vehicle history report from VinAudit.
 *
 * Throws — never returns sample data — when credentials are missing or the
 * provider rejects the request. Callers are responsible for surfacing the
 * failure and refunding or retrying.
 */
export async function pullVinAuditReport(vin: string): Promise<VehicleReport> {
  if (!isVinAuditConfigured()) {
    throw new ProviderNotConfiguredError(missingVinAuditKeys());
  }

  const normalized = normalizeVin(vin);
  const url = new URL("/v2/pullreport", vinaudit.baseUrl);
  url.searchParams.set("key", vinaudit.apiKey as string);
  url.searchParams.set("username", vinaudit.username as string);
  url.searchParams.set("password", vinaudit.password as string);
  url.searchParams.set("vin", normalized);
  url.searchParams.set("format", "json");
  url.searchParams.set("reportlink", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), vinaudit.timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `VinAudit did not respond within ${vinaudit.timeoutMs}ms`
        : `Could not reach VinAudit: ${(error as Error).message}`;
    throw new ProviderRequestError(reason);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      `VinAudit returned HTTP ${response.status}`,
      response.status,
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ProviderRequestError("VinAudit returned a response we could not parse");
  }

  if (payload.success === false || payload.success === "false") {
    const message = stringify(payload.error) || "VinAudit could not produce a report for this VIN";
    throw new ProviderRequestError(message);
  }

  return normalizeVinAuditReport(payload, normalized);
}

/** Lightweight credential probe used by /status. Never pulls a report. */
export async function probeVinAudit(): Promise<{
  ok: boolean;
  detail: string;
}> {
  if (!isVinAuditConfigured()) {
    return {
      ok: false,
      detail: `Missing ${missingVinAuditKeys().join(", ")}`,
    };
  }
  const url = new URL("/v2/query", vinaudit.baseUrl);
  url.searchParams.set("key", vinaudit.apiKey as string);
  url.searchParams.set("format", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok
      ? { ok: true, detail: "Credentials present, endpoint reachable" }
      : { ok: false, detail: `Endpoint returned HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: `Unreachable: ${(error as Error).message}` };
  } finally {
    clearTimeout(timeout);
  }
}
