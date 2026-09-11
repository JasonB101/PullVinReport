import { NextResponse } from "next/server";

import { extrasForReport, hasModelExtras } from "@/lib/model-extras";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { withCurrentLayout } from "@/lib/report-layout";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function unavailable(status = 200) {
  return NextResponse.json({ status: "unavailable" }, { status, headers: NO_STORE });
}

/**
 * Public NHTSA / EPA extras for the year/make/model on one paid report.
 *
 * The report page asks for this after the records are already on screen, so a
 * slow government API delays nothing the buyer paid for. Cached by YMM on the
 * store — not per order — and the access token travels in the body to keep it
 * out of request logs.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`extras:${clientIp(request)}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { status: "unavailable" },
      {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return unavailable(400);
  }

  const token =
    typeof body === "object" && body !== null && "token" in body
      ? String((body as { token?: unknown }).token ?? "")
      : "";
  if (!token) return unavailable(400);

  const store = getStore();
  await store.init();
  const order = await store.getByAccessToken(token);
  if (!order || !order.report) return unavailable(404);

  const extras = await extrasForReport(withCurrentLayout(order.report), store);
  if (!hasModelExtras(extras)) return unavailable();

  return NextResponse.json({ status: "ready", extras }, { headers: NO_STORE });
}
