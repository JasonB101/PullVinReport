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

/** Below this a table reads worse than the labelled cards it replaces. */
const MIN_TABLE_COLUMNS = 2;

/**
 * Lays a section out as a table when its records actually share structure.
 *
 * Columns the provider never filled in are dropped rather than rendered as a
 * wall of dashes, and a section that ends up with almost nothing in common
 * falls back to cards by returning `null`.
 */
export function sectionTable(section: ReportSection): SectionTable | null {
  if (!section.columns || section.records.length === 0) return null;

  const columns = section.columns.filter((column) =>
    section.records.some((record) =>
      record.some((field) => field.label === column && field.value.length > 0),
    ),
  );
  if (columns.length < MIN_TABLE_COLUMNS) return null;

  const rows = section.records.map((record) => ({
    cells: columns.map(
      (column) => record.find((field) => field.label === column)?.value ?? "",
    ),
    extras: record.filter((field) => !columns.includes(field.label)),
  }));

  return { columns, rows };
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
 */
export function currentEvent(
  section: ReportSection,
): { label: string; fields: Field[] } | null {
  const record = section.records.find((fields) =>
    fields.some((field) => field.label === "Current" && field.value === "Yes"),
  );
  if (!record) return null;

  const fields = record.filter((field) => field.label !== "Current");
  if (fields.length === 0) return null;

  return {
    label: section.key === "titles" ? "Current title" : "Current record",
    fields,
  };
}
