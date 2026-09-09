import { isFalConfigured } from "@/lib/config";
import { withCurrentLayout } from "@/lib/report-layout";
import { getStore } from "@/lib/store";
import type { Order, VehicleHeroRecord } from "@/lib/store";
import { generateVehicleHero, HERO_CACHE_VERSION, heroFacts } from "@/lib/vehicle-hero";

export type HeroOutcome =
  | { status: "ready"; hero: VehicleHeroRecord; cached: boolean }
  | { status: "unavailable"; reason: string };

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

  try {
    const cached = await store.getVehicleHero(facts.cacheKey);
    if (cached) return { status: "ready", hero: cached, cached: true };
  } catch (error) {
    console.error(`[hero] could not read the cache for ${facts.cacheKey}`, error);
  }

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
