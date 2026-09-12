/**
 * Shared assembly for the forwardable report PDF — receipt attachment and
 * the Download button both come through here so there is one renderer.
 *
 * Paid downloads are gated on the same unguessable access token as the
 * report page. The sample is public and always labelled SAMPLE.
 */
import type { VehicleBrief } from "@/lib/ai-brief";
import { extrasForReport } from "@/lib/model-extras";
import type { ModelExtras } from "@/lib/model-extras";
import type { VehicleReport } from "@/lib/report";
import { heroSrcForPdf } from "@/lib/report-pdf-hero";
import { withCurrentLayout } from "@/lib/report-layout";
import { renderReportPdf, reportPdfFilename } from "@/lib/report-pdf";
import {
  buildSampleBrief,
  buildSampleModelExtras,
  buildSampleReport,
  SAMPLE_VIN,
} from "@/lib/sample-report";
import { getStore, type Order, type OrderStore } from "@/lib/store";

export const SAMPLE_REPORT_PDF_PATH = "/api/sample/pdf";

export function paidReportPdfPath(token: string): string {
  return `/api/report/${encodeURIComponent(token)}/pdf`;
}

export type PaidReportPdf =
  | { ok: true; buffer: Buffer; filename: string }
  | { ok: false; status: 404 };

/**
 * One renderer for the receipt attachment and both download endpoints.
 *
 * Looks up a cached hero (or the sample PNG) and soft-fails to no picture.
 * Does not call fal — a PDF must not wait on a drawing that is still drafting.
 */
export async function renderStoredReportPdf(
  report: VehicleReport,
  brief: VehicleBrief | null = null,
  extras: ModelExtras | null = null,
  store?: OrderStore,
): Promise<Buffer> {
  const heroSrc = await heroSrcForPdf(report, store);
  return renderReportPdf(report, brief, extras, heroSrc);
}

export async function renderOrderReportPdf(
  order: Order,
  extras: ModelExtras | null = null,
  store: OrderStore = getStore(),
): Promise<Buffer> {
  if (!order.report) throw new Error("no report to render");
  return renderStoredReportPdf(
    withCurrentLayout(order.report),
    order.aiBrief,
    extras,
    store,
  );
}

/**
 * Renders the PDF a buyer with this report token is allowed to download.
 *
 * Missing, unpaid, or undelivered orders all look the same from the outside
 * (404) so a guessed token cannot be told apart from a real one that is
 * still waiting on fulfillment.
 */
export async function pdfForPaidReport(
  token: string,
  store: OrderStore = getStore(),
): Promise<PaidReportPdf> {
  const accessToken = token.trim();
  if (!accessToken) return { ok: false, status: 404 };

  await store.init();
  const order = await store.getByAccessToken(accessToken);
  if (!order?.report) return { ok: false, status: 404 };

  const extras = await extrasForReport(
    withCurrentLayout(order.report),
    store,
  ).catch((error) => {
    console.error(`[pdf] model extras failed for order ${order.id}`, error);
    return null;
  });

  const buffer = await renderOrderReportPdf(order, extras, store);
  return { ok: true, buffer, filename: reportPdfFilename(order.vin) };
}

export async function pdfForSampleReport(): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const buffer = await renderStoredReportPdf(
    buildSampleReport(),
    buildSampleBrief(),
    buildSampleModelExtras(),
  );
  return { buffer, filename: reportPdfFilename(SAMPLE_VIN, true) };
}

export function pdfFileResponse(buffer: Buffer, filename: string): Response {
  return new Response(Uint8Array.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
