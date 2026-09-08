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

/** One record laid out against a section's columns. */
export type TableRow = {
  /** Same length and order as the resolved column list. Empty means no value. */
  cells: string[];
  /** Fields that do not belong to a column, shown beneath the row. */
  extras: Field[];
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

  const rows = section.records.map((record) => ({
    cells: columns.map(
      (column) => record.find((field) => field.label === column)?.value ?? "",
    ),
    extras: record.filter(
      (field) => !columns.includes(field.label) && field.value.length > 0,
    ),
  }));

  return { columns, rows };
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
const SUMMARY_LABELS = ["Mileage", "Location", "Seller type", "Seller"];

const DATE_LABELS = ["Date", "Listing date", "Sale date"];
const PRICE_LABELS = ["Price", "Sale price", "Listing price"];

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
  return section.records.map((record) => {
    const fields = record.map((field) => ({ ...field }));
    foldLocation(fields);

    const date = take(fields, DATE_LABELS);
    const price = take(fields, PRICE_LABELS);
    const headline = take(fields, HEADLINE_LABELS);

    const summary: Field[] = [];
    for (const label of SUMMARY_LABELS) {
      if (summary.length === MAX_SUMMARY_FACTS) break;
      const field = take(fields, [label]);
      if (field) summary.push(field);
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
export function reportChips(report: VehicleReport): ReportChip[] {
  const chips: ReportChip[] = [];
  const check = (key: string) => report.checks.find((entry) => entry.key === key);

  const titles = check("titles");
  const branded = check("branded");

  if (branded?.status === "found") {
    chips.push({ key: "branded", label: "Title brand reported", tone: "flag" });
  } else if (branded && titles && titles.count > 0) {
    chips.push({ key: "branded", label: "No title brand reported", tone: "clear" });
  }

  if (report.odometer.length > 0) {
    chips.push(
      hasOdometerRollback(report.odometer)
        ? { key: "odometer", label: "Odometer rollback indicated", tone: "flag" }
        : { key: "odometer", label: "Odometer reads consistently", tone: "clear" },
    );
  }

  for (const entry of report.checks) {
    if (entry.status !== "found") continue;
    if (entry.key === "titles" || entry.key === "branded") continue;
    chips.push({
      key: entry.key,
      label: `${entry.label}: ${entry.count}`,
      tone: "flag",
    });
  }

  if (titles) {
    chips.push({
      key: "titles",
      label: titles.count > 0 ? `Title records: ${titles.count}` : "No title records",
      tone: "neutral",
    });
  }

  return chips;
}

export type ReportNavItem = { href: string; label: string };

/** Outline of the report, listing only the parts that came back with content. */
export function reportNavItems(
  report: VehicleReport,
  options: { hasBrief?: boolean } = {},
): ReportNavItem[] {
  const items: ReportNavItem[] = [];
  if (options.hasBrief) items.push({ href: "#brief", label: "What to know" });
  items.push({ href: "#summary", label: "Summary" });
  if (report.odometer.length > 0) {
    items.push({ href: "#odometer", label: "Odometer" });
  }
  for (const section of report.sections) {
    if (section.records.length === 0) continue;
    items.push({
      href: `#${section.key}`,
      label: section.navLabel ?? section.title,
    });
  }
  if (report.specifications.length > 0) {
    items.push({ href: "#specifications", label: "Specifications" });
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

/** Specs worth stating on the vehicle card before anyone opens the rest. */
const HEADER_SPEC_LABELS = [
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
export function headerSpecSummary(specifications: Field[], limit = 3): Field[] {
  const picked: Field[] = [];
  for (const label of HEADER_SPEC_LABELS) {
    if (picked.length === limit) break;
    const spec = specifications.find((entry) => entry.label === label);
    if (spec) picked.push(spec);
  }
  return picked.length > 0 ? picked : specifications.slice(0, limit);
}
