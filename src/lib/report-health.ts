/**
 * A 0–100 report-health score, computed only from records on this report.
 *
 * It is not an appraisal, a condition grade of the physical car, or a market
 * value. The number is a transparent tally of what the history checks found,
 * so a buyer can see why it moved. Thin data still produces a score — the
 * missing title factor says so instead of inventing a clean bill of health.
 */
import type { Field, OdometerReading, ReportSection, VehicleReport } from "@/lib/report";
import {
  formatEventDate,
  hasOdometerRollback,
  isoDate,
  withResolvedDispositions,
} from "@/lib/report";

export const HEALTH_DISCLAIMER =
  "Based on the history records in this report — not an appraisal, a condition grade of the car, or a market value.";

export type FactorImpact = "helps" | "hurts" | "neutral";

export type HealthFactor = {
  key: string;
  label: string;
  impact: FactorImpact;
  /** Signed change to the 100 starting point. Helps and neutrals are 0. */
  delta: number;
  reason: string;
};

export type HealthLabel = "Strong" | "Mixed" | "Caution";

export type PostSalvageKind = "long" | "short" | "none";

export type ReportHealth = {
  score: number;
  label: HealthLabel;
  disclaimer: string;
  factors: HealthFactor[];
  salvage: {
    present: boolean;
    earliestIso: string;
    post: PostSalvageKind | null;
  };
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const SALVAGE_TEXT =
  /\bjunk\b|\bsalvage\b|\brebuilt\b|\bflood\b|\blemon\b|\btotal(?:ed|led)? loss\b|\bcopart\b|\binsurance auto auctions\b|\biaa\b/i;

/** A year of later title/odometer history is enough to call the window long. */
export const POST_SALVAGE_LONG_DAYS = 365;

const NAMED_DATE =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/;

export function sortableDate(value: string): string {
  const iso = isoDate(value);
  if (iso) return iso;
  const named = NAMED_DATE.exec(value.trim());
  if (!named) return "";
  const month = MONTHS.indexOf(named[1]) + 1;
  return `${named[3]}-${String(month).padStart(2, "0")}-${named[2].padStart(2, "0")}`;
}

function sectionOf(report: VehicleReport, key: string): ReportSection | undefined {
  return report.sections.find((section) => section.key === key);
}

function checkOf(report: VehicleReport, key: string) {
  return report.checks.find((entry) => entry.key === key);
}

/** How many records we can see. Null when the report never ran that check. */
function issueCount(report: VehicleReport, key: string): number | null {
  const check = checkOf(report, key);
  if (check) {
    if (check.status === "found") return check.count;
    if (check.status === "clear") return 0;
  }
  const records = sectionOf(report, key)?.records;
  if (records) return records.length;
  return null;
}

function fieldValue(fields: Field[], labels: string[]): string {
  const wanted = new Set(labels.map((label) => label.toLowerCase()));
  return (
    fields.find((field) => wanted.has(field.label.toLowerCase()))?.value ?? ""
  );
}

function recordBlob(fields: Field[]): string {
  return fields.map((field) => `${field.label} ${field.value}`).join(" ");
}

function recordDate(fields: Field[]): string {
  return sortableDate(fieldValue(fields, ["Date", "Reported"]));
}

function parseMileage(value: string): number | null {
  const match = /(\d[\d,]*)/.exec(value);
  if (!match) return null;
  const amount = Number.parseInt(match[1].replace(/,/g, ""), 10);
  return Number.isFinite(amount) ? amount : null;
}

function formatMiles(value: number, unit = "mi"): string {
  return `${value.toLocaleString("en-US")} ${unit}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000);
}

export function formatDuration(days: number): string {
  if (days < 45) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.max(1, Math.round(days / 30.44));
  if (days < POST_SALVAGE_LONG_DAYS) {
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  const years = days / 365;
  if (years < 1.5) return "1 year";
  const rounded = Math.round(years);
  return `${rounded} year${rounded === 1 ? "" : "s"}`;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Salvage / total-loss / Copart history is categorical. A rebuilt car that
 * later drove can earn the post-salvage bonus, but that must not push the
 * meter into Mixed or Strong — a green 86/100 above a branded title is a lie.
 */
export const SALVAGE_SCORE_CAP = 54;

export function healthLabel(score: number): HealthLabel {
  if (score >= 80) return "Strong";
  if (score >= 55) return "Mixed";
  return "Caution";
}

function salvageRecords(report: VehicleReport): Field[][] {
  const jsi = sectionOf(report, "jsi")?.records ?? [];
  const titles = sectionOf(report, "titles")?.records ?? [];
  const brandedTitles = titles.filter((fields) =>
    SALVAGE_TEXT.test(
      `${fieldValue(fields, ["Brand", "Event", "Standard claim"])} ${recordBlob(fields)}`,
    ),
  );
  return [...jsi, ...brandedTitles];
}

export function earliestSalvageIso(report: VehicleReport): string {
  const dates = salvageRecords(report)
    .map(recordDate)
    .filter((iso) => iso.length > 0)
    .sort();
  return dates[0] ?? "";
}

function salvagePresent(report: VehicleReport): boolean {
  if (salvageRecords(report).length > 0) return true;
  const branded = checkOf(report, "branded");
  return branded?.status === "found" && branded.count > 0;
}

function laterDriving(
  report: VehicleReport,
  salvageIso: string,
): { lastIso: string; firstMiles: number | null; lastMiles: number | null; climbed: boolean } {
  const laterReadings = report.odometer.filter((reading) => {
    const iso = sortableDate(reading.date);
    return iso.length > 0 && iso > salvageIso;
  });
  const laterTitles = (sectionOf(report, "titles")?.records ?? []).filter((fields) => {
    const iso = recordDate(fields);
    return iso.length > 0 && iso > salvageIso;
  });

  const dateCandidates = [
    ...laterReadings.map((reading) => sortableDate(reading.date)),
    ...laterTitles.map(recordDate),
  ]
    .filter(Boolean)
    .sort();
  const lastIso = dateCandidates[dateCandidates.length - 1] ?? "";

  const milesFromReadings = laterReadings.map((reading) => reading.value);
  const milesFromTitles = laterTitles
    .map((fields) => parseMileage(fieldValue(fields, ["Mileage"])))
    .filter((value): value is number => value !== null);
  const miles = milesFromReadings.length > 0 ? milesFromReadings : milesFromTitles;
  const firstMiles = miles[0] ?? null;
  const lastMiles = miles.length > 0 ? miles[miles.length - 1] : null;
  const climbed =
    firstMiles !== null && lastMiles !== null && lastMiles > firstMiles;

  return { lastIso, firstMiles, lastMiles, climbed };
}

function postSalvageFactor(report: VehicleReport): HealthFactor | null {
  if (!salvagePresent(report)) return null;

  const earliestIso = earliestSalvageIso(report);
  const dateLabel = earliestIso ? formatEventDate(earliestIso) : "an undated salvage-channel entry";

  if (!earliestIso) {
    return {
      key: "post-salvage",
      label: "After the salvage-channel entry",
      impact: "neutral",
      delta: 0,
      reason:
        "A junk, salvage or auction-house record is on file, but it has no usable date, so later driving history cannot be measured.",
    };
  }

  const later = laterDriving(report, earliestIso);
  if (!later.lastIso) {
    return {
      key: "post-salvage",
      label: "After the salvage-channel entry",
      impact: "neutral",
      delta: 0,
      reason: `No title or odometer events after the salvage-channel entry of ${dateLabel}.`,
    };
  }

  const span = daysBetween(earliestIso, later.lastIso);
  if (span < POST_SALVAGE_LONG_DAYS) {
    return {
      key: "post-salvage",
      label: "After the salvage-channel entry",
      impact: "neutral",
      delta: 0,
      reason: `Only ${formatDuration(span)} of records after the salvage-channel entry of ${dateLabel} — too early to show a long post-repair driving history.`,
    };
  }

  if (later.climbed && later.firstMiles !== null && later.lastMiles !== null) {
    const unit = report.odometer[0]?.unit || "mi";
    return {
      key: "post-salvage",
      label: "After the salvage-channel entry",
      impact: "helps",
      delta: 8,
      reason: `Title/odometer records continue for ${formatDuration(span)} after the salvage-channel entry of ${dateLabel}, with mileage rising from ${formatMiles(later.firstMiles, unit)} to ${formatMiles(later.lastMiles, unit)}.`,
    };
  }

  return {
    key: "post-salvage",
    label: "After the salvage-channel entry",
    impact: "neutral",
    delta: 0,
    reason: `Title or odometer records continue for ${formatDuration(span)} after the salvage-channel entry of ${dateLabel}. Later mileage readings did not rise.`,
  };
}

function salvageReason(report: VehicleReport): string {
  const jsi = sectionOf(report, "jsi")?.records ?? [];
  if (jsi.length > 0) {
    const earliest = earliestSalvageIso(report);
    const who = jsi
      .map((fields) => fieldValue(fields, ["Obtained from", "Reporting entity"]))
      .filter(Boolean);
    const house = who.find((value) => /copart|\biaa\b|insurance auto auctions/i.test(value));
    const when = earliest ? ` from ${formatEventDate(earliest)}` : "";
    if (house) {
      return `${jsi.length} junk/salvage record${jsi.length === 1 ? "" : "s"}${when} via ${house}.`;
    }
    return `${jsi.length} junk, salvage or insurance-loss record${jsi.length === 1 ? "" : "s"}${when}.`;
  }

  const branded = checkOf(report, "branded");
  if (branded && branded.count > 0) {
    return "A salvage, junk or insurance-loss brand is on the title records.";
  }
  return "Salvage-channel activity is reported.";
}

function accidentReason(report: VehicleReport, count: number): string {
  const records = sectionOf(report, "accidents")?.records ?? [];
  const latest = records[0];
  const date = latest ? formatEventDate(recordDate(latest) || fieldValue(latest, ["Date"])) : "";
  const city = latest ? fieldValue(latest, ["City"]) : "";
  const severity = latest ? fieldValue(latest, ["Severity"]) : "";
  const detail = [date, city, severity].filter(Boolean).join(", ");
  if (count === 1 && detail) return `1 accident record (${detail}).`;
  return `${count} accident record${count === 1 ? "" : "s"} on file.`;
}

function lienReleased(report: VehicleReport): boolean {
  const records = sectionOf(report, "liens")?.records ?? [];
  if (records.length === 0) return false;
  return records.every((fields) => {
    const blob = `${fieldValue(fields, ["Status", "Released"])} ${recordBlob(fields)}`;
    return /released/i.test(blob) && !/not (?:shown as )?released/i.test(blob);
  });
}

function recallReason(report: VehicleReport, count: number): string {
  const records = sectionOf(report, "recalls")?.records ?? [];
  const component = records[0] ? fieldValue(records[0], ["Component", "Campaign"]) : "";
  if (count === 1 && component) return `1 open recall (${component}).`;
  return `${count} open recall campaign${count === 1 ? "" : "s"} listed.`;
}

function odometerUnit(readings: OdometerReading[]): string {
  return readings[0]?.unit || "mi";
}

/**
 * Transparent tally: start at 100, subtract what the records show.
 *
 * Clear checks stay on the breakdown as "helps" with a 0 delta so the buyer
 * can see what was searched. A long, climbing post-salvage window is the only
 * bonus — it does not invent a repair, it only credits later title/odometer
 * facts after a salvage-channel date.
 */
export function reportHealth(incoming: VehicleReport): ReportHealth {
  const report = withResolvedDispositions(incoming);
  const factors: HealthFactor[] = [];
  const titles = checkOf(report, "titles");
  const titleCount = titles?.count ?? sectionOf(report, "titles")?.records.length ?? 0;
  const branded = checkOf(report, "branded");
  const salvage = salvagePresent(report);

  if (titleCount === 0) {
    factors.push({
      key: "titles",
      label: "Title records",
      impact: "hurts",
      delta: -8,
      reason: "No title records came back, so the history this score can see is thin.",
    });
  } else {
    factors.push({
      key: "titles",
      label: "Title records",
      impact: "helps",
      delta: 0,
      reason: `${titleCount} title record${titleCount === 1 ? "" : "s"} on file.`,
    });
  }

  if (salvage) {
    factors.push({
      key: "salvage",
      label: "Salvage & title brand",
      impact: "hurts",
      delta: -22,
      reason: salvageReason(report),
    });
    const after = postSalvageFactor(report);
    if (after) factors.push(after);
  } else if (titleCount > 0 || branded?.status === "clear") {
    factors.push({
      key: "salvage",
      label: "Salvage & title brand",
      impact: "helps",
      delta: 0,
      reason: `No salvage, junk or insurance-loss brand on ${titleCount || "the"} title record${titleCount === 1 ? "" : "s"}.`,
    });
  }

  const accidentCount = issueCount(report, "accidents");
  if (accidentCount === null) {
    /* This report never ran the check. */
  } else if (accidentCount > 0) {
    factors.push({
      key: "accidents",
      label: "Accidents",
      impact: "hurts",
      delta: -Math.min(18, 6 + 4 * (accidentCount - 1)),
      reason: accidentReason(report, accidentCount),
    });
  } else {
    factors.push({
      key: "accidents",
      label: "Accidents",
      impact: "helps",
      delta: 0,
      reason: "No accident records on file.",
    });
  }

  const theftCount = issueCount(report, "thefts");
  if (theftCount !== null && theftCount > 0) {
    factors.push({
      key: "thefts",
      label: "Thefts",
      impact: "hurts",
      delta: -16,
      reason: `${theftCount} theft record${theftCount === 1 ? "" : "s"} on file.`,
    });
  } else if (theftCount === 0) {
    factors.push({
      key: "thefts",
      label: "Thefts",
      impact: "helps",
      delta: 0,
      reason: "No theft records on file.",
    });
  }

  const lienCount = issueCount(report, "liens");
  if (lienCount !== null && lienCount > 0) {
    const released = lienReleased(report);
    factors.push({
      key: "liens",
      label: "Liens",
      impact: "hurts",
      delta: released ? -4 : -12,
      reason: released
        ? `${lienCount} lien${lienCount === 1 ? "" : "s"} on file, shown as released.`
        : `${lienCount} lien${lienCount === 1 ? "" : "s"} on file, not shown as released.`,
    });
  } else if (lienCount === 0) {
    factors.push({
      key: "liens",
      label: "Liens",
      impact: "helps",
      delta: 0,
      reason: "No lien or repossession records on file.",
    });
  }

  const impoundCount = issueCount(report, "impounds");
  if (impoundCount !== null && impoundCount > 0) {
    factors.push({
      key: "impounds",
      label: "Impounds",
      impact: "hurts",
      delta: -8,
      reason: `${impoundCount} impound record${impoundCount === 1 ? "" : "s"} on file.`,
    });
  } else if (impoundCount === 0) {
    factors.push({
      key: "impounds",
      label: "Impounds",
      impact: "helps",
      delta: 0,
      reason: "No impound records on file.",
    });
  }

  const exportCount = issueCount(report, "exports");
  if (exportCount !== null && exportCount > 0) {
    factors.push({
      key: "exports",
      label: "Exports",
      impact: "hurts",
      delta: -12,
      reason: `${exportCount} export record${exportCount === 1 ? "" : "s"} on file.`,
    });
  } else if (exportCount === 0) {
    factors.push({
      key: "exports",
      label: "Exports",
      impact: "helps",
      delta: 0,
      reason: "No export records on file.",
    });
  }

  const recallCount = issueCount(report, "recalls");
  if (recallCount !== null && recallCount > 0) {
    factors.push({
      key: "recalls",
      label: "Recalls",
      impact: "hurts",
      delta: -Math.min(12, 5 * recallCount),
      reason: recallReason(report, recallCount),
    });
  } else if (recallCount === 0) {
    factors.push({
      key: "recalls",
      label: "Recalls",
      impact: "helps",
      delta: 0,
      reason: "No open recall campaigns listed.",
    });
  }

  if (report.odometer.length === 0) {
    factors.push({
      key: "odometer",
      label: "Odometer",
      impact: "neutral",
      delta: 0,
      reason: "No odometer readings were attached to the title events.",
    });
  } else if (hasOdometerRollback(report.odometer)) {
    factors.push({
      key: "odometer",
      label: "Odometer",
      impact: "hurts",
      delta: -18,
      reason: "A later odometer reading is lower than an earlier one.",
    });
  } else {
    const first = report.odometer[0];
    const last = report.odometer[report.odometer.length - 1];
    const unit = odometerUnit(report.odometer);
    factors.push({
      key: "odometer",
      label: "Odometer",
      impact: "helps",
      delta: 0,
      reason: `Mileage readings rise consistently from ${formatMiles(first.value, unit)} to ${formatMiles(last.value, unit)}.`,
    });
  }

  const tallied = clampScore(100 + factors.reduce((sum, factor) => sum + factor.delta, 0));
  const score = salvage ? Math.min(tallied, SALVAGE_SCORE_CAP) : tallied;
  const earliestIso = earliestSalvageIso(report);
  const after = factors.find((factor) => factor.key === "post-salvage");

  return {
    score,
    label: healthLabel(score),
    disclaimer: HEALTH_DISCLAIMER,
    factors,
    salvage: {
      present: salvage,
      earliestIso,
      post: !salvage
        ? null
        : after?.impact === "helps"
          ? "long"
          : after?.reason.startsWith("No title or odometer")
            ? "none"
            : "short",
    },
  };
}
