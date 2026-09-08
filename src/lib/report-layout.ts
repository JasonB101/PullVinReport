import type { VehicleReport } from "@/lib/report";
import { normalizeVinAuditReport } from "@/lib/vinaudit";

function isPayload(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Re-derives a stored report's presentation from the payload it was built from.
 *
 * A report is stored as JSON the moment it is pulled, so without this an order
 * bought before a layout change would render in the old shape forever. The
 * records are rebuilt from the payload we already hold — no second pull, no cost
 * — and the facts that belong to the order rather than the layout, notably when
 * the report was generated, are carried across untouched.
 *
 * A stored payload we can no longer parse falls back to what was stored, so a
 * buyer never loses the report they paid for to a presentation change.
 */
export function withCurrentLayout(report: VehicleReport): VehicleReport {
  if (report.isSample || !isPayload(report.raw)) return report;

  try {
    const rebuilt = normalizeVinAuditReport(report.raw, report.vin);
    return { ...rebuilt, generatedAt: report.generatedAt };
  } catch (error) {
    console.error("[report] could not rebuild a stored report's layout", error);
    return report;
  }
}
