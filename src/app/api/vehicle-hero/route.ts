import { NextResponse } from "next/server";

import { heroForOrder } from "@/lib/order-hero";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function unavailable(status = 200) {
  return NextResponse.json({ status: "unavailable" }, { status, headers: NO_STORE });
}

/**
 * Draws (or returns the cached) illustrated hero for one order.
 *
 * The report page asks for this after it has already rendered, so a slow or
 * failing image delays nothing the buyer paid for. The access token travels in
 * the body rather than the query string to keep it out of request logs.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`hero:${clientIp(request)}`, 12, 60_000);
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

  const outcome = await heroForOrder(order);
  if (outcome.status !== "ready") {
    console.info(`[hero] not served for order ${order.id}: ${outcome.reason}`);
    return unavailable();
  }

  return NextResponse.json(
    {
      status: "ready",
      src: outcome.hero.src,
      contentType: outcome.hero.contentType,
    },
    { headers: NO_STORE },
  );
}
