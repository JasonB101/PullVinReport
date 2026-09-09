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
import {
  LISTING_SECTION_NOTE,
  dedupeConsecutiveRecords,
  dedupeOdometerReadings,
  formatEventDate,
  isoDate,
  liftSharedFields,
  preferResolvedDisposition,
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
  meter: "Mileage",
  titletype: "Event",
  transactiontype: "Event",
  transaction: "Event",
  event: "Event",
  titlenumber: "Title number",
  standardclaim: "Standard claim",
  nmvtisid: "NMVTIS ID",
  vehicleuse: "Vehicle use",
  reportlink: "Provider report",
  nhtsa: "NHTSA",
  msrp: "MSRP",
  reportingentity: "Reporting entity",
  obtainedfrom: "Obtained from",
  intendedforexport: "Intended for export",
  sellertype: "Seller type",
  sellername: "Seller",
  seller: "Seller",
  dealername: "Seller",
  listingprice: "Price",
  saleprice: "Price",
  lienholder: "Lienholder",
  zipcode: "ZIP code",
};

export function humanizeKey(key: string): string {
  const lower = key.toLowerCase();
  if (KEY_LABELS[lower]) return KEY_LABELS[lower];
  const compact = lower.replace(/[^a-z0-9]/g, "");
  if (KEY_LABELS[compact]) return KEY_LABELS[compact];
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Keys the buyer should never see on a record.
 *
 * The VIN heads the report already, and repeating it on every row is the main
 * reason the raw feed reads like a database dump. The provider's own report
 * link is an operator detail and stays out of the customer's copy.
 */
const HIDDEN_KEYS = new Set(["vin", "reportlink", "reportid", "id"]);

const ODOMETER_KEYS = new Set(["meter", "odometer", "mileage"]);
const ODOMETER_UNIT_KEYS = new Set(["meterunit", "odometerunit", "mileageunit"]);

/** Keys whose values are flags, so they read as Yes/No rather than 1/Y/true. */
const BOOLEAN_KEYS = new Set([
  "current",
  "recovered",
  "released",
  "active",
  "intendedforexport",
  "airbagdeployed",
  "airbagsdeployed",
]);

function isDateKey(key: string): boolean {
  return key === "date" || key.endsWith("date") || key.endsWith("_date");
}

function yesNo(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = stringify(value).toLowerCase();
  if (["y", "yes", "true", "1"].includes(text)) return "Yes";
  if (["n", "no", "false", "0"].includes(text)) return "No";
  return stringify(value);
}

const PRICE_KEYS = new Set([
  "price",
  "listingprice",
  "saleprice",
  "soldprice",
  "askingprice",
]);

/**
 * Renders a price the feed sent as a bare number.
 *
 * These records are US titles and US listings, so the currency is not in
 * doubt. Anything that already carries a symbol, a currency code or any other
 * punctuation the feed chose is left exactly as it arrived — reformatting a
 * value someone else already formatted is how `$$11,450` happens.
 */
function formatMoney(value: unknown): string {
  const text = stringify(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return text;
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** A run long enough that the capitals are the feed shouting, not an acronym. */
const SHOUTED = /[A-Z]{4}/;

/**
 * Takes a record value out of all caps.
 *
 * NMVTIS answers in upper case — `SOLD`, `TO BE DETERMINED`, `INSURANCE
 * COMPANY` — and a column of that reads as a database export rather than as a
 * report someone paid for. Anything with a lower-case letter in it was already
 * cased by whoever sent it and is left alone, as is anything too short to be
 * more than an abbreviation or a state code.
 */
function unshout(value: string): string {
  if (/[a-z]/.test(value) || !SHOUTED.test(value)) return value;
  const lower = value.toLowerCase();
  return lower.replace(/[a-z]/, (first) => first.toUpperCase());
}

/** Turns a raw mileage plus its unit code into one readable value. */
function formatOdometer(value: unknown, unit: unknown): string {
  const numeric = Number.parseInt(stringify(value).replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  const code = stringify(unit).toLowerCase();
  return `${numeric.toLocaleString("en-US")} ${code.startsWith("k") ? "km" : "mi"}`;
}

/**
 * Converts one provider record into the handful of fields worth reading.
 *
 * Empty values, the repeated VIN and split-up odometer columns are folded away
 * so a record carries the event and nothing else.
 */
function toFields(record: Record<string, unknown>): Field[] {
  const unit = Object.entries(record).find(([key]) =>
    ODOMETER_UNIT_KEYS.has(key.toLowerCase()),
  )?.[1];

  const fields: Field[] = [];

  for (const [key, value] of Object.entries(record)) {
    const lower = key.toLowerCase();
    if (HIDDEN_KEYS.has(lower) || ODOMETER_UNIT_KEYS.has(lower)) continue;

    if (ODOMETER_KEYS.has(lower)) {
      // One column for the reading, whichever of meter/odometer/mileage the
      // feed used, with its unit already folded in.
      addField(fields, "Mileage", formatOdometer(value, unit));
      continue;
    }

    if (PRICE_KEYS.has(lower) || PRICE_KEYS.has(lower.replace(/[^a-z0-9]/g, ""))) {
      addField(fields, "Price", formatMoney(value));
      continue;
    }

    addField(
      fields,
      humanizeKey(key),
      BOOLEAN_KEYS.has(lower)
        ? yesNo(value)
        : isDateKey(lower)
          ? formatEventDate(stringify(value))
          : unshout(stringify(value)),
    );
  }

  return fields;
}

/**
 * Adds a field unless it is empty, keeping one field per label.
 *
 * Several provider keys can map to the same label — a record with both a title
 * type and a transaction type is one "Event" to a reader — so a second value
 * joins the first instead of creating a duplicate row the table would drop.
 */
function addField(fields: Field[], label: string, value: string): void {
  if (value.length === 0) return;
  const existing = fields.find((field) => field.label === label);
  if (!existing) {
    fields.push({ label, value });
    return;
  }
  if (existing.value === value) return;
  existing.value = `${existing.value} · ${value}`;
}

/** Puts a section's column fields first so a record reads in a fixed order. */
function orderFields(fields: Field[], columns: string[]): Field[] {
  const rank = (field: Field) => {
    const index = columns.indexOf(field.label);
    return index === -1 ? columns.length : index;
  };
  return fields
    .map((field, index) => ({ field, index }))
    .sort((a, b) => rank(a.field) - rank(b.field) || a.index - b.index)
    .map((entry) => entry.field);
}

/** Newest event first, with undated records left in the order they arrived. */
function sortByDateDesc(
  records: { record: Record<string, unknown>; fields: Field[] }[],
): Field[][] {
  return records
    .map((entry, index) => {
      const dated = Object.entries(entry.record).find(
        ([key, value]) => isDateKey(key.toLowerCase()) && isoDate(stringify(value)),
      );
      return {
        index,
        fields: entry.fields,
        key: dated ? isoDate(stringify(dated[1])) : "",
      };
    })
    .sort((a, b) => {
      if (a.key && b.key && a.key !== b.key) return a.key < b.key ? 1 : -1;
      if (Boolean(a.key) !== Boolean(b.key)) return a.key ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.fields);
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

/** Labels that only ever repeat what the report heading already says. */
const HEADING_LABELS = new Set(["Year", "Make", "Model", "Trim", "Trim level", "Series"]);

/** `2012 Toyota Camry SE` heads the report, so the spec grid can skip its parts. */
function isRestatedByHeading(field: Field, vehicle: VehicleSummary): boolean {
  if (!HEADING_LABELS.has(field.label)) return false;
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].includes(
    field.value,
  );
}

type SectionSpec = {
  key: string;
  title: string;
  /** What the jump nav calls it. */
  navLabel: string;
  description: string;
  emptyLabel: string;
  columns?: string[];
  layout?: ReportSection["layout"];
};

function buildSection(spec: SectionSpec, value: unknown): ReportSection {
  const columns = spec.columns ?? [];
  const cleaned = asRecordArray(value)
    .map((record) => ({ record, fields: orderFields(toFields(record), columns) }))
    .filter((entry) => entry.fields.length > 0);

  let records = dedupeConsecutiveRecords(sortByDateDesc(cleaned));
  // Same-day TBD + Sold on one Copart/IAA run is one event. Junk/salvage
  // always collapses; sales only when the row is an auction/salvage channel.
  if (spec.key === "jsi") {
    records = preferResolvedDisposition(records);
  } else if (spec.key === "sales") {
    records = preferResolvedDisposition(records, { requireAuctionChannel: true });
  }

  const { records: lifted, shared } = liftSharedFields(records);

  return { ...spec, records: lifted, shared };
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

function checkFound(checks: ReportCheck[], key: string): boolean {
  return checks.some((entry) => entry.key === key && entry.status === "found");
}

/** Title brands and NMVTIS salvage are separate facts; the headline says which. */
function brandedOrSalvageHeadline(checks: ReportCheck[]): string {
  const branded = checkFound(checks, "branded");
  const salvage = checkFound(checks, "jsi");
  if (branded) return "Branded-title activity was reported for this VIN.";
  if (salvage) {
    return "Junk, salvage or insurance-loss activity was reported for this VIN.";
  }
  return "No salvage, junk or insurance-loss brand was reported for this VIN.";
}

/**
 * Dates stay in sortable ISO form here — the chart is ordered by them, and the
 * renderers format them for display.
 */
function parseOdometer(titles: Record<string, unknown>[]): OdometerReading[] {
  const readings: OdometerReading[] = [];
  for (const title of titles) {
    const raw = stringify(title.meter ?? title.odometer ?? title.mileage);
    const numeric = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    const date = stringify(title.date);
    readings.push({
      date: isoDate(date) || date || "Unknown date",
      value: numeric,
      unit: stringify(title.meterunit).toLowerCase().startsWith("k") ? "km" : "mi",
      source: stringify(title.state) || "Title record",
    });
  }
  return dedupeOdometerReadings(
    readings.sort((a, b) => a.date.localeCompare(b.date)),
  );
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
      brandedTitles.length,
      "A salvage, junk or other brand is on the title records",
      "No salvage, junk or insurance brand found",
    ),
    check(
      "jsi",
      "Junk & salvage",
      jsi.length,
      `${jsi.length} junk/salvage record${jsi.length === 1 ? "" : "s"} on file`,
      "No junk, salvage or insurance-loss records",
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
      {
        key: "titles",
        title: "Title, registration & mileage",
        navLabel: "Titles & mileage",
        description:
          "Each title and registration event we found for this VIN, newest first, with the mileage reported at that event.",
        emptyLabel: "No title or registration events came back for this VIN.",
        columns: ["Date", "State", "Mileage", "Event", "Brand", "Current"],
      },
      titles,
    ),
    buildSection(
      {
        key: "jsi",
        title: "Junk, salvage & insurance records",
        navLabel: "Junk & salvage",
        description:
          "NMVTIS junk, salvage and total-loss entries reported by insurers, recyclers and salvage yards.",
        emptyLabel: "No junk, salvage or insurance-loss records came back.",
        columns: ["Date", "State", "City", "Reporting entity", "Obtained from"],
      },
      jsi,
    ),
    buildSection(
      {
        key: "accidents",
        title: "Accident & damage records",
        navLabel: "Accidents",
        description: "Reported collision and damage events.",
        emptyLabel: "No accident or damage records came back.",
        columns: ["Date", "State", "City", "Severity", "Damage", "Mileage"],
      },
      accidents,
    ),
    buildSection(
      {
        key: "thefts",
        title: "Theft records",
        navLabel: "Thefts",
        description: "Reported thefts and recoveries.",
        emptyLabel: "No theft records came back.",
        columns: ["Date", "State", "City", "Recovered"],
      },
      thefts,
    ),
    buildSection(
      {
        key: "liens",
        title: "Liens & repossessions",
        navLabel: "Liens",
        description: "Financial interests recorded against the vehicle.",
        emptyLabel: "No liens or repossessions came back.",
        columns: ["Date", "State", "Type", "Status", "Lienholder"],
      },
      liens,
    ),
    buildSection(
      {
        key: "impounds",
        title: "Impound records",
        navLabel: "Impounds",
        description: "Impound and towing events.",
        emptyLabel: "No impound records came back.",
        columns: ["Date", "State", "City", "Reason"],
      },
      impounds,
    ),
    buildSection(
      {
        key: "exports",
        title: "Export records",
        navLabel: "Exports",
        description: "Records of the vehicle leaving the country.",
        emptyLabel: "No export records came back.",
        columns: ["Date", "State", "Port", "Country"],
      },
      exports,
    ),
    buildSection(
      {
        key: "sales",
        title: "Sales & listing history",
        navLabel: "Sales",
        description: LISTING_SECTION_NOTE,
        emptyLabel: "No listing snapshots came back.",
        // A listing carries far more than a table can hold: dealer, stock
        // number, colours, options, the ad copy itself. Chapters fold the
        // scrape noise; the long tail stays one click away.
        layout: "listings",
      },
      sales,
    ),
    buildSection(
      {
        key: "recalls",
        title: "Safety recalls",
        navLabel: "Recalls",
        description: "Manufacturer recall campaigns that apply to this vehicle.",
        emptyLabel: "No recall campaigns came back.",
      },
      recalls,
    ),
  ];

  const jsiShown =
    sections.find((section) => section.key === "jsi")?.records.length ?? 0;
  const jsiCheck = checks.find((entry) => entry.key === "jsi");
  if (jsiCheck && jsiCheck.count !== jsiShown) {
    jsiCheck.count = jsiShown;
    jsiCheck.status = jsiShown > 0 ? "found" : "clear";
    jsiCheck.detail =
      jsiShown > 0
        ? `${jsiShown} junk/salvage record${jsiShown === 1 ? "" : "s"} on file`
        : "No junk, salvage or insurance-loss records";
  }

  const specifications: Field[] = Object.entries(attributes)
    .map(([key, value]) => ({ label: humanizeKey(key), value: stringify(value) }))
    .filter(
      (field) =>
        field.value.length > 0 &&
        field.label !== "VIN" &&
        !isRestatedByHeading(field, vehicle),
    );

  const providerReportUrl = stringify(payload.reportlink) || undefined;

  return {
    vin: normalizeVin(vin),
    source: "vinaudit",
    isSample: false,
    generatedAt: new Date().toISOString(),
    vehicle,
    headline: brandedOrSalvageHeadline(checks),
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
