import { NextResponse } from "next/server";

import { pdfFileResponse, pdfForSampleReport } from "@/lib/report-pdf-serve";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Public SAMPLE-labelled PDF of the fictional demo report.
 *
 * Same renderer as the paid download and the receipt attachment, filled with
 * the sample fixtures so `/sample` never spends a provider token.
 */
export async function GET(request: Request) {
  const limit = rateLimit(`sample-pdf:${clientIp(request)}`, 12, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many download requests. Try again shortly." },
      {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  try {
    const { buffer, filename } = await pdfForSampleReport();
    return pdfFileResponse(buffer, filename);
  } catch (error) {
    console.error("[pdf] sample render failed", error);
    return NextResponse.json(
      { error: "Couldn't prepare the PDF." },
      { status: 500, headers: NO_STORE },
    );
  }
}
