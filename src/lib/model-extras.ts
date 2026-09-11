/**
 * Public, model-level extras shown after VIN history, in a fenced model-only zone.
 *
 * NHTSA recalls, NHTSA owner complaints, and EPA fuel economy for the
 * report's year/make/model — never for this VIN. A buyer who skims must not
 * mistake a 2012 Camry complaint theme for something on the car in front of
 * them, so every surface that prints this data names the YMM and says it is
 * not this VIN.
 *
 * All three sources are free public APIs. Each outbound call is tried up to
 * three times with a short backoff on network errors, timeouts, 429 and 5xx.
 * After retries, missing data, a downed API or an ambiguous EPA match hides
 * that slice — and if nothing useful remains, the whole model zone is omitted.
 * The paid VIN history is unchanged.
 * Results are cached by YMM (and, for MPG, an engine hint) so two orders for
 * the same Camry do not re-hit the government on every page view.
 */
import { exactYearMakeModel } from "@/lib/ai-brief";
import { cleanCustomerLine } from "@/lib/customer-text";
import { formatEventDate, isoDate, type Field, type VehicleReport, type VehicleSummary } from "@/lib/report";

const RECALLS_URL = "https://api.nhtsa.gov/recalls/recallsByVehicle";
const COMPLAINTS_URL = "https://api.nhtsa.gov/complaints/complaintsByVehicle";
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

/** Bump when the stored extras shape changes so a theme-only cache cannot stick. */
const EXTRAS_CACHE_VERSION = "v3";

export type ModelRecall = {
  campaign: string;
  title: string;
  consequence?: string;
  remedy?: string;
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

export type ModelRecalls = {
  total: number;
  campaigns: ModelRecall[];
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
 * The 2016 Mini Clubman Cooper is the case that surfaced this: VinAudit / the
 * heading say "Clubman Cooper", vPIC Series is Cooper, and NHTSA recalls
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

export function hasModelExtras(extras: ModelExtras | null | undefined): extras is ModelExtras {
  if (!extras) return false;
  return Boolean(extras.recalls || extras.complaints || extras.mpg);
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
  return false;
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
    campaigns.push({
      campaign,
      title,
      ...(consequence ? { consequence } : {}),
      ...(remedy ? { remedy } : {}),
    });
    if (campaigns.length >= MAX_CAMPAIGNS) break;
  }

  if (total === 0 && campaigns.length === 0) return null;
  return { total: total || campaigns.length, campaigns };
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
  return {
    id,
    city,
    highway,
    combined,
    fuelType,
    ...(displacement ? { displacement } : {}),
  };
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

export function pickMpg(vehicles: EpaVehicleMpg[], hint: string): ModelMpg | undefined {
  if (vehicles.length === 0) return undefined;

  let pool = vehicles;
  if (hint) {
    const needle = trimDisplacement(hint);
    const matched = vehicles.filter(
      (vehicle) =>
        vehicle.displacement === needle ||
        (vehicle.displacement !== undefined &&
          trimDisplacement(vehicle.displacement) === needle),
    );
    if (matched.length === 0) return undefined;
    pool = matched;
  }

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

export function composeModelExtras(
  ymm: Ymm,
  slices: {
    recalls?: ModelRecalls | null;
    complaints?: ModelComplaints | null;
    mpg?: ModelMpg | null;
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
  return hasModelExtras(extras) ? extras : null;
}

/** Theme-only cache leftovers still render; a missing field is an empty list. */
export function complaintSamples(
  complaints: ModelComplaints | null | undefined,
): ModelComplaintSample[] {
  return complaints?.samples ?? [];
}

/** One printed line for the PDF — still names the model, not the VIN. */
export function modelExtrasSummaryLine(extras: ModelExtras): string {
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
  if (extras.mpg) {
    const fuel = extras.mpg.fuelType ? `, ${extras.mpg.fuelType}` : "";
    bits.push(
      `EPA ${extras.mpg.city} city / ${extras.mpg.highway} hwy / ${extras.mpg.combined} combined mpg${fuel}`,
    );
  }
  return bits.join(" · ");
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
): Promise<T | null> {
  for (const model of nhtsaModelCandidates(ymm.model)) {
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
  for (const model of nhtsaModelCandidates(ymm.model)) {
    const vehicles = await loadEpaVehiclesFor({ ...ymm, model });
    if (vehicles && vehicles.length > 0) return vehicles;
    if (vehicles) sawEmptyMenu = true;
  }
  return sawEmptyMenu ? [] : null;
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

  const [recalls, complaints, vehicles] = await Promise.all([
    peekSlice<ModelRecalls>(`${base}|recalls`, store),
    peekSlice<ModelComplaints>(`${base}|complaints`, store),
    peekSlice<EpaVehicleMpg[]>(`${base}|epa`, store),
  ]);

  if (recalls === undefined || complaints === undefined || vehicles === undefined) {
    return null;
  }

  return composeModelExtras(ymm, {
    recalls,
    complaints,
    mpg: vehicles ? pickMpg(vehicles, hint) : undefined,
  });
}

/**
 * Pulls the three public slices for one report's year/make/model.
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

  const [recalls, complaints, vehicles] = await Promise.all([
    cachedSlice<ModelRecalls>(`${base}|recalls`, store, () => loadRecalls(ymm)),
    cachedSlice<ModelComplaints>(`${base}|complaints`, store, () => loadComplaints(ymm)),
    cachedSlice<EpaVehicleMpg[]>(`${base}|epa`, store, () => loadEpaVehicles(ymm)),
  ]);

  return composeModelExtras(ymm, {
    recalls,
    complaints,
    mpg: vehicles ? pickMpg(vehicles, hint) : undefined,
  });
}
