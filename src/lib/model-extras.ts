/**
 * Public, model-level extras shown after VIN history, in a fenced model-only zone.
 *
 * NHTSA recalls, NHTSA 5-Star safety ratings, NHTSA owner complaints, and EPA
 * fuel economy / ownership / EV fields for the report's year/make/model —
 * never for this VIN. A buyer who skims must not mistake a 2012 Camry
 * complaint theme for something on the car in front of them, so every surface
 * that prints this data names the YMM and says it is not this VIN.
 *
 * All sources are free public APIs:
 *   - NHTSA recalls:    api.nhtsa.gov/recalls/recallsByVehicle
 *   - NHTSA complaints: api.nhtsa.gov/complaints/complaintsByVehicle
 *   - NHTSA 5-Star:     api.nhtsa.gov/SafetyRatings (YMM → VehicleId → ratings)
 *   - EPA FuelEconomy:  fueleconomy.gov/ws/rest/vehicle (menu + vehicle record)
 *
 * Each outbound call is tried up to three times with a short backoff on
 * network errors, timeouts, 429 and 5xx. After retries, missing data, a
 * downed API or an ambiguous EPA match hides that slice — and if nothing
 * useful remains, the whole model zone is omitted. The paid VIN history is
 * unchanged.
 *
 * Cache (keeps incremental cost ~$0): keyed by `v4|{year}|{make}|{model}|{slice}`
 * in memory and on the order store (not per VIN / order). Positive hits live
 * 7 days. Empty or failed slices live 15 minutes so a blip cannot hide public
 * data for a week. Two orders for the same Camry share one government round-trip.
 */
import { exactYearMakeModel } from "@/lib/ai-brief";
import { cleanCustomerLine } from "@/lib/customer-text";
import { formatEventDate, isoDate, type Field, type VehicleReport, type VehicleSummary } from "@/lib/report";

const RECALLS_URL = "https://api.nhtsa.gov/recalls/recallsByVehicle";
const COMPLAINTS_URL = "https://api.nhtsa.gov/complaints/complaintsByVehicle";
const SAFETY_VARIANTS_URL = "https://api.nhtsa.gov/SafetyRatings/modelyear";
const SAFETY_VEHICLE_URL = "https://api.nhtsa.gov/SafetyRatings/VehicleId";
const EPA_OPTIONS_URL = "https://www.fueleconomy.gov/ws/rest/vehicle/menu/options";
const EPA_VEHICLE_URL = "https://www.fueleconomy.gov/ws/rest/vehicle";

const TIMEOUT_MS = 8_000;
/** First try plus two retries. Short pauses so a blip can clear. */
export const MODEL_EXTRAS_FETCH_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAYS_MS = [400, 1_000];
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 15 * 60 * 1000;
const CACHE_LIMIT = 400;
const MAX_CAMPAIGNS = 4;
const MAX_THEMES = 4;
const MAX_COMPLAINT_SAMPLES = 5;
const MAX_SUMMARY_CHARS = 480;
const MAX_EPA_VEHICLES = 12;
const MAX_SAFETY_VARIANTS = 8;

/** Bump when the stored extras shape or YMM lookup aliases change. */
const EXTRAS_CACHE_VERSION = "v5";

/** NHTSA campaign flags we surface — only when the API set them. */
export type RecallBadgeKey =
  | "parkIt"
  | "parkOutSide"
  | "overTheAirUpdate"
  | "takata";

export type RecallBadge = {
  key: RecallBadgeKey;
  label: string;
};

export type ModelRecall = {
  campaign: string;
  title: string;
  consequence?: string;
  remedy?: string;
  parkIt?: boolean;
  parkOutSide?: boolean;
  overTheAirUpdate?: boolean;
  /** Clipped NHTSA text that already names Takata — never invented. */
  takataNote?: string;
};

export type ModelComplaintTheme = {
  component: string;
  count: number;
};

export type ModelComplaintSample = {
  /** ISO date when we could parse one, already formatted for display. */
  date?: string;
  components: string;
  summary: string;
  odiNumber?: string;
  crash?: boolean;
  fire?: boolean;
};

export type ModelMpg = {
  city: number;
  highway: number;
  combined: number;
  fuelType: string;
};

/** EPA ownership / emissions fields. Fuel costs are estimates. */
export type ModelOwnership = {
  annualFuelCost?: number;
  youSaveSpend?: number;
  feScore?: number;
  ghgScore?: number;
  co2?: number;
};

export type ModelEvKind = "EV" | "PHEV";

export type ModelEv = {
  kind: ModelEvKind;
  range?: number;
  charge120?: number;
  charge240?: number;
  batteryKwh?: number;
  mpge?: {
    city: number;
    highway: number;
    combined: number;
  };
};

/** NHTSA 5-Star ratings for this model year. Stars only — never invented. */
export type ModelSafetyRatings = {
  overall?: number;
  front?: number;
  side?: number;
  rollover?: number;
  sidePole?: number;
  vehicleDescription?: string;
};

export type ModelRecalls = {
  total: number;
  campaigns: ModelRecall[];
  parkIt?: boolean;
  parkOutSide?: boolean;
  overTheAirUpdate?: boolean;
  takata?: boolean;
};

export type ModelComplaints = {
  total: number;
  themes: ModelComplaintTheme[];
  samples: ModelComplaintSample[];
};

export type ModelExtras = {
  year: string;
  make: string;
  model: string;
  ymmLabel: string;
  recalls?: ModelRecalls;
  complaints?: ModelComplaints;
  mpg?: ModelMpg;
  ownership?: ModelOwnership;
  ev?: ModelEv;
  safetyRatings?: ModelSafetyRatings;
};

export type ModelExtrasCacheRecord = {
  cacheKey: string;
  payload: unknown;
  fetchedAt: string;
};

export type ModelExtrasCache = {
  getModelExtras(cacheKey: string): Promise<ModelExtrasCacheRecord | null>;
  saveModelExtras(record: ModelExtrasCacheRecord): Promise<void>;
};

type MemoryEntry = { expires: number; value: unknown };

const memory = new Map<string, MemoryEntry>();

let retryDelaysMs = DEFAULT_RETRY_DELAYS_MS.slice();

type Ymm = { year: string; make: string; model: string; ymmLabel: string };

export type EpaOption = { text: string; id: string };

export type EpaVehicleMpg = {
  id: string;
  city: number;
  highway: number;
  combined: number;
  fuelType: string;
  displacement?: string;
  atvType?: string;
  fuelCost08?: number;
  youSaveSpend?: number;
  feScore?: number;
  ghgScore?: number;
  co2?: number;
  range?: number;
  charge120?: number;
  charge240?: number;
  batteryKwh?: number;
  phevCity?: number;
  phevHwy?: number;
  phevComb?: number;
};

/** Drops the in-process cache. Tests only. */
export function resetModelExtrasCacheForTests(): void {
  memory.clear();
}

/** Makes retries instant so fetch tests do not sleep. Tests only. */
export function setModelExtrasRetryDelaysForTests(delaysMs: number[]): void {
  retryDelaysMs = delaysMs.slice();
}

export function resetModelExtrasRetryForTests(): void {
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS.slice();
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleepRetryBackoff(attempt: number): Promise<void> {
  const delay = retryDelaysMs[attempt - 1] ?? retryDelaysMs.at(-1) ?? 0;
  if (delay > 0) await sleep(delay);
}

export function ymmFromVehicle(vehicle: VehicleSummary): Ymm | null {
  const year = vehicle.year?.trim() ?? "";
  const make = vehicle.make?.trim() ?? "";
  const model = vehicle.model?.trim() ?? "";
  const ymmLabel = exactYearMakeModel(vehicle);
  if (!year || !make || !model || !ymmLabel) return null;
  return { year, make, model, ymmLabel };
}

export function ymmCacheKey(year: string, make: string, model: string): string {
  const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(year)}|${norm(make)}|${norm(model)}`;
}

/**
 * NHTSA often indexes a car under a shorter model name than the report prints.
 *
 * The 2016 Mini Clubman Cooper is the case that surfaced this: the report
 * heading says "Clubman Cooper", vPIC Series is Cooper, and NHTSA recalls
 * 16V553000 / 17E051000 live under `Clubman` with zero rows for the longer
 * name. We only drop leading or trailing series tokens so `Grand Cherokee`
 * stays `Grand Cherokee`.
 */
const NHTSA_SERIES_TOKENS = new Set([
  "all4",
  "base",
  "cooper",
  "ex",
  "jcw",
  "le",
  "limited",
  "lx",
  "premium",
  "s",
  "se",
  "si",
  "sport",
  "touring",
  "xle",
]);

export function nhtsaModelCandidates(model: string): string[] {
  const primary = model.trim().replace(/\s+/g, " ");
  if (!primary) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value: string) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  };

  add(primary);
  const parts = primary.split(" ");
  if (parts.length < 2) return out;

  let trailing = parts.slice();
  while (
    trailing.length > 1 &&
    NHTSA_SERIES_TOKENS.has(trailing[trailing.length - 1]!.toLowerCase())
  ) {
    trailing = trailing.slice(0, -1);
  }
  add(trailing.join(" "));

  let leading = parts.slice();
  while (
    leading.length > 1 &&
    NHTSA_SERIES_TOKENS.has(leading[0]!.toLowerCase())
  ) {
    leading = leading.slice(1);
  }
  add(leading.join(" "));

  return out;
}

/**
 * EPA FuelEconomy and NHTSA SafetyRatings menus often prefix Mini body
 * names with Cooper. vPIC and the report print `Clubman`; those menus
 * list `Cooper Clubman` (and `Cooper S Clubman`). Recalls already match
 * `Clubman`, so this list is only for the two menu lookups.
 *
 * Soft-omit stays: if every alias still misses, that slice is hidden.
 */
export function epaSafetyModelCandidates(make: string, model: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value: string) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  };

  for (const candidate of nhtsaModelCandidates(model)) add(candidate);
  if (!/^mini$/i.test(make.trim())) return out;

  const parts = model
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const clubmanAt = parts.indexOf("clubman");
  if (clubmanAt < 0) return out;

  const cooperAt = parts.indexOf("cooper");
  const alreadyCooperPrefixed = cooperAt >= 0 && cooperAt < clubmanAt;
  if (parts.includes("s")) add("Cooper S Clubman");
  if (!alreadyCooperPrefixed) add("Cooper Clubman");

  return out;
}

/**
 * Litres from the report's engine line, used to pick one EPA row when a
 * model has more than one powertrain. `2.5L L4` → `2.5`. Empty when we
 * cannot tell — then MPG is only shown if every EPA option agrees.
 */
export function engineDisplacementHint(
  vehicle: VehicleSummary,
  specifications: Field[] = [],
): string {
  const sources = [
    vehicle.engine,
    ...specifications.map((field) => field.value),
  ];
  for (const source of sources) {
    if (!source) continue;
    const match = /(\d+(?:\.\d+)?)\s*L\b/i.exec(source);
    if (match) return trimDisplacement(match[1]);
  }
  return "";
}

function trimDisplacement(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value.trim();
  return String(number);
}

export function hasOwnership(ownership: ModelOwnership | null | undefined): ownership is ModelOwnership {
  if (!ownership) return false;
  return (
    ownership.annualFuelCost !== undefined ||
    ownership.youSaveSpend !== undefined ||
    ownership.feScore !== undefined ||
    ownership.ghgScore !== undefined ||
    ownership.co2 !== undefined
  );
}

export function hasEvCard(ev: ModelEv | null | undefined): ev is ModelEv {
  if (!ev) return false;
  return Boolean(
    ev.range !== undefined ||
      ev.charge120 !== undefined ||
      ev.charge240 !== undefined ||
      ev.batteryKwh !== undefined ||
      ev.mpge,
  );
}

export function hasSafetyRatings(
  ratings: ModelSafetyRatings | null | undefined,
): ratings is ModelSafetyRatings {
  if (!ratings) return false;
  return (
    ratings.overall !== undefined ||
    ratings.front !== undefined ||
    ratings.side !== undefined ||
    ratings.rollover !== undefined ||
    ratings.sidePole !== undefined
  );
}

export function hasModelExtras(extras: ModelExtras | null | undefined): extras is ModelExtras {
  if (!extras) return false;
  return Boolean(
    extras.recalls ||
      extras.complaints ||
      extras.mpg ||
      hasOwnership(extras.ownership) ||
      hasEvCard(extras.ev) ||
      hasSafetyRatings(extras.safetyRatings),
  );
}

export function displayComponent(raw: string): string {
  return raw
    .split(":")
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/\b[a-z0-9]/g, (character) => character.toUpperCase()),
    )
    .filter(Boolean)
    .join(" · ");
}

function clip(value: string, max = 280): string {
  const text = cleanCustomerLine(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberish(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function flag(value: unknown): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (typeof value === "string" && /^(y|yes)$/i.test(value.trim())) return true;
  return false;
}

function nhtsaStar(value: unknown): number | undefined {
  const textValue = text(value);
  if (textValue && /^not rated$/i.test(textValue)) return undefined;
  const parsed = numberish(value);
  if (parsed === undefined || parsed < 1 || parsed > 5) return undefined;
  return parsed;
}

function epaScore(value: unknown): number | undefined {
  const parsed = numberish(value);
  if (parsed === undefined || parsed < 1 || parsed > 10) return undefined;
  return parsed;
}

function epaCost(value: unknown): number | undefined {
  const parsed = numberish(value);
  if (parsed === undefined || parsed <= 0) return undefined;
  return parsed;
}

function epaSigned(value: unknown): number | undefined {
  const parsed = numberish(value);
  if (parsed === undefined) return undefined;
  return parsed;
}

function epaNonNegative(value: unknown): number | undefined {
  const parsed = numberish(value);
  if (parsed === undefined || parsed < 0) return undefined;
  return parsed;
}

function epaPositive(value: unknown): number | undefined {
  const parsed = numberish(value);
  if (parsed === undefined || parsed <= 0) return undefined;
  return parsed;
}

export function evKindFromAtvType(atvType: string | undefined): ModelEvKind | undefined {
  const value = (atvType ?? "").trim().toLowerCase();
  if (!value) return undefined;
  if (value === "ev" || value === "electric") return "EV";
  if (value === "phev" || value === "plug-in hybrid" || value === "plugin hybrid") {
    return "PHEV";
  }
  return undefined;
}

function takataNoteFrom(record: Record<string, unknown>): string | undefined {
  for (const key of ["Notes", "notes", "Summary", "summary", "Consequence", "Remedy"]) {
    const value = text(record[key]);
    if (value && /takata/i.test(value)) return clip(value);
  }
  return undefined;
}

function complaintDate(row: Record<string, unknown>): string {
  const raw =
    text(row.dateComplaintFiled) ||
    text(row.dateOfIncident) ||
    text(row.date);
  const iso = isoDate(raw);
  return iso ? formatEventDate(iso) : "";
}

function complaintOdi(row: Record<string, unknown>): string {
  const value = row.odiNumber ?? row.ODINumber;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
}

function complaintSignal(row: Record<string, unknown>): number {
  let score = 0;
  if (flag(row.crash)) score += 100;
  if (flag(row.fire)) score += 100;
  score += (numberish(row.numberOfInjuries) ?? 0) * 20;
  score += (numberish(row.numberOfDeaths) ?? 0) * 200;
  const raw =
    text(row.dateComplaintFiled) ||
    text(row.dateOfIncident) ||
    text(row.date);
  const iso = isoDate(raw);
  if (iso) score += Number(iso.replaceAll("-", "")) / 100_000_000;
  return score;
}

/* -------------------------------------------------------------------------- */
/* Parsers — exported so the government shapes can be tested offline          */
/* -------------------------------------------------------------------------- */

export function parseRecallsPayload(payload: unknown): ModelRecalls | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { Count?: unknown; count?: unknown; results?: unknown };
  const rows = Array.isArray(body.results) ? body.results : [];
  const total = numberish(body.Count) ?? numberish(body.count) ?? rows.length;
  if (!total && rows.length === 0) return null;

  const campaigns: ModelRecall[] = [];
  const seen = new Set<string>();
  let parkIt = false;
  let parkOutSide = false;
  let overTheAirUpdate = false;
  let takata = false;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const campaign = text(record.NHTSACampaignNumber);
    if (!campaign || seen.has(campaign)) continue;
    seen.add(campaign);
    const title =
      displayComponent(text(record.Component)) || `Campaign ${campaign}`;
    const consequence = clip(text(record.Consequence));
    const remedy = clip(text(record.Remedy));
    const rowParkIt = flag(record.parkIt);
    const rowParkOutSide = flag(record.parkOutSide);
    const rowOta = flag(record.overTheAirUpdate);
    const takataNote = takataNoteFrom(record);
    parkIt = parkIt || rowParkIt;
    parkOutSide = parkOutSide || rowParkOutSide;
    overTheAirUpdate = overTheAirUpdate || rowOta;
    takata = takata || Boolean(takataNote);
    if (campaigns.length < MAX_CAMPAIGNS) {
      campaigns.push({
        campaign,
        title,
        ...(consequence ? { consequence } : {}),
        ...(remedy ? { remedy } : {}),
        ...(rowParkIt ? { parkIt: true } : {}),
        ...(rowParkOutSide ? { parkOutSide: true } : {}),
        ...(rowOta ? { overTheAirUpdate: true } : {}),
        ...(takataNote ? { takataNote } : {}),
      });
    }
  }

  if (total === 0 && campaigns.length === 0) return null;
  return {
    total: total || campaigns.length,
    campaigns,
    ...(parkIt ? { parkIt: true } : {}),
    ...(parkOutSide ? { parkOutSide: true } : {}),
    ...(overTheAirUpdate ? { overTheAirUpdate: true } : {}),
    ...(takata ? { takata: true } : {}),
  };
}

function complaintComponents(row: Record<string, unknown>): string[] {
  const raw = text(row.components) || text(row.Components);
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !/^unknown(\s+or\s+other)?$/i.test(part));
}

export function parseComplaintsPayload(payload: unknown): ModelComplaints | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { count?: unknown; Count?: unknown; results?: unknown };
  const rows = Array.isArray(body.results) ? body.results : [];
  const total = numberish(body.count) ?? numberish(body.Count) ?? rows.length;
  if (!total && rows.length === 0) return null;

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const component of complaintComponents(row as Record<string, unknown>)) {
      const key = component.toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const themes = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_THEMES)
    .map(([component, count]) => ({
      component: displayComponent(component),
      count,
    }));

  const ranked = rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({ row, summary: clip(text(row.summary) || text(row.Summary), MAX_SUMMARY_CHARS) }))
    .filter((entry) => entry.summary.length > 0)
    .sort((a, b) => complaintSignal(b.row) - complaintSignal(a.row));

  const samples: ModelComplaintSample[] = [];
  const seen = new Set<string>();
  for (const { row, summary } of ranked) {
    const odi = complaintOdi(row);
    const key = odi || summary.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    const parts = complaintComponents(row).map(displayComponent);
    const date = complaintDate(row);
    const crash = flag(row.crash);
    const fire = flag(row.fire);
    samples.push({
      summary,
      components: parts.join(", ") || "Not specified",
      ...(date ? { date } : {}),
      ...(odi ? { odiNumber: odi } : {}),
      ...(crash ? { crash: true } : {}),
      ...(fire ? { fire: true } : {}),
    });
    if (samples.length >= MAX_COMPLAINT_SAMPLES) break;
  }

  return { total: total || rows.length, themes, samples };
}

export function parseEpaOptions(payload: unknown): EpaOption[] {
  if (!payload || typeof payload !== "object") return [];
  const menu = (payload as { menuItem?: unknown }).menuItem;
  const items = Array.isArray(menu) ? menu : menu ? [menu] : [];
  const options: EpaOption[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as { text?: unknown; value?: unknown };
    const id = text(row.value);
    const label = text(row.text);
    if (id) options.push({ text: label, id });
  }
  return options;
}

export function parseEpaVehicle(payload: unknown, id: string): EpaVehicleMpg | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const city = numberish(row.city08);
  const highway = numberish(row.highway08);
  const combined = numberish(row.comb08);
  if (city === undefined || highway === undefined || combined === undefined) {
    return null;
  }
  const fuelType =
    text(row.fuelType1) || text(row.fuelType) || text(row.fuelType2);
  const displacement = row.displ !== undefined ? trimDisplacement(String(row.displ)) : "";
  const atvType = text(row.atvType) || text(row.atvtype);
  return {
    id,
    city,
    highway,
    combined,
    fuelType,
    ...(displacement ? { displacement } : {}),
    ...(atvType ? { atvType } : {}),
    ...(epaCost(row.fuelCost08) !== undefined
      ? { fuelCost08: epaCost(row.fuelCost08) }
      : {}),
    ...(epaSigned(row.youSaveSpend) !== undefined
      ? { youSaveSpend: epaSigned(row.youSaveSpend) }
      : {}),
    ...(epaScore(row.feScore) !== undefined ? { feScore: epaScore(row.feScore) } : {}),
    ...(epaScore(row.ghgScore) !== undefined ? { ghgScore: epaScore(row.ghgScore) } : {}),
    ...(epaNonNegative(row.co2) !== undefined ? { co2: epaNonNegative(row.co2) } : {}),
    ...(epaPositive(row.range) !== undefined ? { range: epaPositive(row.range) } : {}),
    ...(epaPositive(row.charge120) !== undefined
      ? { charge120: epaPositive(row.charge120) }
      : {}),
    ...(epaPositive(row.charge240) !== undefined
      ? { charge240: epaPositive(row.charge240) }
      : {}),
    ...(epaPositive(row.battery) !== undefined
      ? { batteryKwh: epaPositive(row.battery) }
      : {}),
    ...(epaPositive(row.phevCity) !== undefined
      ? { phevCity: epaPositive(row.phevCity) }
      : {}),
    ...(epaPositive(row.phevHwy) !== undefined
      ? { phevHwy: epaPositive(row.phevHwy) }
      : {}),
    ...(epaPositive(row.phevComb) !== undefined
      ? { phevComb: epaPositive(row.phevComb) }
      : {}),
  };
}

export type SafetyVariant = { id: string; description: string };

export function parseSafetyVariants(payload: unknown): SafetyVariant[] {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as { Results?: unknown; results?: unknown };
  const rows = Array.isArray(body.Results)
    ? body.Results
    : Array.isArray(body.results)
      ? body.results
      : [];
  const variants: SafetyVariant[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = text(record.VehicleId) || (numberish(record.VehicleId) !== undefined
      ? String(numberish(record.VehicleId))
      : "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    variants.push({
      id,
      description: text(record.VehicleDescription),
    });
  }
  return variants;
}

export function parseSafetyRatings(payload: unknown): ModelSafetyRatings | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { Results?: unknown; results?: unknown };
  const rows = Array.isArray(body.Results)
    ? body.Results
    : Array.isArray(body.results)
      ? body.results
      : [];
  const row = rows[0];
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const ratings: ModelSafetyRatings = {
    ...(nhtsaStar(record.OverallRating) !== undefined
      ? { overall: nhtsaStar(record.OverallRating) }
      : {}),
    ...(nhtsaStar(record.OverallFrontCrashRating) !== undefined
      ? { front: nhtsaStar(record.OverallFrontCrashRating) }
      : {}),
    ...(nhtsaStar(record.OverallSideCrashRating) !== undefined
      ? { side: nhtsaStar(record.OverallSideCrashRating) }
      : {}),
    ...(nhtsaStar(record.RolloverRating) !== undefined
      ? { rollover: nhtsaStar(record.RolloverRating) }
      : {}),
    ...(nhtsaStar(record.SidePoleCrashRating) !== undefined
      ? { sidePole: nhtsaStar(record.SidePoleCrashRating) }
      : {}),
    ...(text(record.VehicleDescription)
      ? { vehicleDescription: text(record.VehicleDescription) }
      : {}),
  };
  return hasSafetyRatings(ratings) ? ratings : null;
}

export function pickSafetyRatings(
  ratings: ModelSafetyRatings[],
): ModelSafetyRatings | undefined {
  const usable = ratings.filter(hasSafetyRatings);
  if (usable.length === 0) return undefined;
  const first = usable[0]!;
  const pick = (key: keyof ModelSafetyRatings): number | undefined => {
    if (key === "vehicleDescription") return undefined;
    const values = usable.map((row) => row[key]);
    const star = values[0];
    if (typeof star !== "number") return undefined;
    return values.every((value) => value === star) ? star : undefined;
  };
  const merged: ModelSafetyRatings = {
    ...(pick("overall") !== undefined ? { overall: pick("overall") } : {}),
    ...(pick("front") !== undefined ? { front: pick("front") } : {}),
    ...(pick("side") !== undefined ? { side: pick("side") } : {}),
    ...(pick("rollover") !== undefined ? { rollover: pick("rollover") } : {}),
    ...(pick("sidePole") !== undefined ? { sidePole: pick("sidePole") } : {}),
    ...(first.vehicleDescription &&
    usable.every((row) => row.vehicleDescription === first.vehicleDescription)
      ? { vehicleDescription: first.vehicleDescription }
      : {}),
  };
  return hasSafetyRatings(merged) ? merged : undefined;
}

export function matchingEpaOptions(options: EpaOption[], hint: string): EpaOption[] {
  if (!hint) return options;
  const needle = trimDisplacement(hint);
  const pattern = new RegExp(`\\b${escapeRegExp(needle)}\\s*L\\b`, "i");
  return options.filter((option) => pattern.test(option.text));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function epaPool(vehicles: EpaVehicleMpg[], hint: string): EpaVehicleMpg[] | undefined {
  if (vehicles.length === 0) return undefined;
  if (!hint) return vehicles;
  const needle = trimDisplacement(hint);
  const matched = vehicles.filter(
    (vehicle) =>
      vehicle.displacement === needle ||
      (vehicle.displacement !== undefined &&
        trimDisplacement(vehicle.displacement) === needle),
  );
  return matched.length === 0 ? undefined : matched;
}

export function pickMpg(vehicles: EpaVehicleMpg[], hint: string): ModelMpg | undefined {
  const pool = epaPool(vehicles, hint);
  if (!pool) return undefined;

  const first = pool[0];
  const same = pool.every(
    (vehicle) =>
      vehicle.city === first.city &&
      vehicle.highway === first.highway &&
      vehicle.combined === first.combined &&
      vehicle.fuelType === first.fuelType,
  );
  if (!same) return undefined;
  return {
    city: first.city,
    highway: first.highway,
    combined: first.combined,
    fuelType: first.fuelType,
  };
}

function agreedNumber(
  pool: EpaVehicleMpg[],
  key: keyof EpaVehicleMpg,
): number | undefined {
  const values = pool.map((row) => row[key]);
  const first = values[0];
  if (typeof first !== "number") return undefined;
  return values.every((value) => value === first) ? first : undefined;
}

export function pickOwnership(
  vehicles: EpaVehicleMpg[],
  hint: string,
): ModelOwnership | undefined {
  const pool = epaPool(vehicles, hint);
  if (!pool) return undefined;
  const ownership: ModelOwnership = {
    ...(agreedNumber(pool, "fuelCost08") !== undefined
      ? { annualFuelCost: agreedNumber(pool, "fuelCost08") }
      : {}),
    ...(agreedNumber(pool, "youSaveSpend") !== undefined
      ? { youSaveSpend: agreedNumber(pool, "youSaveSpend") }
      : {}),
    ...(agreedNumber(pool, "feScore") !== undefined
      ? { feScore: agreedNumber(pool, "feScore") }
      : {}),
    ...(agreedNumber(pool, "ghgScore") !== undefined
      ? { ghgScore: agreedNumber(pool, "ghgScore") }
      : {}),
    ...(agreedNumber(pool, "co2") !== undefined
      ? { co2: agreedNumber(pool, "co2") }
      : {}),
  };
  return hasOwnership(ownership) ? ownership : undefined;
}

export function pickEv(
  vehicles: EpaVehicleMpg[],
  hint: string,
  mpg?: ModelMpg,
): ModelEv | undefined {
  const pool = epaPool(vehicles, hint);
  if (!pool) return undefined;
  const kinds = pool.map((row) => evKindFromAtvType(row.atvType));
  const kind = kinds[0];
  if (!kind || kinds.some((value) => value !== kind)) return undefined;

  const phevCity = agreedNumber(pool, "phevCity");
  const phevHwy = agreedNumber(pool, "phevHwy");
  const phevComb = agreedNumber(pool, "phevComb");
  const mpge =
    phevCity !== undefined && phevHwy !== undefined && phevComb !== undefined
      ? { city: phevCity, highway: phevHwy, combined: phevComb }
      : mpg
        ? { city: mpg.city, highway: mpg.highway, combined: mpg.combined }
        : undefined;

  const ev: ModelEv = {
    kind,
    ...(agreedNumber(pool, "range") !== undefined
      ? { range: agreedNumber(pool, "range") }
      : {}),
    ...(agreedNumber(pool, "charge120") !== undefined
      ? { charge120: agreedNumber(pool, "charge120") }
      : {}),
    ...(agreedNumber(pool, "charge240") !== undefined
      ? { charge240: agreedNumber(pool, "charge240") }
      : {}),
    ...(agreedNumber(pool, "batteryKwh") !== undefined
      ? { batteryKwh: agreedNumber(pool, "batteryKwh") }
      : {}),
    ...(mpge ? { mpge } : {}),
  };
  return hasEvCard(ev) ? ev : undefined;
}

export function composeModelExtras(
  ymm: Ymm,
  slices: {
    recalls?: ModelRecalls | null;
    complaints?: ModelComplaints | null;
    mpg?: ModelMpg | null;
    ownership?: ModelOwnership | null;
    ev?: ModelEv | null;
    safetyRatings?: ModelSafetyRatings | null;
  },
): ModelExtras | null {
  const extras: ModelExtras = {
    year: ymm.year,
    make: ymm.make,
    model: ymm.model,
    ymmLabel: ymm.ymmLabel,
  };
  if (slices.recalls) extras.recalls = slices.recalls;
  if (slices.complaints) {
    extras.complaints = {
      ...slices.complaints,
      samples: slices.complaints.samples ?? [],
    };
  }
  if (slices.mpg) extras.mpg = slices.mpg;
  if (hasOwnership(slices.ownership)) extras.ownership = slices.ownership;
  if (hasEvCard(slices.ev)) extras.ev = slices.ev;
  if (hasSafetyRatings(slices.safetyRatings)) extras.safetyRatings = slices.safetyRatings;
  return hasModelExtras(extras) ? extras : null;
}

/** Theme-only cache leftovers still render; a missing field is an empty list. */
export function complaintSamples(
  complaints: ModelComplaints | null | undefined,
): ModelComplaintSample[] {
  return complaints?.samples ?? [];
}

export type MpgFigure = {
  key: "city" | "highway" | "combined";
  label: string;
  value: number;
};

/** City / highway / combined in EPA order — the numbers already on the extras. */
export function mpgFigureRows(mpg: ModelMpg): MpgFigure[] {
  return [
    { key: "city", label: "City", value: mpg.city },
    { key: "highway", label: "Highway", value: mpg.highway },
    { key: "combined", label: "Combined", value: mpg.combined },
  ];
}

/** Recall and complaint counts only — MPG prints as figures, not this line. */
export function modelExtrasCountsLine(extras: ModelExtras): string {
  const bits: string[] = [];
  if (extras.recalls) {
    const n = extras.recalls.total;
    bits.push(
      `${n} NHTSA recall ${n === 1 ? "campaign" : "campaigns"} for this model year`,
    );
  }
  if (extras.complaints) {
    const n = extras.complaints.total;
    bits.push(
      `${n} owner ${n === 1 ? "complaint" : "complaints"} for this model year`,
    );
  }
  return bits.join(" · ");
}

/** One printed line for text-only surfaces — still names the model, not the VIN. */
export function modelExtrasSummaryLine(extras: ModelExtras): string {
  const bits: string[] = [];
  const counts = modelExtrasCountsLine(extras);
  if (counts) bits.push(counts);
  if (extras.mpg) {
    const fuel = extras.mpg.fuelType ? `, ${extras.mpg.fuelType}` : "";
    bits.push(
      `EPA ${extras.mpg.city} city / ${extras.mpg.highway} hwy / ${extras.mpg.combined} combined mpg${fuel}`,
    );
  }
  return bits.join(" · ");
}

const BADGE_LABELS: Record<RecallBadgeKey, string> = {
  parkIt: "Park it",
  parkOutSide: "Park outside",
  overTheAirUpdate: "Over-the-air update",
  takata: "Takata",
};

export function campaignBadges(campaign: ModelRecall): RecallBadge[] {
  const badges: RecallBadge[] = [];
  if (campaign.parkIt) badges.push({ key: "parkIt", label: BADGE_LABELS.parkIt });
  if (campaign.parkOutSide) {
    badges.push({ key: "parkOutSide", label: BADGE_LABELS.parkOutSide });
  }
  if (campaign.overTheAirUpdate) {
    badges.push({ key: "overTheAirUpdate", label: BADGE_LABELS.overTheAirUpdate });
  }
  if (campaign.takataNote) badges.push({ key: "takata", label: BADGE_LABELS.takata });
  return badges;
}

export function recallHeaderBadges(recalls: ModelRecalls): RecallBadge[] {
  const keys: RecallBadgeKey[] = [];
  if (recalls.parkIt) keys.push("parkIt");
  if (recalls.parkOutSide) keys.push("parkOutSide");
  if (recalls.overTheAirUpdate) keys.push("overTheAirUpdate");
  if (recalls.takata) keys.push("takata");
  return keys.map((key) => ({ key, label: BADGE_LABELS[key] }));
}

export function formatUsdEstimate(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  return `$${abs.toLocaleString("en-US")}`;
}

export function youSaveSpendCopy(amount: number): string {
  if (amount > 0) return `Save ${formatUsdEstimate(amount)} over 5 years`;
  if (amount < 0) return `Spend ${formatUsdEstimate(amount)} more over 5 years`;
  return "About average over 5 years";
}

export type SafetyFigure = {
  key: keyof ModelSafetyRatings;
  label: string;
  value: number;
};

export function safetyFigureRows(ratings: ModelSafetyRatings): SafetyFigure[] {
  const rows: SafetyFigure[] = [];
  if (ratings.overall !== undefined) {
    rows.push({ key: "overall", label: "Overall", value: ratings.overall });
  }
  if (ratings.front !== undefined) {
    rows.push({ key: "front", label: "Front", value: ratings.front });
  }
  if (ratings.side !== undefined) {
    rows.push({ key: "side", label: "Side", value: ratings.side });
  }
  if (ratings.rollover !== undefined) {
    rows.push({ key: "rollover", label: "Rollover", value: ratings.rollover });
  }
  if (ratings.sidePole !== undefined) {
    rows.push({ key: "sidePole", label: "Side pole", value: ratings.sidePole });
  }
  return rows;
}

export function safetyOverallFigure(
  ratings: ModelSafetyRatings,
): SafetyFigure | undefined {
  return safetyFigureRows(ratings).find((row) => row.key === "overall");
}

export function safetyCategoryRows(ratings: ModelSafetyRatings): SafetyFigure[] {
  return safetyFigureRows(ratings).filter((row) => row.key !== "overall");
}

/* -------------------------------------------------------------------------- */
/* Fetch + cache                                                              */
/* -------------------------------------------------------------------------- */

function remember(key: string, value: unknown, ttlMs: number): void {
  if (memory.size >= CACHE_LIMIT) {
    const oldest = memory.keys().next();
    if (!oldest.done) memory.delete(oldest.value);
  }
  memory.set(key, { expires: Date.now() + ttlMs, value });
}

function recalled<T>(key: string): T | undefined {
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) {
    memory.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function isFresh(fetchedAt: string, ttlMs = CACHE_TTL_MS): boolean {
  const then = Date.parse(fetchedAt);
  if (!Number.isFinite(then)) return false;
  return Date.now() - then < ttlMs;
}

async function cachedSlice<T>(
  key: string,
  store: ModelExtrasCache | undefined,
  load: () => Promise<T | null>,
): Promise<T | null> {
  const hit = recalled<T | null>(key);
  if (hit !== undefined) return hit;

  if (store) {
    try {
      const stored = await store.getModelExtras(key);
      if (stored && isFresh(stored.fetchedAt)) {
        const value = stored.payload as T | null;
        remember(key, value, CACHE_TTL_MS);
        return value;
      }
    } catch {
      /* Persist is a shortcut, not a requirement. */
    }
  }

  const value = await load();
  if (value == null) {
    remember(key, null, NEGATIVE_TTL_MS);
    return null;
  }

  remember(key, value, CACHE_TTL_MS);
  if (store) {
    try {
      await store.saveModelExtras({
        cacheKey: key,
        payload: value,
        fetchedAt: new Date().toISOString(),
      });
    } catch {
      /* Same: a write failure must not hide a good fetch. */
    }
  }
  return value;
}

type JsonAttempt =
  | { kind: "ok"; value: unknown }
  | { kind: "fail"; retryable: boolean };

async function getJsonOnce(url: string): Promise<JsonAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return { kind: "fail", retryable: isRetryableHttpStatus(response.status) };
    }
    try {
      return { kind: "ok", value: await response.json() };
    } catch {
      return { kind: "fail", retryable: true };
    }
  } catch {
    return { kind: "fail", retryable: true };
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson(url: string): Promise<unknown | null> {
  for (let attempt = 1; attempt <= MODEL_EXTRAS_FETCH_ATTEMPTS; attempt++) {
    const result = await getJsonOnce(url);
    if (result.kind === "ok") return result.value;
    if (!result.retryable || attempt === MODEL_EXTRAS_FETCH_ATTEMPTS) {
      if (attempt > 1) {
        console.warn(
          `[extras] public API failed after ${attempt} attempt(s)`,
        );
      }
      return null;
    }
    console.warn(
      `[extras] public API retry ${attempt}/${MODEL_EXTRAS_FETCH_ATTEMPTS}`,
    );
    await sleepRetryBackoff(attempt);
  }
  return null;
}

/**
 * Browser call to the paid extras endpoint. Retries our own route on
 * network errors and 5xx; a clean "unavailable" is final — the server
 * already retried the government APIs.
 */
export async function requestPaidModelExtras(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelExtras | null> {
  for (let attempt = 1; attempt <= MODEL_EXTRAS_FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl("/api/model-extras", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (
        isRetryableHttpStatus(response.status) &&
        attempt < MODEL_EXTRAS_FETCH_ATTEMPTS
      ) {
        console.warn(
          `[extras] paid extras request retry ${attempt}/${MODEL_EXTRAS_FETCH_ATTEMPTS}`,
        );
        await sleepRetryBackoff(attempt);
        continue;
      }
      let payload: { status?: string; extras?: ModelExtras };
      try {
        payload = (await response.json()) as {
          status?: string;
          extras?: ModelExtras;
        };
      } catch {
        if (attempt < MODEL_EXTRAS_FETCH_ATTEMPTS) {
          await sleepRetryBackoff(attempt);
          continue;
        }
        return null;
      }
      if (payload.status === "ready" && hasModelExtras(payload.extras)) {
        return payload.extras;
      }
      return null;
    } catch {
      if (attempt < MODEL_EXTRAS_FETCH_ATTEMPTS) {
        console.warn(
          `[extras] paid extras request retry ${attempt}/${MODEL_EXTRAS_FETCH_ATTEMPTS}`,
        );
        await sleepRetryBackoff(attempt);
        continue;
      }
      console.warn(
        `[extras] paid extras request failed after ${MODEL_EXTRAS_FETCH_ATTEMPTS} attempt(s)`,
      );
      return null;
    }
  }
  return null;
}

function nhtsaQuery(ymm: Ymm): string {
  const params = new URLSearchParams({
    make: ymm.make,
    model: ymm.model,
    modelYear: ymm.year,
  });
  return params.toString();
}

async function firstMatchingSlice<T>(
  ymm: Ymm,
  load: (candidate: Ymm) => Promise<T | null>,
  models: string[] = nhtsaModelCandidates(ymm.model),
): Promise<T | null> {
  for (const model of models) {
    const parsed = await load({ ...ymm, model });
    if (parsed) return parsed;
  }
  return null;
}

async function loadRecalls(ymm: Ymm): Promise<ModelRecalls | null> {
  return firstMatchingSlice(ymm, async (candidate) => {
    const payload = await getJson(`${RECALLS_URL}?${nhtsaQuery(candidate)}`);
    return payload ? parseRecallsPayload(payload) : null;
  });
}

async function loadComplaints(ymm: Ymm): Promise<ModelComplaints | null> {
  return firstMatchingSlice(ymm, async (candidate) => {
    const payload = await getJson(`${COMPLAINTS_URL}?${nhtsaQuery(candidate)}`);
    return payload ? parseComplaintsPayload(payload) : null;
  });
}

async function loadEpaVehiclesFor(ymm: Ymm): Promise<EpaVehicleMpg[] | null> {
  const optionsPayload = await getJson(
    `${EPA_OPTIONS_URL}?${new URLSearchParams({
      year: ymm.year,
      make: ymm.make,
      model: ymm.model,
    }).toString()}`,
  );
  if (!optionsPayload) return null;
  const options = parseEpaOptions(optionsPayload);
  if (options.length === 0) return [];

  // Every option for this YMM is cached together so a 2.5L order and a 3.5L
  // order share one EPA round-trip. The engine hint is applied later.
  const slice = options.slice(0, MAX_EPA_VEHICLES);
  const vehicles = (
    await Promise.all(
      slice.map(async (option) => {
        const payload = await getJson(`${EPA_VEHICLE_URL}/${encodeURIComponent(option.id)}`);
        return payload ? parseEpaVehicle(payload, option.id) : null;
      }),
    )
  ).filter((row): row is EpaVehicleMpg => Boolean(row));

  // Options existed but every vehicle fetch failed — do not cache that as
  // "no MPG for this model" for a week.
  if (vehicles.length === 0 && options.length > 0) return null;
  return vehicles;
}

async function loadEpaVehicles(ymm: Ymm): Promise<EpaVehicleMpg[] | null> {
  let sawEmptyMenu = false;
  for (const model of epaSafetyModelCandidates(ymm.make, ymm.model)) {
    const vehicles = await loadEpaVehiclesFor({ ...ymm, model });
    if (vehicles && vehicles.length > 0) return vehicles;
    if (vehicles) sawEmptyMenu = true;
  }
  return sawEmptyMenu ? [] : null;
}

function safetyVariantsUrl(ymm: Ymm): string {
  const year = encodeURIComponent(ymm.year);
  const make = encodeURIComponent(ymm.make);
  const model = encodeURIComponent(ymm.model);
  return `${SAFETY_VARIANTS_URL}/${year}/make/${make}/model/${model}`;
}

async function loadSafetyRatingsFor(ymm: Ymm): Promise<ModelSafetyRatings | null> {
  const variantsPayload = await getJson(safetyVariantsUrl(ymm));
  if (!variantsPayload) return null;
  const variants = parseSafetyVariants(variantsPayload).slice(0, MAX_SAFETY_VARIANTS);
  if (variants.length === 0) return null;

  const ratings = (
    await Promise.all(
      variants.map(async (variant) => {
        const payload = await getJson(
          `${SAFETY_VEHICLE_URL}/${encodeURIComponent(variant.id)}`,
        );
        return payload ? parseSafetyRatings(payload) : null;
      }),
    )
  ).filter((row): row is ModelSafetyRatings => Boolean(row));

  if (ratings.length === 0) return null;
  return pickSafetyRatings(ratings) ?? null;
}

async function loadSafetyRatings(ymm: Ymm): Promise<ModelSafetyRatings | null> {
  return firstMatchingSlice(
    ymm,
    (candidate) => loadSafetyRatingsFor(candidate),
    epaSafetyModelCandidates(ymm.make, ymm.model),
  );
}

function epaSlices(
  vehicles: EpaVehicleMpg[] | null,
  hint: string,
): {
  mpg?: ModelMpg;
  ownership?: ModelOwnership;
  ev?: ModelEv;
} {
  if (!vehicles) return {};
  const mpg = pickMpg(vehicles, hint);
  return {
    mpg,
    ownership: pickOwnership(vehicles, hint),
    ev: pickEv(vehicles, hint, mpg),
  };
}

async function peekSlice<T>(
  key: string,
  store: ModelExtrasCache | undefined,
): Promise<T | null | undefined> {
  const hit = recalled<T | null>(key);
  if (hit !== undefined) return hit;
  if (!store) return undefined;
  try {
    const stored = await store.getModelExtras(key);
    if (stored && isFresh(stored.fetchedAt)) {
      remember(key, stored.payload, CACHE_TTL_MS);
      return stored.payload as T | null;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Assembles extras from the YMM cache only — no outbound calls.
 *
 * Used when rendering a paid report so a second view of the same Camry can
 * paint the card with the first view's fetch. A miss leaves the client to ask.
 */
export async function cachedExtrasForReport(
  report: VehicleReport,
  store?: ModelExtrasCache,
): Promise<ModelExtras | null> {
  const ymm = ymmFromVehicle(report.vehicle);
  if (!ymm) return null;
  const hint = engineDisplacementHint(report.vehicle, report.specifications);
  const base = `${EXTRAS_CACHE_VERSION}|${ymmCacheKey(ymm.year, ymm.make, ymm.model)}`;

  const [recalls, complaints, vehicles, safetyRatings] = await Promise.all([
    peekSlice<ModelRecalls>(`${base}|recalls`, store),
    peekSlice<ModelComplaints>(`${base}|complaints`, store),
    peekSlice<EpaVehicleMpg[]>(`${base}|epa`, store),
    peekSlice<ModelSafetyRatings>(`${base}|safety`, store),
  ]);

  if (
    recalls === undefined ||
    complaints === undefined ||
    vehicles === undefined ||
    safetyRatings === undefined
  ) {
    return null;
  }

  return composeModelExtras(ymm, {
    recalls,
    complaints,
    safetyRatings,
    ...epaSlices(vehicles, hint),
  });
}

/**
 * Pulls the public slices for one report's year/make/model.
 *
 * Never throws. Each public API is retried on transient failure. A missing
 * YMM, a still-down API or an ambiguous MPG match all resolve to `null` or
 * a partial extras object — the report page hides what it does not have,
 * including the whole model zone when every slice is empty.
 */
export async function extrasForReport(
  report: VehicleReport,
  store?: ModelExtrasCache,
): Promise<ModelExtras | null> {
  const ymm = ymmFromVehicle(report.vehicle);
  if (!ymm) return null;

  const hint = engineDisplacementHint(report.vehicle, report.specifications);
  const base = `${EXTRAS_CACHE_VERSION}|${ymmCacheKey(ymm.year, ymm.make, ymm.model)}`;

  const [recalls, complaints, vehicles, safetyRatings] = await Promise.all([
    cachedSlice<ModelRecalls>(`${base}|recalls`, store, () => loadRecalls(ymm)),
    cachedSlice<ModelComplaints>(`${base}|complaints`, store, () => loadComplaints(ymm)),
    cachedSlice<EpaVehicleMpg[]>(`${base}|epa`, store, () => loadEpaVehicles(ymm)),
    cachedSlice<ModelSafetyRatings>(`${base}|safety`, store, () => loadSafetyRatings(ymm)),
  ]);

  return composeModelExtras(ymm, {
    recalls,
    complaints,
    safetyRatings,
    ...epaSlices(vehicles, hint),
  });
}
