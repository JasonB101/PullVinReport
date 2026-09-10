import { isFalConfigured } from "@/lib/config";
import type { VehicleReport } from "@/lib/report";
import { withCurrentLayout } from "@/lib/report-layout";
import { getStore } from "@/lib/store";
import type { Order, OrderStore, VehicleHeroRecord } from "@/lib/store";
import { generateVehicleHero, HERO_CACHE_VERSION, heroFacts } from "@/lib/vehicle-hero";

export type HeroOutcome =
  | { status: "ready"; hero: VehicleHeroRecord; cached: boolean }
  | { status: "unavailable"; reason: string };

/**
 * A cached drawing only. Never starts a generate — PDF render and a first
 * page view must not block on fal. Missing key, empty cache or a read
 * error all become `null`.
 */
export async function cachedHeroForReport(
  report: VehicleReport,
  store: OrderStore = getStore(),
): Promise<VehicleHeroRecord | null> {
  const facts = heroFacts(withCurrentLayout(report));
  if (!facts) return null;
  try {
    await store.init();
    return await store.getVehicleHero(facts.cacheKey);
  } catch (error) {
    console.error(`[hero] could not read the cache for ${facts.cacheKey}`, error);
    return null;
  }
}

/**
 * The order's illustrated hero, generated once per year/make/model/trim/color.
 *
 * Cached on the store by that key — not by VIN — so another order for the
 * same example reuses the drawing. A page view never blocks on this; missing
 * key or a failed call leave the report as it was.
 */
export async function heroForOrder(order: Order): Promise<HeroOutcome> {
  if (!order.report) {
    return { status: "unavailable", reason: "this order has no report yet" };
  }

  const report = withCurrentLayout(order.report);
  const facts = heroFacts(report);
  if (!facts) {
    return { status: "unavailable", reason: "the report does not name a vehicle" };
  }

  const store = getStore();
  await store.init();
  try {
    await store.clearStaleVehicleHeroes(`${HERO_CACHE_VERSION}|`);
  } catch (error) {
    console.error("[hero] could not drop stale cached drawings", error);
  }

  const cached = await cachedHeroForReport(report, store);
  if (cached) return { status: "ready", hero: cached, cached: true };

  if (!isFalConfigured()) {
    return { status: "unavailable", reason: "FAL_KEY is not set" };
  }

  const hero = await generateVehicleHero(report);
  if (!hero) {
    return { status: "unavailable", reason: "the illustration could not be drawn" };
  }

  try {
    await store.saveVehicleHero(hero);
  } catch (error) {
    console.error(`[hero] could not cache the illustration for ${facts.cacheKey}`, error);
  }

  return { status: "ready", hero, cached: false };
}
