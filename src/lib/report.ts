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
