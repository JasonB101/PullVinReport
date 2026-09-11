import {
  colorFieldValues,
  isPaintColorLabel,
  PAINT_COLOR_LABEL,
  pickColor,
} from "@/lib/vehicle-color";
import {
  MODEL_ZONE_NAV,
  SPEC_GROUP_BODY,
  SPEC_GROUP_FEATURES,
  SPEC_GROUP_MORE,
  SPEC_GROUP_POWERTRAIN,
} from "@/lib/report-zones";

/**
 * The normalized report model that every renderer in the app consumes.
 *
 * Both the paid VinAudit response and the labelled sample are converted into
 * this shape, so the sample can never accidentally be presented differently
 * from a real report — and a real report can never be silently replaced by the
 * sample, because `source` travels with the data.
 */

export type ReportSource = "vinaudit" | "sample";

export type Field = {
  label: string;
  value: string;
};

export type CheckStatus = "clear" | "found" | "unavailable";

export type ReportCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  count: number;
  detail: string;
};

export type ReportSection = {
  key: string;
  title: string;
  description: string;
  /** Each entry is one event/record. */
  records: Field[][];
  emptyLabel: string;
  /**
   * Preferred column labels, most important first. When enough of them are
   * present the section renders as a timeline table instead of a stack of
   * labelled cards; anything left over is shown beneath its row.
   */
  columns?: string[];
  /**
   * Fields every record carried with the same value, lifted out of the records
   * so the constant is stated once for the section instead of on every row.
   */
  shared?: Field[];
  /** Short label for the jump nav. Falls back to the section title. */
  navLabel?: string;
  /**
   * How the records want to be read.
   *
   * `records` is the default: events that share a shape, laid out against
   * columns. `listings` is for records with a long tail — a sales listing
   * carries a dealer, a stock number, colours, options and a description
   * behind the four facts anyone actually scans — where a table row plus a
   * paragraph of leftovers is worse than no table at all.
   */
  layout?: "records" | "listings";
};

export type OdometerReading = {
  date: string;
  value: number;
  unit: string;
  source: string;
};

export type VehicleSummary = {
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  bodyStyle?: string;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  fuelType?: string;
  madeIn?: string;
};

export type VehicleReport = {
  vin: string;
  source: ReportSource;
  /** True only for the marketing sample. Never true for a purchased report. */
  isSample: boolean;
  generatedAt: string;
  vehicle: VehicleSummary;
  headline: string;
  specifications: Field[];
  checks: ReportCheck[];
  sections: ReportSection[];
  odometer: OdometerReading[];
  providerReportUrl?: string;
  /** Raw provider payload, kept for support and dispute handling. */
  raw?: unknown;
};

export function vehicleTitle(vehicle: VehicleSummary): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length > 0 ? parts.join(" ") : "Vehicle";
}

export function countFound(checks: ReportCheck[]): number {
  return checks.filter((check) => check.status === "found").length;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Reduces the date formats records arrive in to one sortable `YYYY-MM-DD`.
 * Returns an empty string for anything it does not recognise, so callers can
 * tell "no usable date" apart from a date that happens to sort first.
 */
export function isoDate(value: string): string {
  const text = value.trim();
  const dashed = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (dashed) return `${dashed[1]}-${dashed[2]}-${dashed[3]}`;
  const packed = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (packed) return `${packed[1]}-${packed[2]}-${packed[3]}`;
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (slashed) {
    return `${slashed[3]}-${slashed[1].padStart(2, "0")}-${slashed[2].padStart(2, "0")}`;
  }
  return "";
}

/** `2024-09-27` and `20240927` become `Sep 27, 2024`; anything else is left alone. */
export function formatEventDate(value: string): string {
  const iso = isoDate(value);
  if (!iso) return value.trim();
  const [year, month, day] = iso.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
}

const GENERATED_ZONE = "America/Denver";

/**
 * When this report was built, in Mountain Time.
 *
 * The business reads reports in Denver. UTC on the card looked like a
 * timestamp from another planet; MST/MDT says which clock it is.
 */
export function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: GENERATED_ZONE,
    timeZoneName: "short",
  }).format(date);
}

/** One record laid out against a section's columns. */
export type TableRow = {
  /** Same length and order as the resolved column list. Empty means no value. */
  cells: string[];
  /** Fields that do not belong to a column, shown beneath the row. */
  extras: Field[];
  /** True when this row's mileage matches the older row beneath it. */
  mileageUnchanged?: boolean;
};

export type SectionTable = {
  columns: string[];
  rows: TableRow[];
};

/** Below this a table reads worse than the cards it replaces. */
const MIN_TABLE_COLUMNS = 2;

/** Above this a column is a paragraph wearing a cell, and the row stops scanning. */
const MAX_COLUMN_VALUE = 28;

/** How many columns a derived table may reach before it is a dump again. */
const MAX_DERIVED_COLUMNS = 4;

/** How much of a record with no table to hang off is worth stating up front. */
export const LEAD_FIELDS = 4;

function hasValue(section: ReportSection, label: string): boolean {
  return section.records.some((record) =>
    record.some((field) => field.label === label && field.value.length > 0),
  );
}

/**
 * Columns worked out from the records themselves.
 *
 * Only used when a section's declared columns do not describe what actually
 * came back — the NMVTIS junk and salvage feed, for instance, answers with a
 * disposition and a report id that no hand-written column list anticipated.
 * Left alone, that section fell through to a card per record listing every
 * field it held, which is the field dump this whole pass exists to remove.
 *
 * A label qualifies only if every record carries it and no value is long
 * enough to turn the row into prose. Order follows the records, so the table
 * reads in the order the feed thought the fields belonged in.
 */
function derivedColumns(section: ReportSection): string[] {
  const [first, ...rest] = section.records;
  return first
    .filter(
      (candidate) =>
        candidate.value.length > 0 &&
        candidate.value.length <= MAX_COLUMN_VALUE &&
        rest.every((record) =>
          record.some(
            (field) =>
              field.label === candidate.label &&
              field.value.length > 0 &&
              field.value.length <= MAX_COLUMN_VALUE,
          ),
        ),
    )
    .map((field) => field.label)
    .slice(0, MAX_DERIVED_COLUMNS);
}

/**
 * Lays a section out as a table.
 *
 * The declared columns come first: they are the fields someone decided were
 * worth scanning, in the order they read. When too few of them came back the
 * records are asked what they hold instead, because a table of the wrong
 * columns still beats a card per record with every field on it.
 *
 * Columns the provider never filled in are dropped rather than rendered as a
 * wall of dashes. Whatever is left over travels with its row as `extras` — the
 * renderers put it behind a disclosure rather than under the row, so a title
 * number and a claim code stop competing with the date and the mileage.
 */
export function sectionTable(section: ReportSection): SectionTable | null {
  if (section.records.length === 0) return null;
  // A section that asked for cards does not get tabulated by a renderer that
  // forgot to check. Refusing here keeps that decision in one place.
  if (section.layout === "listings") return null;

  const declared = (section.columns ?? []).filter((column) =>
    hasValue(section, column),
  );
  const columns =
    declared.length >= MIN_TABLE_COLUMNS ? declared : derivedColumns(section);
  if (columns.length < MIN_TABLE_COLUMNS) return null;

  const mileageIndex = columns.indexOf("Mileage");
  const rows = section.records.map((record, index) => {
    const cells = columns.map(
      (column) => record.find((field) => field.label === column)?.value ?? "",
    );
    const older = section.records[index + 1];
    const olderMileage =
      mileageIndex >= 0
        ? (older?.find((field) => field.label === "Mileage")?.value ?? "")
        : "";
    return {
      cells,
      extras: record.filter(
        (field) => !columns.includes(field.label) && field.value.length > 0,
      ),
      mileageUnchanged:
        mileageIndex >= 0 &&
        cells[mileageIndex].length > 0 &&
        cells[mileageIndex] === olderMileage,
    };
  });

  return { columns, rows };
}

/** Columns a stacked (phone) row already states as headline, date, or meta. */
const STACKED_STATED = new Set(["Event", "Date", "State", "Mileage", "Brand", "Current"]);

const STACKED_HEADLINE = ["Event", "Brand", "Type", "Severity", "Disposition"];

/**
 * One table row, reshaped for a phone card.
 *
 * The wide title table cuts Event / Current / brand off-screen at ~390px
 * with no scrollbar hint. Below `sm` the renderer stacks instead: the event
 * as the headline, the date beneath it, State · Mileage as one muted line,
 * and brand / current always on the card.
 */
export type StackedRecordRow = {
  headline: string;
  date: string;
  meta: string;
  brand: string;
  current: string;
  rest: Field[];
  extras: Field[];
  mileageUnchanged: boolean;
};

export function stackedRecordRow(table: SectionTable, row: TableRow): StackedRecordRow {
  const valueOf = (label: string): string => {
    const index = table.columns.indexOf(label);
    return index >= 0 ? row.cells[index] : "";
  };

  const event = valueOf("Event");
  const brand = valueOf("Brand");
  const date = valueOf("Date");
  const headline =
    event ||
    STACKED_HEADLINE.map(valueOf).find((value) => value.length > 0) ||
    date ||
    "Record";
  const mileage = valueOf("Mileage");
  const mileageText =
    row.mileageUnchanged && mileage.length > 0 ? `${mileage} unchanged` : mileage;
  const meta = [valueOf("State"), mileageText].filter(Boolean).join(" · ");
  const rest = table.columns
    .map((label, index) => ({ label, value: row.cells[index] }))
    .filter((field) => field.value.length > 0 && !STACKED_STATED.has(field.label));

  return {
    headline,
    date: headline === date ? "" : date,
    meta,
    brand: brand && brand !== headline ? brand : "",
    current: valueOf("Current"),
    rest,
    extras: row.extras,
    mileageUnchanged: Boolean(row.mileageUnchanged),
  };
}

/* -------------------------------------------------------------------------- */
/* Listings                                                                     */
/* -------------------------------------------------------------------------- */

export type Listing = {
  /** What kind of listing this was, in the feed's own words. */
  headline: string;
  /** When it was listed or sold. Empty when the feed gave no date. */
  date: string;
  /** Asking or sale price. Empty when the feed gave none. */
  price: string;
  /** The two or three facts worth reading before deciding to open it. */
  summary: Field[];
  /** Everything else the feed sent, shown only when it is asked for. */
  detail: Field[];
};

/** Buyer-facing note on every sales section: snapshots, not confirmed sales. */
export const LISTING_SECTION_NOTE =
  "These are marketplace listing snapshots, not confirmed sales. The same dealer group often posts one car across sister lots and aggregator sites, so many rows can be one chapter of asking prices rather than many sales.";

/** Where a listing's one-line headline comes from, best first. */
const HEADLINE_LABELS = [
  "Listing type",
  "Sale type",
  "Type",
  "Channel",
  "Source",
  "Seller type",
];

/** The facts that stay on the front of the card, in the order they read. */
const SUMMARY_LABELS = ["Mileage", "Location", "Seller", "Seller type"];

const DATE_LABELS = ["Date", "Listing date", "Sale date"];
const PRICE_LABELS = ["Price", "Sale price", "Listing price", "Asking price"];
const SELLER_LABELS = [
  "Seller",
  "Seller name",
  "Sellername",
  "Dealer name",
  "Dealer",
];

/** How many facts fit on the front of a card before it is a table again. */
const MAX_SUMMARY_FACTS = 3;

function take(fields: Field[], labels: string[]): Field | undefined {
  for (const label of labels) {
    const index = fields.findIndex((field) => field.label === label);
    if (index !== -1) return fields.splice(index, 1)[0];
  }
  return undefined;
}

/**
 * Folds a city and a state into the one thing a reader wanted from them.
 *
 * Two columns holding `Nashville` and `TN` are one fact written twice as far
 * apart as it needs to be.
 */
function foldLocation(fields: Field[]): void {
  const city = take(fields, ["City"]);
  const state = take(fields, ["State"]);
  const parts = [city?.value, state?.value].filter(
    (part): part is string => Boolean(part),
  );
  if (parts.length > 0) fields.push({ label: "Location", value: parts.join(", ") });
}

/**
 * Turns a listing record into a card: a headline, the few facts worth scanning,
 * and everything else behind them.
 *
 * A sales feed is the widest thing in a report — dealer name, stock number,
 * colours, options, a paragraph of ad copy — and rendering all of it at once
 * buries the four things a buyer is actually comparing between listings. None
 * of it is dropped; it just stops competing with the price.
 */
export function sectionListings(section: ReportSection): Listing[] {
  const records = preferResolvedDisposition(section.records, {
    requireAuctionChannel: true,
  });
  return records.map((record) => {
    const fields = record.map((field) => ({ ...field }));
    foldLocation(fields);

    const date = take(fields, DATE_LABELS);
    const price = take(fields, PRICE_LABELS);
    const headline = take(fields, HEADLINE_LABELS);

    const summary: Field[] = [];
    for (const label of SUMMARY_LABELS) {
      if (summary.length === MAX_SUMMARY_FACTS) break;
      const field =
        label === "Seller" ? take(fields, SELLER_LABELS) : take(fields, [label]);
      if (field) {
        summary.push(label === "Seller" ? { label: "Seller", value: field.value } : field);
      }
    }

    return {
      // Verbatim from the record when the feed said what kind of listing it
      // was. "Listing" only when it did not — never a guess dressed as a fact.
      headline: headline?.value ?? "Listing",
      date: date?.value ?? "",
      price: price?.value ?? "",
      summary,
      detail: fields,
    };
  });
}

/**
 * One chapter of marketplace snapshots, not a confirmed sale.
 *
 * A feed often scrapes the same inventory once per sister rooftop and
 * aggregator, at drifting asking totals. Folding those rows into a timeline
 * chapter is what stops forty cards from reading as forty sales — or as one
 * person selling the car at every store in the group.
 */
export type ListingGroup = {
  /** Dealer group, marketplace or auction label for the chapter. */
  identity: string;
  /** Same as identity — the parent card title. */
  headline: string;
  /** Asking total, or a min–max range when the snapshots disagree. */
  price: string;
  /** Date, or a from–to range covering the snapshots. */
  date: string;
  /** City and state, or the state/region when the rooftops spread out. */
  location: string;
  /** Mileage, or a min–max range when the snapshots disagree. */
  mileage: string;
  listings: Listing[];
};

export function listingFieldValue(listing: Listing, labels: string[]): string {
  for (const label of labels) {
    const match =
      listing.summary.find((field) => field.label === label) ??
      listing.detail.find((field) => field.label === label);
    if (match?.value) return match.value;
  }
  return "";
}

function listingLocation(listing: Listing): string {
  return listingFieldValue(listing, ["Location"]);
}

export function listingSeller(listing: Listing): string {
  return listingFieldValue(listing, SELLER_LABELS);
}

function listingMileage(listing: Listing): string {
  return listingFieldValue(listing, ["Mileage"]);
}

/** Cents of a listed price, so `$11,450` and `$11,450.00` compare equal. */
function listingPriceCents(price: string): number {
  const cleaned = price.replace(/[^\d.]/g, "");
  if (!cleaned) return 0;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function listingSortValue(date: string): number {
  const iso = isoDate(date);
  if (iso) return Date.parse(`${iso}T00:00:00Z`);
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? parsed : 0;
}

function listingIso(date: string): string {
  const direct = isoDate(date);
  if (direct) return direct;
  const ms = listingSortValue(date);
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

function parseLocation(value: string): { city: string; state: string } {
  const match = /^(.+),\s*([A-Za-z]{2})$/.exec(value.trim());
  if (match) return { city: match[1].trim(), state: match[2].toUpperCase() };
  const upper = value.trim().toUpperCase();
  if (STATE_NAMES[upper]) return { city: "", state: upper };
  const named = Object.entries(STATE_NAMES).find(([, name]) => name.toLowerCase() === value.trim().toLowerCase());
  if (named) return { city: "", state: named[0] };
  return { city: value.trim(), state: "" };
}

const VEHICLE_BRANDS = new Set([
  "acura", "alfa", "audi", "bmw", "buick", "cadillac", "chevrolet", "chevy",
  "chrysler", "dodge", "fiat", "ford", "genesis", "gmc", "honda", "hyundai",
  "infiniti", "jaguar", "jeep", "kia", "lexus", "lincoln", "mazda", "mercedes",
  "benz", "mini", "mitsubishi", "nissan", "porsche", "ram", "subaru", "tesla",
  "toyota", "volkswagen", "volvo", "vw",
]);

const NAME_STOP = new Set([
  "and", "at", "auto", "autos", "automotive", "car", "cars", "center", "centre",
  "dealer", "dealership", "group", "inc", "llc", "ltd", "motor", "motors", "of",
  "sales", "store", "superstore", "the",
]);

const MARKETPLACE_MARKERS = [
  "autotrader", "cargurus", "car gurus", "cars.com", "carsdirect", "carsoup",
  "carfax", "craigslist", "cycletrader", "ebay", "edmunds", "express.cars",
  "express cars", "facebook", "marketplace", "offerup", "truecar",
];

function tokenizeName(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2)
    .filter((token) => !VEHICLE_BRANDS.has(token) && !NAME_STOP.has(token));
}

function isMarketplace(listing: Listing): boolean {
  const hay = [
    listing.headline,
    listingSeller(listing),
    listingFieldValue(listing, ["Source", "Listing type", "Channel"]),
  ]
    .join(" ")
    .toLowerCase();
  return MARKETPLACE_MARKERS.some((marker) => hay.includes(marker));
}

function dealerGroupKey(listing: Listing): string {
  if (isMarketplace(listing)) return "";
  const city = parseLocation(listingLocation(listing)).city.toLowerCase();
  const tokens = tokenizeName(listingSeller(listing))
    .filter((token) => token !== city && token.length >= 4)
    .sort();
  if (tokens.length > 0) return tokens.join(" ");
  return listingSeller(listing).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function groupsCompatible(left: string, right: string): boolean {
  if (!left || !right) return false;
  const a = left.split(" ");
  const b = right.split(" ");
  if (a.every((token) => b.includes(token)) || b.every((token) => a.includes(token))) {
    return true;
  }
  // Sister rooftops often share a family name and differ on the first name
  // (Blaise Alexander vs Aubrey Alexander). A shared token of 5+ letters is
  // the group; short leftovers like "city" are not.
  return a.some((token) => token.length >= 5 && b.includes(token));
}

function dominantGroupKey(listings: Listing[]): string {
  const keys = listings.map(dealerGroupKey).filter((key) => key.length > 0);
  if (keys.length === 0) return "";
  let best = keys[0];
  let bestCount = 0;
  for (const key of keys) {
    const count = keys.filter((other) => groupsCompatible(key, other)).length;
    if (count > bestCount || (count === bestCount && key.length > best.length)) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function dominantState(listings: Listing[]): string {
  const counts = new Map<string, number>();
  for (const listing of listings) {
    const state = parseLocation(listingLocation(listing)).state;
    if (!state) continue;
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [state, count] of counts) {
    if (count > bestCount) {
      best = state;
      bestCount = count;
    }
  }
  return best;
}

function titleName(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function displayDealerName(name: string, city: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const compact = words[index].toLowerCase().replace(/[^a-z0-9]/g, "");
    if (VEHICLE_BRANDS.has(compact)) continue;
    if (["inc", "llc", "ltd", "group"].includes(compact)) continue;
    if (compact === "of" && words[index + 1]?.toLowerCase() === city.toLowerCase()) {
      index += 1;
      continue;
    }
    if (city && compact === city.toLowerCase()) continue;
    kept.push(words[index]);
  }
  return kept.join(" ").trim() || name;
}

function episodeIdentity(listings: Listing[]): string {
  const dealers = listings.filter((listing) => !isMarketplace(listing) && listingSeller(listing));
  if (dealers.length === 0) {
    const named = listings.find((listing) => listingSeller(listing) || listing.headline);
    return listingSeller(named ?? listings[0]) || listings[0]?.headline || "Listing snapshots";
  }

  const city = parseLocation(listingLocation(dealers[0])).city;
  const names = dealers.map((listing) => displayDealerName(listingSeller(listing), city));
  const unique = [...new Set(names.map((name) => name.toLowerCase()))];
  if (unique.length === 1) return names[0];

  const freq = new Map<string, number>();
  for (const listing of dealers) {
    for (const token of new Set(tokenizeName(listingSeller(listing)))) {
      if (token.length < 4) continue;
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }
  const shared = [...freq.entries()]
    .filter(([, count]) => count >= Math.ceil(dealers.length / 2))
    .map(([token]) => token);
  const exemplar = names.find((name) =>
    shared.every((token) => name.toLowerCase().includes(token)),
  ) ?? names[0];
  const ordered = tokenizeName(exemplar).filter((token) => shared.includes(token));
  if (ordered.length > 0) return `${titleName(ordered.join(" "))} network`;
  return `${names[0]} network`;
}

function formatCents(cents: number): string {
  const amount = cents / 100;
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function episodePrice(listings: Listing[]): string {
  const amounts = listings.map((listing) => listingPriceCents(listing.price)).filter((cents) => cents > 0);
  if (amounts.length === 0) return "";
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return min === max ? formatCents(min) : `${formatCents(min)}–${formatCents(max)}`;
}

function formatDateRange(start: string, end: string): string {
  if (!start) return end;
  if (!end || start === end) return start;
  const startIso = listingIso(start);
  const endIso = listingIso(end);
  if (!startIso || !endIso) {
    return `${start} – ${end}`;
  }
  if (startIso === endIso) return formatEventDate(startIso);
  const [sy, sm, sd] = startIso.split("-");
  const [ey, em, ed] = endIso.split("-");
  if (sy === ey && sm === em) {
    return `${MONTHS[Number(sm) - 1]} ${Number(sd)}–${Number(ed)}, ${sy}`;
  }
  if (sy === ey) {
    return `${MONTHS[Number(sm) - 1]} ${Number(sd)} – ${MONTHS[Number(em) - 1]} ${Number(ed)}, ${sy}`;
  }
  return `${formatEventDate(startIso)} – ${formatEventDate(endIso)}`;
}

function episodeDate(listings: Listing[]): string {
  const dated = listings
    .filter((listing) => listing.date && listingSortValue(listing.date) > 0)
    .sort((a, b) => listingSortValue(a.date) - listingSortValue(b.date));
  if (dated.length === 0) return listings.find((listing) => listing.date)?.date ?? "";
  return formatDateRange(dated[0].date, dated[dated.length - 1].date);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function episodeLocation(listings: Listing[]): string {
  const parsed = listings.map((listing) => parseLocation(listingLocation(listing)));
  const states = uniqueStrings(parsed.map((entry) => entry.state).filter(Boolean));
  const cities = uniqueStrings(parsed.map((entry) => entry.city).filter(Boolean));
  if (states.length === 1 && cities.length === 1) return `${cities[0]}, ${states[0]}`;
  if (states.length === 1 && cities.length > 1 && cities.length <= 3) {
    return `${cities.join(" / ")}, ${states[0]}`;
  }
  if (states.length === 1) return STATE_NAMES[states[0]] ?? states[0];
  if (states.length > 1) return states.map((state) => STATE_NAMES[state] ?? state).join(" / ");
  return listings.map(listingLocation).find((value) => value.length > 0) ?? "";
}

function parseMileageAmount(value: string): { amount: number; unit: string } | null {
  const match = /([\d,]+)\s*(mi|km)?/i.exec(value);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, unit: (match[2] ?? "mi").toLowerCase() };
}

function episodeMileage(listings: Listing[]): string {
  const readings = listings
    .map((listing) => parseMileageAmount(listingMileage(listing)))
    .filter((reading): reading is { amount: number; unit: string } => reading !== null);
  if (readings.length === 0) return "";
  const unit = readings[0].unit;
  const min = Math.min(...readings.map((reading) => reading.amount));
  const max = Math.max(...readings.map((reading) => reading.amount));
  const format = (amount: number) => amount.toLocaleString("en-US");
  return min === max
    ? `${format(min)} ${unit}`
    : `${format(min)}–${format(max)} ${unit}`;
}

/** Quiet period after which the same dealer/region is a new chapter. */
const EPISODE_GAP_MS = 120 * 24 * 60 * 60 * 1000;

function listingTime(listing: Listing): number {
  return listingSortValue(listing.date);
}

function shouldStartEpisode(current: Listing[], next: Listing): boolean {
  const dated = current.filter((listing) => listingTime(listing) > 0);
  const nextTime = listingTime(next);
  if (dated.length > 0 && nextTime > 0) {
    const lastTime = Math.max(...dated.map(listingTime));
    if (nextTime - lastTime > EPISODE_GAP_MS) return true;
  }

  if (isMarketplace(next)) return false;

  const nextGroup = dealerGroupKey(next);
  const currentGroup = dominantGroupKey(current);
  if (nextGroup && currentGroup && !groupsCompatible(nextGroup, currentGroup)) return true;

  const nextState = parseLocation(listingLocation(next)).state;
  const currentState = dominantState(current);
  if (nextState && currentState && nextState !== currentState) return true;

  return false;
}

function toEpisode(listings: Listing[]): ListingGroup {
  const items = [...listings].sort((a, b) => listingTime(b) - listingTime(a));
  const identity = episodeIdentity(items);
  return {
    identity,
    headline: identity,
    price: episodePrice(items),
    date: episodeDate(items),
    location: episodeLocation(items),
    mileage: episodeMileage(items),
    listings: items,
  };
}

/**
 * Collapses scrape snapshots into a short timeline a buyer can scan.
 *
 * Same-price grouping was the wrong axis: drifting asks at one dealer group
 * became a card per total, and sister rooftops read as separate sellers.
 * Chapters split on a long quiet period, a dealer-group change, or a move
 * to another state. Marketplace/aggregator rows ride with the nearby dealer
 * chapter instead of opening one of their own.
 */
export function groupListings(listings: Listing[]): ListingGroup[] {
  if (listings.length === 0) return [];

  const chronological = listings
    .map((listing, index) => ({ listing, index }))
    .sort((a, b) => listingTime(a.listing) - listingTime(b.listing) || a.index - b.index)
    .map((entry) => entry.listing);

  const chapters: Listing[][] = [];
  let current: Listing[] = [];

  for (const listing of chronological) {
    if (current.length === 0 || !shouldStartEpisode(current, listing)) {
      current.push(listing);
      continue;
    }
    chapters.push(current);
    current = [listing];
  }
  if (current.length > 0) chapters.push(current);

  return chapters.map(toEpisode).reverse();
}

export function sectionListingGroups(section: ReportSection): ListingGroup[] {
  return groupListings(sectionListings(section));
}

/**
 * Drops records that repeat the one before them.
 *
 * Providers sometimes echo the same event once per source that reported it.
 * Only exact neighbours are removed — a genuine repeat event (same state, same
 * mileage, years apart) is a real part of the history and stays.
 */
export function dedupeConsecutiveRecords(records: Field[][]): Field[][] {
  const kept: Field[][] = [];
  let previous = "";
  for (const record of records) {
    const signature = record
      .map((field) => `${field.label}\u0000${field.value}`)
      .join("\u0001");
    if (signature === previous) continue;
    previous = signature;
    kept.push(record);
  }
  return kept;
}

const DISPOSITION_LABELS = ["Disposition", "Status", "Result"];
const CHANNEL_LABELS = [
  "Obtained from",
  "Reporting entity",
  "Source",
  "Seller",
  "Channel",
];

const PENDING_DISPOSITION =
  /\b(tbd|pending|undetermined)\b|to[\s-]?be[\s-]?determined/i;
const FINAL_DISPOSITION =
  /\b(sold|salvaged|crushed|destroyed|scrapped|scrap|recycled|exported)\b/i;
const AUCTION_CHANNEL =
  /\bcopart\b|\biaa\b|insurance auto auctions|\bjunk\b|\bsalvage\b|\bauction\b/i;

const MONTH_NAME: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function fieldOnRecord(record: Field[], labels: string[]): string {
  for (const label of labels) {
    const match = record.find((field) => field.label === label);
    if (match?.value) return match.value;
  }
  return "";
}

/** Calendar day for same-event matching, including `May 11, 2026`. */
export function recordCalendarDay(record: Field[]): string {
  const raw = fieldOnRecord(record, DATE_LABELS);
  if (!raw) return "";
  const iso = isoDate(raw);
  if (iso) return iso;
  const named = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/i.exec(
    raw,
  );
  if (!named) return raw.trim().toLowerCase();
  const month = MONTH_NAME[named[1].slice(0, 3).toLowerCase()];
  return `${named[3]}-${month}-${named[2].padStart(2, "0")}`;
}

function dispositionKind(record: Field[]): "pending" | "final" | "other" {
  const stated = DISPOSITION_LABELS.map((label) =>
    fieldOnRecord(record, [label]),
  )
    .filter(Boolean)
    .join(" ");
  if (PENDING_DISPOSITION.test(stated)) return "pending";
  if (FINAL_DISPOSITION.test(stated)) return "final";
  const price = fieldOnRecord(record, ["Price"]);
  if (PENDING_DISPOSITION.test(price)) return "pending";
  return "other";
}

function auctionHouseKey(value: string): string {
  const lower = value.toLowerCase();
  if (/\bcopart\b/.test(lower)) return "copart";
  if (/\biaa\b|insurance auto auctions/.test(lower)) return "iaa";
  return lower.replace(/[^a-z0-9]+/g, " ").trim();
}

function recordChannelKey(record: Field[]): string {
  const raw = fieldOnRecord(record, CHANNEL_LABELS);
  return raw ? auctionHouseKey(raw) : "";
}

function looksLikeAuctionChannel(record: Field[]): boolean {
  const blob = record.map((field) => field.value).join(" ");
  return AUCTION_CHANNEL.test(blob);
}

/**
 * Drops a pending salvage/auction disposition when the same event later
 * resolved on the same day.
 *
 * NMVTIS often emits an early `To be determined` row and a `Sold` for the
 * same Copart/IAA run. Once Sold exists, TBD was answered — showing both
 * reads as two events. A lone TBD stays; a TBD on another day stays.
 * Outcomes are never invented: only an unresolved row is removed, and only
 * when a stronger same-day sibling on the same channel is already there.
 */
export function preferResolvedDisposition(
  records: Field[][],
  options: { requireAuctionChannel?: boolean } = {},
): Field[][] {
  if (records.length < 2) return records;

  const groups = new Map<string, number[]>();
  for (const [index, record] of records.entries()) {
    if (options.requireAuctionChannel && !looksLikeAuctionChannel(record)) {
      continue;
    }
    const day = recordCalendarDay(record);
    if (!day) continue;
    const key = `${day}\u0000${recordChannelKey(record)}`;
    const list = groups.get(key);
    if (list) list.push(index);
    else groups.set(key, [index]);
  }

  const drop = new Set<number>();
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const kinds = indices.map((index) => dispositionKind(records[index]));
    if (!kinds.includes("final") || !kinds.includes("pending")) continue;
    for (const [offset, index] of indices.entries()) {
      if (kinds[offset] === "pending") drop.add(index);
    }
  }

  return drop.size === 0 ? records : records.filter((_, index) => !drop.has(index));
}

/** Applies the same-day TBD/Sold collapse on junk/salvage and auction listings. */
export function withResolvedDispositions(report: VehicleReport): VehicleReport {
  return {
    ...report,
    sections: report.sections.map((section) => {
      if (section.key === "jsi") {
        return {
          ...section,
          records: preferResolvedDisposition(section.records),
        };
      }
      if (section.key === "sales" || section.layout === "listings") {
        return {
          ...section,
          records: preferResolvedDisposition(section.records, {
            requireAuctionChannel: true,
          }),
        };
      }
      return section;
    }),
  };
}

/** The spine of an event: it stays on the row even when every record agrees. */
const ALWAYS_PER_RECORD = new Set(["Date"]);

/**
 * Moves fields that never vary out of the records and into the section.
 *
 * A feed repeats things like the odometer unit or the vehicle use on every
 * event it returns. Read as a table that is a column of one value copied down
 * the page, which is the main thing that makes a real history look padded.
 * Stating it once for the section says exactly as much.
 */
export function liftSharedFields(records: Field[][]): {
  records: Field[][];
  shared: Field[];
} {
  if (records.length < 2) return { records, shared: [] };

  const shared = records[0].filter(
    (candidate) =>
      !ALWAYS_PER_RECORD.has(candidate.label) &&
      records.every((record) => {
        const matches = record.filter((field) => field.label === candidate.label);
        return matches.length === 1 && matches[0].value === candidate.value;
      }),
  );
  if (shared.length === 0) return { records, shared: [] };

  const labels = new Set(shared.map((field) => field.label));
  const trimmed = records.map((record) =>
    record.filter((field) => !labels.has(field.label)),
  );
  // A row stripped to nothing reads worse than the repetition it removed.
  if (trimmed.some((record) => record.length === 0)) return { records, shared: [] };

  return { records: trimmed, shared };
}

/**
 * Drops a reading the feed reported twice for the same event.
 *
 * A mileage that repeats on a *different* date is a real second event and stays
 * — a car can be re-registered without being driven, and hiding that would be
 * rewriting the history. Only the same date, mileage and state twice over is
 * removed, because that is one event echoed, not two.
 *
 * Expects readings in date order, oldest first.
 */
export function dedupeOdometerReadings(
  readings: OdometerReading[],
): OdometerReading[] {
  const kept: OdometerReading[] = [];
  for (const reading of readings) {
    const previous = kept[kept.length - 1];
    if (
      previous &&
      previous.date === reading.date &&
      previous.value === reading.value &&
      previous.source === reading.source
    ) {
      continue;
    }
    kept.push(reading);
  }
  return kept;
}

/** True when a reading is lower than the one before it. */
export function hasOdometerRollback(readings: OdometerReading[]): boolean {
  return readings.some(
    (reading, index) => index > 0 && reading.value < readings[index - 1].value,
  );
}

/* -------------------------------------------------------------------------- */
/* What the renderers put at the top of a report                               */
/* -------------------------------------------------------------------------- */

export type ChipTone = "clear" | "flag" | "neutral";

export type ReportChip = {
  key: string;
  label: string;
  tone: ChipTone;
};

/**
 * The header's status chips.
 *
 * Every chip restates something already in the report's own records — the
 * title brand, the mileage direction, the counts of the checks that fired.
 * Nothing here is scored, graded or valued: we do not hold the data that would
 * make a grade or a price honest.
 */
const CHIP_NOUN: Record<string, [string, string]> = {
  titles: ["title record", "title records"],
  accidents: ["accident", "accidents"],
  liens: ["lien", "liens"],
  recalls: ["recall", "recalls"],
  thefts: ["theft record", "theft records"],
  jsi: ["junk/salvage record", "junk/salvage records"],
  branded: ["branded title", "branded titles"],
  impounds: ["impound", "impounds"],
  exports: ["export record", "export records"],
  sales: ["listing snapshot", "listing snapshots"],
};

function countChipLabel(key: string, label: string, count: number): string {
  const pair = CHIP_NOUN[key];
  if (pair) return `${count} ${count === 1 ? pair[0] : pair[1]}`;
  return `${count} ${label.toLowerCase()}`;
}

export function reportChips(report: VehicleReport): ReportChip[] {
  const chips: ReportChip[] = [];
  const check = (key: string) => report.checks.find((entry) => entry.key === key);

  const titles = check("titles");
  const branded = check("branded");

  if (branded?.status === "found") {
    chips.push({ key: "branded", label: "Branded title", tone: "flag" });
  } else if (branded && titles && titles.count > 0) {
    chips.push({ key: "branded", label: "Clean title", tone: "clear" });
  }

  if (report.odometer.length > 0) {
    chips.push(
      hasOdometerRollback(report.odometer)
        ? { key: "odometer", label: "Odometer rollback", tone: "flag" }
        : { key: "odometer", label: "Odometer consistent", tone: "clear" },
    );
  }

  for (const entry of report.checks) {
    if (entry.status !== "found") continue;
    if (entry.key === "titles" || entry.key === "branded") continue;
    chips.push({
      key: entry.key,
      label: countChipLabel(entry.key, entry.label, entry.count),
      tone: "flag",
    });
  }

  if (titles) {
    chips.push({
      key: "titles",
      label:
        titles.count > 0
          ? countChipLabel("titles", titles.label, titles.count)
          : "No title records",
      tone: "neutral",
    });
  }

  return chips;
}

export type ReportNavItem = { href: string; label: string };

/** Outline of the report, listing only the parts that came back with content. */
export function reportNavItems(
  report: VehicleReport,
  options: { modelExtras?: boolean } = {},
): ReportNavItem[] {
  const items: ReportNavItem[] = [{ href: "#brief", label: "What to know" }];
  for (const section of report.sections) {
    if (section.records.length === 0) continue;
    items.push({
      href: `#${section.key}`,
      label: section.navLabel ?? section.title,
    });
  }
  if (options.modelExtras) {
    items.push({ href: "#model-extras", label: MODEL_ZONE_NAV });
  }
  return items;
}

export function sectionsWithRecords(report: VehicleReport): ReportSection[] {
  return report.sections.filter((section) => section.records.length > 0);
}

/**
 * The record types that were searched and came back with nothing.
 *
 * Printing a card per empty category is the wall of "no issue found" rows that
 * makes a report feel padded, but dropping them silently would hide what was
 * actually checked. One list of names says both.
 */
export function searchedAndEmpty(report: VehicleReport): string[] {
  return report.sections
    .filter((section) => section.records.length === 0)
    .map((section) => section.navLabel ?? section.title);
}

/**
 * Checks that came back with something other than a routine title count.
 *
 * Title records almost always exist; they are not a finding. The issue
 * checks — brand, accident, salvage, lien, recall — are what belongs in
 * the brief's summary strip.
 *
 * Findings are also derived from sections that came back with records, so a
 * junk/salvage (or any future) category cannot sit on the report and skip
 * the summary just because no matching check was stored with the order.
 */
const ROUTINE_CHECK_KEYS = new Set(["titles"]);

export function foundIssueChecks(report: VehicleReport): ReportCheck[] {
  const findings: ReportCheck[] = [];
  const seen = new Set<string>();

  const branded = report.checks.find((entry) => entry.key === "branded");
  if (branded?.status === "found") {
    findings.push(branded);
    seen.add("branded");
  }

  for (const section of sectionsWithRecords(report)) {
    if (ROUTINE_CHECK_KEYS.has(section.key) || seen.has(section.key)) continue;
    const existing = report.checks.find((entry) => entry.key === section.key);
    findings.push(
      existing?.status === "found"
        ? existing
        : {
            key: section.key,
            label: section.navLabel ?? section.title,
            status: "found",
            count: section.records.length,
            detail: "",
          },
    );
    seen.add(section.key);
  }

  for (const entry of report.checks) {
    if (entry.status !== "found" || ROUTINE_CHECK_KEYS.has(entry.key)) continue;
    if (seen.has(entry.key)) continue;
    findings.push(entry);
    seen.add(entry.key);
  }

  return findings;
}

/**
 * The record currently in force, ready to be stated above its own table.
 *
 * Nothing new is derived: it is the record the provider flagged as current,
 * minus the flag itself.
 *
 * It says exactly what the row below it says — the table's own columns and no
 * more. Written from every field the record held, this line was where a
 * 17-digit title number and a claim code re-entered a report that had just
 * finished putting them behind a disclosure, and it read the event out twice
 * when two fields happened to agree.
 */
export function currentEvent(
  section: ReportSection,
): { label: string; fields: Field[] } | null {
  const record = section.records.find((fields) =>
    fields.some((field) => field.label === "Current" && field.value === "Yes"),
  );
  if (!record) return null;

  const columns = sectionTable(section)?.columns;
  const scannable = columns
    ? record.filter((field) => columns.includes(field.label))
    : record.slice(0, LEAD_FIELDS);

  const seen = new Set<string>();
  const fields = scannable.filter((field) => {
    if (field.label === "Current" || field.value.length === 0) return false;
    if (seen.has(field.value)) return false;
    seen.add(field.value);
    return true;
  });
  if (fields.length === 0) return null;

  return {
    label: section.key === "titles" ? "Current title" : "Current record",
    fields,
  };
}

/** Short label on a closed history card — the nav name, not the long title. */
export function sectionClosedTitle(section: ReportSection): string {
  return section.navLabel ?? section.title;
}

/** Record / chapter count shown on a section's closed face. */
export function sectionCountLabel(section: ReportSection): string {
  if (section.layout === "listings") {
    const groups = sectionListingGroups(section);
    if (groups.length > 0) {
      const chapters = groups.length === 1 ? "chapter" : "chapters";
      const snapshots = section.records.length === 1 ? "snapshot" : "snapshots";
      return `${groups.length} ${chapters} · ${section.records.length} ${snapshots}`;
    }
  }
  return `${section.records.length} record${section.records.length === 1 ? "" : "s"}`;
}

/**
 * The one line a closed section card leads with — current title, latest
 * listing chapter, or the newest row — so the table can stay folded away.
 */
export function sectionLead(
  section: ReportSection,
): { label: string; text: string } | null {
  const current = currentEvent(section);
  if (current) {
    return {
      label: current.label,
      text: current.fields.map((field) => field.value).join(" · "),
    };
  }

  if (section.layout === "listings") {
    const latest = sectionListingGroups(section)[0];
    if (!latest) return null;
    const text = [latest.identity, latest.date, latest.price]
      .filter((part) => part.length > 0)
      .join(" · ");
    return text ? { label: "Latest chapter", text } : null;
  }

  const table = sectionTable(section);
  if (table?.rows[0]) {
    const text = table.rows[0].cells
      .filter((cell) => cell.length > 0)
      .slice(0, 4)
      .join(" · ");
    if (text) return { label: "Latest record", text };
  }

  const first = section.records[0];
  if (!first) return null;
  const text = first
    .slice(0, LEAD_FIELDS)
    .map((field) => field.value)
    .filter((value) => value.length > 0)
    .join(" · ");
  return text ? { label: "Latest record", text } : null;
}

/** Specs worth stating on the vehicle card before anyone opens the rest. */
const HEADER_SPEC_LABELS = [
  "Color",
  "Style",
  "Engine",
  "Drive type",
  "Drivetrain",
  "Fuel type",
  "Transmission",
];

/**
 * The two or three facts that belong next to the year, make and model.
 *
 * Everything else lives behind the header's disclosure — a twelve-row spec
 * grid at the bottom of the report was a second place to look for the engine
 * that the heading had already named the car by.
 */
/**
 * A build record's `Style` often spells the engine out in full — `Limited Sedan
 * AWD CVT 2.4L H4` — so joining it to `Engine` printed `2.4L H4 · 2.4L H4` on
 * the card. A spec already contained in one we kept says nothing twice.
 */
function alreadyStated(picked: Field[], value: string): boolean {
  const needle = value.trim().toLowerCase();
  if (!needle) return true;
  return picked.some((field) => field.value.trim().toLowerCase().includes(needle));
}

/**
 * Exterior paint on this report, or empty when none was recorded.
 *
 * Build-record specs win when they name a paint colour. Otherwise the listing
 * rows are asked, with the same paint-vs-interior rules the hero uses. Nothing
 * is invented: no colour in the records means no colour here.
 */
export function reportPaintColor(report: VehicleReport): string {
  const fromSpecs = pickColor(colorFieldValues(report.specifications));
  if (fromSpecs) return fromSpecs;

  const listingFields = report.sections
    .filter((section) => section.layout === "listings" || section.key === "sales")
    .flatMap((section) => sectionListings(section))
    .flatMap((listing) => [...listing.summary, ...listing.detail]);
  return pickColor(colorFieldValues(listingFields));
}

export function reportPaintColorField(report: VehicleReport): Field | null {
  const value = reportPaintColor(report);
  return value ? { label: PAINT_COLOR_LABEL, value } : null;
}

/**
 * Specs shown on the vehicle card, with paint colour lifted to a single Color
 * row when the records have one. Listing-only paint still appears here so it
 * is not trapped behind a closed sales chapter.
 */
export function headerSpecifications(report: VehicleReport): Field[] {
  const color = reportPaintColorField(report);
  const rest = report.specifications.filter((field) => !isPaintColorLabel(field.label));
  return color ? [color, ...rest] : rest;
}

export function headerSpecSummary(specifications: Field[], limit = 3): Field[] {
  const picked: Field[] = [];
  for (const label of HEADER_SPEC_LABELS) {
    if (picked.length === limit) break;
    const spec = specifications.find((entry) => entry.label === label);
    if (spec && !alreadyStated(picked, spec.value)) picked.push(spec);
  }
  return picked.length > 0 ? picked : specifications.slice(0, limit);
}

export type SpecMpgKind = "city" | "highway" | "combined";

export type SpecMpgFigure = {
  key: SpecMpgKind;
  label: string;
  display: string;
};

export type SpecMpg = {
  figures: SpecMpgFigure[];
};

const SPEC_MPG_LABEL: Record<SpecMpgKind, string> = {
  city: "City",
  highway: "Highway",
  combined: "Combined",
};

function normalizeSpecLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Which mileage row this spec is, if it is one.
 *
 * "Made In City" and a lone "City" are places, not MPG. VinAudit sends
 * `CityMileage` / `Highway Mileage` / `city_mileage` as the fuel-economy pair.
 */
export function specMpgKind(label: string): SpecMpgKind | "jammed" | null {
  const n = normalizeSpecLabel(label);
  if (!n || /made in city/.test(n)) return null;
  if (
    n === "fuel economy" ||
    n === "gas mileage" ||
    n === "epa fuel economy"
  ) {
    return "jammed";
  }
  if (!/(mileage|mpg|economy)/.test(n)) return null;
  if (/\bcombined\b/.test(n)) return "combined";
  if (/\b(highway|hwy)\b/.test(n)) return "highway";
  if (/\bcity\b/.test(n)) return "city";
  return null;
}

/** Turns `21 miles/gallon` or `30 – 32 miles/gallon` into a short figure. */
export function specMpgDisplay(value: string): string | null {
  const cleaned = value.replace(/miles\s*\/\s*gallon|mpge?|gal/gi, " ").trim();
  const nums = cleaned.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  if (nums.length === 1) return nums[0];
  return `${nums[0]}–${nums[1]}`;
}

function figuresFromJammedMpg(value: string): SpecMpgFigure[] {
  const figures: SpecMpgFigure[] = [];
  const city = /(\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?)\s*city/i.exec(value);
  const highway =
    /(\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?)\s*(hwy|highway)/i.exec(value);
  const combined =
    /(\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?)\s*combined/i.exec(value);
  const add = (key: SpecMpgKind, raw: string | undefined) => {
    if (!raw) return;
    const display = specMpgDisplay(raw);
    if (display) figures.push({ key, label: SPEC_MPG_LABEL[key], display });
  };
  add("city", city?.[1]);
  add("highway", highway?.[1]);
  add("combined", combined?.[1]);
  return figures;
}

/**
 * Lifts city / highway / combined mileage out of the VIN spec list so they
 * can print as figures instead of two more definition-list rows.
 *
 * No number is invented: a missing combined row stays missing, and a range
 * stays a range.
 */
export function partitionSpecMpg(fields: Field[]): {
  mpg: SpecMpg | null;
  rest: Field[];
} {
  const found = new Map<SpecMpgKind, SpecMpgFigure>();
  const rest: Field[] = [];

  for (const field of fields) {
    const kind = specMpgKind(field.label);
    if (!kind) {
      rest.push(field);
      continue;
    }
    if (kind === "jammed") {
      const jammed = figuresFromJammedMpg(field.value);
      if (jammed.length === 0) {
        rest.push(field);
        continue;
      }
      for (const figure of jammed) {
        if (!found.has(figure.key)) found.set(figure.key, figure);
      }
      continue;
    }
    const display = specMpgDisplay(field.value);
    if (!display) {
      rest.push(field);
      continue;
    }
    if (!found.has(kind)) {
      found.set(kind, { key: kind, label: SPEC_MPG_LABEL[kind], display });
    }
  }

  const figures = (["city", "highway", "combined"] as const)
    .map((key) => found.get(key))
    .filter((row): row is SpecMpgFigure => Boolean(row));

  return { mpg: figures.length > 0 ? { figures } : null, rest };
}

export function specMpgTeaser(mpg: SpecMpg): string {
  return `${mpg.figures
    .map((row) => `${row.display} ${row.label.toLowerCase()}`)
    .join(" · ")} mpg`;
}

export type SpecGroupKey = "powertrain" | "body" | "features" | "more";

export type SpecGroup = {
  key: SpecGroupKey;
  title: string;
  fields: Field[];
};

const SPEC_GROUP_TITLE: Record<SpecGroupKey, string> = {
  powertrain: SPEC_GROUP_POWERTRAIN,
  body: SPEC_GROUP_BODY,
  features: SPEC_GROUP_FEATURES,
  more: SPEC_GROUP_MORE,
};

const SPEC_GROUP_ORDER: SpecGroupKey[] = [
  "powertrain",
  "body",
  "features",
  "more",
];

/**
 * Closed-face chips under the MPG tiles — complementary to the header line,
 * so the teaser does not restate Color · Style · Engine.
 */
const TEASER_SPEC_LABELS = [
  "Transmission",
  "Drive type",
  "Drivetrain",
  "Fuel type",
  "Standard seating",
  "Made in",
  "Anti-brake system",
  "Style",
  "Engine",
  "Color",
];

function specGroupKey(label: string): SpecGroupKey {
  const n = normalizeSpecLabel(label);
  if (!n) return "more";

  if (
    /^(engine|engine type|engine size|engine cylinders|cylinders|displacement|horsepower|torque|aspiration|turbocharger|hybrid|electric range|motor|transmission|transmission type|trans|drivetrain|drive type|drive|driveline|fuel type|fuel|fuel tank|fuel capacity|tank size)$/.test(
      n,
    ) ||
    /\b(engine|transmission|drivetrain|driveline|horsepower|torque|cylinder|displacement|fuel type|fuel tank|fuel capacity)\b/.test(
      n,
    )
  ) {
    return "powertrain";
  }

  if (
    /anti[- ]?brake/.test(n) ||
    /\b(brake|abs|airbags?|steering|suspension|tires?|tyres?|wheels?|equipment|options?|safety|audio|navigation|sunroof|moonroof|bluetooth|cruise|camera|sensor|assist|climate|air condition)\b/.test(
      n,
    )
  ) {
    return "features";
  }

  if (
    n === "size" ||
    n === "category" ||
    n === "type" ||
    n === "class" ||
    /\b(style|body|doors?|seats?|seating|length|width|height|wheelbase|weight|curb|gvwr|payload|towing|cargo|dimension|made in|manufactur|country|color|colour|paint|vehicle type|vehicle class|headroom|legroom|shoulder|hip room)\b/.test(
      n,
    )
  ) {
    return "body";
  }

  return "more";
}

/**
 * Buckets the remaining (non-MPG) VIN specs so HTML and PDF can print the
 * same groups. Unknown labels land in More specifications — nothing is
 * dropped or invented.
 */
export function groupSpecFields(fields: Field[]): SpecGroup[] {
  const buckets = new Map<SpecGroupKey, Field[]>();
  for (const field of fields) {
    const key = specGroupKey(field.label);
    const list = buckets.get(key);
    if (list) list.push(field);
    else buckets.set(key, [field]);
  }

  return SPEC_GROUP_ORDER.flatMap((key) => {
    const groupFields = buckets.get(key);
    if (!groupFields || groupFields.length === 0) return [];
    return [{ key, title: SPEC_GROUP_TITLE[key], fields: groupFields }];
  });
}

/**
 * A few scan-friendly facts for the closed Vehicle specifications face.
 *
 * Prefers complementary labels (transmission, drive, seating) and skips
 * values already named in `exclude` — typically the header spec line.
 */
export function specTeaserFacts(
  fields: Field[],
  options: { exclude?: Field[]; limit?: number } = {},
): Field[] {
  const limit = options.limit ?? 3;
  const excluded = new Set(
    (options.exclude ?? []).map((field) => `${field.label}\0${field.value}`),
  );
  const available = fields.filter(
    (field) => !excluded.has(`${field.label}\0${field.value}`),
  );
  const picked: Field[] = [];

  for (const label of TEASER_SPEC_LABELS) {
    if (picked.length >= limit) break;
    const spec = available.find((entry) => entry.label === label);
    if (spec && !alreadyStated(picked, spec.value)) picked.push(spec);
  }

  if (picked.length < limit) {
    for (const spec of available) {
      if (picked.length >= limit) break;
      if (picked.some((field) => field.label === spec.label && field.value === spec.value)) {
        continue;
      }
      if (!alreadyStated(picked, spec.value)) picked.push(spec);
    }
  }

  return picked;
}
