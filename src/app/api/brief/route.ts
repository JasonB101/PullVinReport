import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { briefForOrder } from "@/lib/order-brief";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Everything a caller learns when they are not entitled to a brief. */
function unavailable(status = 200) {
  return NextResponse.json({ status: "unavailable" }, { status, headers: NO_STORE });
}

/**
 * Writes (or returns the cached) brief for one order.
 *
 * The report page asks for this after it has already rendered, so a slow or
 * failing model delays nothing the buyer paid for. The access token travels in
 * the body rather than the query string to keep it out of request logs, and a
 * rewrite — which spends tokens — is an operator action, not something a
 * repeated page view can trigger.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`brief:${clientIp(request)}`, 12, 60_000);
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

  const wantsRefresh =
    typeof body === "object" &&
    body !== null &&
    (body as { refresh?: unknown }).refresh === true;
  const refresh = wantsRefresh && (await isAdminAuthenticated());

  const outcome = await briefForOrder(order, { refresh });
  if (outcome.status !== "ready") {
    console.info(`[brief] not served for order ${order.id}: ${outcome.reason}`);
    return unavailable();
  }

  return NextResponse.json(
    { status: "ready", brief: outcome.brief },
    { headers: NO_STORE },
  );
}
