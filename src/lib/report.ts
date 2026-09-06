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
  /** Each entry is one event/record rendered as a small labelled card. */
  records: Field[][];
  emptyLabel: string;
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
