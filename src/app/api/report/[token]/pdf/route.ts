import { NextResponse } from "next/server";

import { pdfFileResponse, pdfForPaidReport } from "@/lib/report-pdf-serve";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Server-generated PDF for one paid report.
 *
 * The access token in the path is the same unguessable token that opens
 * `/report/[token]`. A guessed or unpaid token gets 404 with no extra detail.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const limit = rateLimit(`report-pdf:${clientIp(request)}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many download requests. Try again shortly." },
      {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const { token } = await params;

  try {
    const result = await pdfForPaidReport(token);
    if (!result.ok) {
      return NextResponse.json(
        { error: "Report PDF is not available." },
        { status: result.status, headers: NO_STORE },
      );
    }
    return pdfFileResponse(result.buffer, result.filename);
  } catch (error) {
    console.error("[pdf] paid render failed", error);
    return NextResponse.json(
      { error: "Couldn't prepare the PDF." },
      { status: 500, headers: NO_STORE },
    );
  }
}
