import { NextResponse } from "next/server";

import { heroForFacts, heroForOrder } from "@/lib/order-hero";
import { decodeVin } from "@/lib/nhtsa";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";
import { heroFactsFromParts } from "@/lib/vehicle-hero";
import { validateVin } from "@/lib/vin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function unavailable(status = 200, reason?: string) {
  return NextResponse.json(
    { status: "unavailable", reason },
    { status, headers: NO_STORE },
  );
}

function ready(src: string, contentType: string) {
  return NextResponse.json(
    { status: "ready", src, contentType },
    { headers: NO_STORE },
  );
}

/**
 * Draws (or returns the cached) illustrated hero.
 *
 * Paid reports send `{ token }`. The pre-pay preview sends `{ vin }` so the
 * same year/make/model cache is filled before checkout — fal is only billed
 * on a family miss. The access token travels in the body rather than the
 * query string to keep it out of request logs.
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

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const token = typeof record.token === "string" ? record.token : "";
  const vin = typeof record.vin === "string" ? record.vin : "";

  if (token) {
    const store = getStore();
    await store.init();
    const order = await store.getByAccessToken(token);
    if (!order || !order.report) return unavailable(404);

    const outcome = await heroForOrder(order);
    if (outcome.status !== "ready") {
      console.info(`[hero] not served for order ${order.id}: ${outcome.reason}`);
      return unavailable();
    }
    return ready(outcome.hero.src, outcome.hero.contentType);
  }

  if (vin) {
    const parsed = validateVin(vin);
    if (!parsed.valid) return unavailable(400);

    const decoded = await decodeVin(parsed.vin);
    if (decoded.status !== "decoded") {
      return unavailable(200, "the VIN could not be decoded");
    }

    const facts = heroFactsFromParts(decoded.decode.vehicle);
    if (!facts) return unavailable(200, "the decode does not name a vehicle");

    const outcome = await heroForFacts(facts);
    if (outcome.status !== "ready") {
      console.info(`[hero] not served for VIN family ${facts.cacheKey}: ${outcome.reason}`);
      return unavailable();
    }
    return ready(outcome.hero.src, outcome.hero.contentType);
  }

  return unavailable(400);
}
